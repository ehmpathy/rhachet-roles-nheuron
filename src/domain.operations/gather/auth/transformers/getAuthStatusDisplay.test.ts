import { given, then, when } from 'test-fns';

import { getAuthFixHintForMechanism } from './getAuthFixHintForMechanism';
import { getAuthStatusDisplay } from './getAuthStatusDisplay';

describe('getAuthStatusDisplay', () => {
  given('[case1] authenticated status with address', () => {
    when('[t0] formatted', () => {
      then('shows ready message', () => {
        const result = getAuthStatusDisplay({
          status: 'authenticated',
          mechanism: 'ses',
          address: 'test@example.com',
        });
        expect(result).toContain('boop! auth ready');
        expect(result).toContain('status: authenticated');
        expect(result).toContain('address: test@example.com');
      });
    });
  });

  given('[case2] expired status', () => {
    when('[t0] formatted', () => {
      then('shows expired message with hint', () => {
        const result = getAuthStatusDisplay({
          status: 'expired',
          mechanism: 'ses',
          address: 'test@example.com',
        });
        expect(result).toContain('boop! auth expired');
        expect(result).toContain('status: expired');
        expect(result).toContain('token will refresh');
      });
    });
  });

  given('[case3] anonymous status', () => {
    when('[t0] formatted', () => {
      then('shows needed message with hint', () => {
        const result = getAuthStatusDisplay({
          status: 'anonymous',
          mechanism: 'ses',
          address: null,
        });
        expect(result).toContain('boop! auth needed');
        expect(result).toContain('status: anonymous');
        // ⚠️ asserted against the shared source, never a re-typed copy. a line that holds
        // its own text drifts from the copy the thrown refusal uses — one human, one tool,
        // one question, two answers. the import is what makes a drift impossible
        expect(result).toContain(
          getAuthFixHintForMechanism({ mechanism: 'ses' }),
        );
        expect(result).not.toContain('address:');
      });
    });
  });

  given('[case4] the ses mechanism', () => {
    when('[t0] formatted', () => {
      then('shows mechanism in skill header', () => {
        const result = getAuthStatusDisplay({
          status: 'authenticated',
          mechanism: 'ses',
          address: 'test@example.com',
        });
        expect(result).toContain('gather.auth --from ses');
      });
    });
  });

  /**
   * .what = clamps that an anonymous SES human is sent at the fix that WORKS
   * .why = `gather.auth --from ses` throws 'ses needs no auth flow' — ses has no interactive
   *   grant. so the generic 'run gather.auth to authenticate' hint sent an anonymous ses
   *   human at a command that refuses them, which is worse than no hint at all
   *   (`rule.require.errors-name-the-fix`). the real fix is a keyrack unlock.
   */
  given('[case5] anonymous status on the ses mechanism', () => {
    when('[t0] formatted', () => {
      then('names the keyrack unlock, never gather.auth', () => {
        const result = getAuthStatusDisplay({
          status: 'anonymous',
          mechanism: 'ses',
          address: 'jelly@one.nheuron.com',
        });
        expect(result).toContain('status: anonymous');
        expect(result).toContain(
          'run: rhx keyrack unlock --owner ehmpath --env prep',
        );
        // the hint must not send them at the command that throws
        expect(result).not.toContain('run gather.auth --from ses');
      });

      then('renders as a treestruct, the hint as the last leaf', () => {
        const result = getAuthStatusDisplay({
          status: 'anonymous',
          mechanism: 'ses',
          address: 'jelly@one.nheuron.com',
        });
        expect(result).toEqual(
          [
            '🪼 boop! auth needed',
            '',
            '🔑 gather.auth --from ses',
            '   ├─ status: anonymous',
            '   ├─ address: jelly@one.nheuron.com',
            '   └─ hint: ses authenticates via AWS_PROFILE. run: rhx keyrack unlock --owner ehmpath --env prep',
          ].join('\n'),
        );
      });
    });
  });

  given('[case6] authenticated status, no hint', () => {
    when('[t0] formatted', () => {
      then('the last fact closes the trunk', () => {
        const result = getAuthStatusDisplay({
          status: 'authenticated',
          mechanism: 'ses',
          address: 'test-authenticated@example.com',
        });
        expect(result).toEqual(
          [
            '🪼 boop! auth ready',
            '',
            '🔑 gather.auth --from ses',
            '   ├─ status: authenticated',
            '   └─ address: test-authenticated@example.com',
          ].join('\n'),
        );
      });
    });
  });
});
