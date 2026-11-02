import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getAuthFixHintForMechanism } from '@src/domain.operations/gather/auth/transformers/getAuthFixHintForMechanism';

import { getAuthenticatedOrThrow } from './getAuthenticatedOrThrow';

describe('getAuthenticatedOrThrow', () => {
  given('[case1] authenticated status', () => {
    when('[t0] the status is checked', () => {
      then('does not throw', () => {
        expect(() =>
          getAuthenticatedOrThrow({
            status: 'authenticated',
            mechanism: 'gmail',
          }),
        ).not.toThrow();
      });
    });
  });

  given('[case2] expired status', () => {
    when('[t0] the status is checked', () => {
      then('does not throw (allows caller to refresh)', () => {
        expect(() =>
          getAuthenticatedOrThrow({ status: 'expired', mechanism: 'gmail' }),
        ).not.toThrow();
      });
    });
  });

  given('[case3] anonymous status', () => {
    when('[t0] the status is checked for gmail', () => {
      then('throws BadRequestError with hint', async () => {
        const error = await getError(() =>
          getAuthenticatedOrThrow({ status: 'anonymous', mechanism: 'gmail' }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('not authenticated');

        // ⚠️ asserted against the shared source, never a re-typed copy. THIS LINE HELD THE
        // DEFECT IN PLACE: it pinned `gather.auth --from gmail' to authenticate`, and that
        // command throws `gmail has no interactive auth flow` and exits 2 — so a green test
        // was the reason a hint which misdirects a human survived every review. a test that
        // re-types a message asserts only that somebody typed it twice
        expect(error.message).toContain(
          getAuthFixHintForMechanism({ mechanism: 'gmail' }),
        );
        expect(error.message).toContain('GMAIL_SERVICE_ACCOUNT_JSON');
        expect(error.message).not.toContain('gather.auth');
      });
    });

    /**
     * .what = clamps that the SES hint names the fix that WORKS
     * .why = the hint once read `run 'gather.auth --from ses' to authenticate` for EVERY
     *   mechanism — but `gather.auth --from ses` throws 'ses needs no auth flow', because
     *   ses has no interactive grant at all. an error that names a command which refuses
     *   you is worse than an error with no hint (`rule.require.errors-name-the-fix`).
     *
     * ⚠️ .note = this case existed and its GMAIL peer above did not, which is exactly why
     *   the gmail branch kept the defect this case was written to prevent. an invariant
     *   asserted for one member of a union holds only for that member.
     */
    when('[t1] the status is checked for ses', () => {
      then('names the keyrack unlock for ses, never gather.auth', async () => {
        const error = await getError(() =>
          getAuthenticatedOrThrow({ status: 'anonymous', mechanism: 'ses' }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('not authenticated');
        expect(error.message).toContain('AWS_PROFILE');
        expect(error.message).toContain(
          'rhx keyrack unlock --owner ehmpath --env prep',
        );
        // the gmail fix must not leak into the ses error
        expect(error.message).not.toContain(
          "gather.auth --from ses' to authenticate",
        );
      });
    });
  });
});
