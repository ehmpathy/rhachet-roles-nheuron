import * as os from 'os';
import * as path from 'path';
import { getError, given, then, when } from 'test-fns';

import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { getAuthFixHintForMechanism } from '@src/domain.operations/gather/auth/transformers/getAuthFixHintForMechanism';

import { getGmailAuthAdapter } from './getGmailAuthAdapter';

const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * .what = clamps that a refresh failure names a fix that WORKS
 * .why = ⚠️ both throws in `genAuthRefresh` read `run gather.auth to re-authenticate` — a
 *   command that cannot re-authenticate anyone for gmail, because `genAuth` in the same file
 *   throws `gmail has no interactive auth flow` and exits 2. the operation contradicted its
 *   own neighbour, and the human who followed the hint was bounced through that refusal
 *   before they could reach the fix that works (`rule.require.errors-name-the-fix`).
 *
 * ⚠️ .note = this is the SAME defect `getAuthFixHintForMechanism` was extracted to close, and
 *   it lived on in two call sites the extraction did not reach. the durable lesson: to
 *   correct one copy of a duplicated string leaves every other copy exactly as wrong, and the
 *   extraction pays only once every caller delegates. so the assertion below compares against
 *   the shared source rather than a re-typed literal — a test that re-types the message
 *   asserts only that somebody typed it twice.
 *
 * .note = integration, not unit: the branch under test reads the token cache off disk. the
 *   cwd is an empty temp dir, so the read finds no token, which is the state a human is in
 *   before they have ever authenticated (`rule.forbid.unit.remote-boundaries`).
 */
describe('getGmailAuthAdapter.genAuthRefresh', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-auth-refresh-test',
    Date.now().toString(),
  );

  const repo = new GatheredMailRepo({
    mechanism: 'gmail',
    address: 'jelly@nheuron.com',
  });

  given('[case1] no token has ever been cached', () => {
    when('[t0] a refresh is attempted', () => {
      then('it refuses, since there is no refresh token to spend', async () => {
        const error = await getError(() =>
          getGmailAuthAdapter({ cwd: testDir }).genAuthRefresh(
            { repo },
            { log },
          ),
        );

        expect(error.message).toContain('no refresh token found');
      });

      then('the hint names the fix that works', async () => {
        const error = await getError(() =>
          getGmailAuthAdapter({ cwd: testDir }).genAuthRefresh(
            { repo },
            { log },
          ),
        );

        // asserted against the shared source, never a re-typed copy
        expect(error.message).toContain(
          getAuthFixHintForMechanism({ mechanism: 'gmail' }),
        );
        expect(error.message).toContain('GMAIL_SERVICE_ACCOUNT_JSON');
      });

      then(
        'the hint does NOT name a command that refuses the human',
        async () => {
          // ⚠️ the teeth. `gather.auth --from gmail` throws `gmail has no interactive auth
          // flow` and exits 2, so a hint that names it sends the human at a dead end
          const error = await getError(() =>
            getGmailAuthAdapter({ cwd: testDir }).genAuthRefresh(
              { repo },
              { log },
            ),
          );

          expect(error.message).not.toContain('gather.auth');
        },
      );
    });
  });
});
