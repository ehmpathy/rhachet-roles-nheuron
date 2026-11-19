import { given, then, when } from 'test-fns';

import { VALID_MECHANISMS } from '@src/domain.objects/GatheredMailMechanism';
import { getAuthenticatedOrThrow } from '@src/domain.operations/gather/mail/transformers/getAuthenticatedOrThrow';

import { getAuthFixHintForMechanism } from './getAuthFixHintForMechanism';
import { getAuthStatusDisplay } from './getAuthStatusDisplay';

describe('getAuthFixHintForMechanism', () => {
  given('[case1] the ses mechanism — it has NO interactive grant', () => {
    when('[t0] a human reads anonymous', () => {
      then('the hint names the keyrack unlock', () => {
        expect(getAuthFixHintForMechanism({ mechanism: 'ses' })).toContain(
          'rhx keyrack unlock --owner ehmpath --env prep',
        );
      });

      then('it does NOT send them at gather.auth, which refuses them', () => {
        // ⚠️ `gather.auth --from ses` throws 'ses needs no auth flow'. a hint that names a
        // command which refuses the human is worse than no hint at all
        expect(getAuthFixHintForMechanism({ mechanism: 'ses' })).not.toContain(
          'gather.auth',
        );
      });
    });
  });

  /**
   * .what = NO mechanism's hint may name `gather.auth`
   * .why = ⚠️ a rule asserted case-by-case is a rule that holds only where somebody
   *   remembered it. this walks `VALID_MECHANISMS`, so it covers a mechanism added tomorrow
   *   as well.
   *
   *   the invariant is real and general: `gather.auth` is a STATUS CHECK, never a grant.
   *   the adapter's `genAuth` throws. no fix hint may point at it.
   */
  given('[case2] every mechanism the union declares', () => {
    when('[t0] each is asked for its hint', () => {
      then('each yields a non-empty, actionable line', () => {
        for (const mechanism of VALID_MECHANISMS) {
          expect(
            getAuthFixHintForMechanism({ mechanism }).length,
          ).toBeGreaterThan(0);
          expect(getAuthFixHintForMechanism({ mechanism })).toContain('run');
        }
      });

      then('NOT ONE names gather.auth — no mechanism has a grant flow', () => {
        for (const mechanism of VALID_MECHANISMS) {
          expect(getAuthFixHintForMechanism({ mechanism })).not.toContain(
            'gather.auth',
          );
        }
      });

      then('each names the keyrack unlock, which is the real fix', () => {
        for (const mechanism of VALID_MECHANISMS) {
          expect(getAuthFixHintForMechanism({ mechanism })).toContain(
            'rhx keyrack unlock',
          );
        }
      });
    });
  });

  /**
   * .what = the clamp on the defect this transformer was extracted to close
   * .why = ⚠️ the fix text appears in TWO places — the status display and the thrown
   *   refusal. two copies drift, and then one human, on one tool, asks "how do i
   *   authenticate?" two ways and gets two answers (`rule.require.ubiqlang`).
   *
   *   this asserts the two SURFACES agree, rather than that either matches a literal — so
   *   a future edit to the shared source keeps them equal, and a future re-hardcode of
   *   either copy goes red.
   */
  given('[case3] the two surfaces a human meets when anonymous', () => {
    for (const mechanism of VALID_MECHANISMS) {
      when(`[t0] the mechanism is ${mechanism}`, () => {
        then('the displayed hint and the thrown hint are the SAME text', () => {
          const displayed = getAuthStatusDisplay({
            status: 'anonymous',
            mechanism,
            address: null,
          });

          const thrown = (() => {
            try {
              getAuthenticatedOrThrow({ status: 'anonymous', mechanism });
              throw new Error('expected a refusal, got none');
            } catch (error) {
              return error as Error & { metadata?: { hint?: string } };
            }
          })();

          const hint = getAuthFixHintForMechanism({ mechanism });
          expect(displayed).toContain(hint);
          expect(JSON.stringify(thrown.metadata ?? thrown.message)).toContain(
            hint,
          );
        });
      });
    }
  });
});
