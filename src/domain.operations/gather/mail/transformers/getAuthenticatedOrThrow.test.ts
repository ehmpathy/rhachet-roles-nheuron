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
            mechanism: 'ses',
          }),
        ).not.toThrow();
      });
    });
  });

  given('[case2] expired status', () => {
    when('[t0] the status is checked', () => {
      then('does not throw (allows caller to refresh)', () => {
        expect(() =>
          getAuthenticatedOrThrow({ status: 'expired', mechanism: 'ses' }),
        ).not.toThrow();
      });
    });
  });

  given('[case3] anonymous status', () => {
    when('[t0] the status is checked', () => {
      then('throws BadRequestError with the shared hint', async () => {
        const error = await getError(() =>
          getAuthenticatedOrThrow({ status: 'anonymous', mechanism: 'ses' }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('not authenticated');

        // ⚠️ asserted against the shared source, never a re-typed copy. a test that
        // re-types a message asserts only that somebody typed it twice
        expect(error.message).toContain(
          getAuthFixHintForMechanism({ mechanism: 'ses' }),
        );
        expect(error.message).not.toContain('gather.auth');
      });
    });

    /**
     * .what = clamps that the SES hint names the fix that WORKS
     * .why = the hint once read `run 'gather.auth --from ses' to authenticate` — but
     *   `gather.auth --from ses` throws 'ses needs no auth flow', because ses has no
     *   interactive grant at all. an error that names a command which refuses you is worse
     *   than an error with no hint (`rule.require.errors-name-the-fix`).
     */
    when('[t1] the hint is read for its fix', () => {
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
        // the refused command must not reappear as the fix
        expect(error.message).not.toContain(
          "gather.auth --from ses' to authenticate",
        );
      });
    });
  });
});
