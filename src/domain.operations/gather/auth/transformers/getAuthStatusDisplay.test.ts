import { given, then, when } from 'test-fns';

import { getAuthFixHintForMechanism } from './getAuthFixHintForMechanism';
import { getAuthStatusDisplay } from './getAuthStatusDisplay';

describe('getAuthStatusDisplay', () => {
  given('[case1] authenticated status with address', () => {
    when('[t0] formatted', () => {
      then('shows ready message', () => {
        const result = getAuthStatusDisplay({
          status: 'authenticated',
          mechanism: 'gmail',
          address: 'test@gmail.com',
        });
        expect(result).toContain('boop! auth ready');
        expect(result).toContain('status: authenticated');
        expect(result).toContain('address: test@gmail.com');
      });
    });
  });

  given('[case2] expired status', () => {
    when('[t0] formatted', () => {
      then('shows expired message with hint', () => {
        const result = getAuthStatusDisplay({
          status: 'expired',
          mechanism: 'gmail',
          address: 'test@gmail.com',
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
          mechanism: 'gmail',
          address: null,
        });
        expect(result).toContain('boop! auth needed');
        expect(result).toContain('status: anonymous');
        // ⚠️ asserted against the shared source, never a re-typed copy. this line once
        // held its own text, and it had drifted from the copy the thrown refusal used —
        // the display said `run gather.auth --from gmail to authenticate`, the refusal
        // said `run 'gather.auth --from gmail' to authenticate`. one human, one tool, one
        // question, two answers. the import is what makes a future drift impossible
        expect(result).toContain(
          getAuthFixHintForMechanism({ mechanism: 'gmail' }),
        );
        expect(result).not.toContain('address:');
      });
    });
  });

  given('[case4] gmail mechanism', () => {
    when('[t0] formatted', () => {
      then('shows mechanism in skill header', () => {
        const result = getAuthStatusDisplay({
          status: 'authenticated',
          mechanism: 'gmail',
          address: 'test@gmail.com',
        });
        expect(result).toContain('gather.auth --from gmail');
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
    });
  });
});
