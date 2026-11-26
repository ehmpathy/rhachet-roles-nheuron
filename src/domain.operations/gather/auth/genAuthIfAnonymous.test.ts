import { given, then, useBeforeAll, when } from 'test-fns';

import { getGmailAuthAdapter } from '@src/domain.operations/gather/adapters/gmail/auth/getGmailAuthAdapter';
import { getSesAuthAdapter } from '@src/domain.operations/gather/adapters/ses/auth/getSesAuthAdapter';

import { genAuthIfAnonymous } from './genAuthIfAnonymous';

const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * .what = read the error a `genAuth` throw produced, or null when it did not throw
 * .why = both mechanisms REFUSE here, so the message IS the behavior under test — there is
 *   no return value to read
 */
const getThrown = async (input: {
  run: () => Promise<unknown>;
}): Promise<Error | null> => {
  try {
    await input.run();
    return null;
  } catch (error) {
    return error as Error;
  }
};

/**
 * .what = clamps that an anonymous `gather.auth` names a fix the human can actually take
 * .why = NEITHER mechanism has an interactive auth flow, so this step's whole job is to
 *   refuse well. gmail's refusal once read "oauth flow not yet implemented — this will be
 *   implemented in genGmailAuth orchestrator": it named a file that does not exist, told the
 *   human to wait, and never mentioned the service account that works TODAY. an error that
 *   misdirects costs more than one with no hint at all
 *   (`rule.require.errors-name-the-fix`).
 *
 * .note = the step is LIVE, not dead. `gather.auth --from <m>` with no `--address` reaches it
 *   on every unauthenticated run, so these messages are what a human meets first.
 */
describe('genAuthIfAnonymous', () => {
  given('[case1] an anonymous status on gmail', () => {
    const error = useBeforeAll(async () => ({
      of: await getThrown({
        run: async () =>
          genAuthIfAnonymous(
            {
              status: 'anonymous',
              authAdapter: getGmailAuthAdapter({ cwd: null }),
            },
            { log },
          ),
      }),
    }));

    when('[t0] the flow is asked for', () => {
      then('it refuses, and says WHY there is no flow', () => {
        expect(error.of?.message).toContain('no interactive auth flow');
      });

      then('it names the service account keys, never a future file', () => {
        // ⚠️ the teeth. the prior message pointed at `genGmailAuth`, an orchestrator that
        // does not exist — so a human read "wait for an implementation" when a live path
        // was already in front of them
        const said = JSON.stringify(error.of);
        expect(said).toContain('GMAIL_SERVICE_ACCOUNT_JSON');
        expect(said).toContain('GMAIL_SERVICE_ACCOUNT_SUBJECT');
        expect(said).not.toContain('genGmailAuth');
        expect(said).not.toContain('not yet implemented');
      });

      then('the fix is a command, never a description', () => {
        expect(JSON.stringify(error.of)).toContain('rhx keyrack');
      });
    });
  });

  given('[case2] an anonymous status on ses', () => {
    const error = useBeforeAll(async () => ({
      of: await getThrown({
        run: async () =>
          genAuthIfAnonymous(
            { status: 'anonymous', authAdapter: getSesAuthAdapter() },
            { log },
          ),
      }),
    }));

    when('[t0] the flow is asked for', () => {
      then('it refuses — iam grants no interactive flow either', () => {
        expect(error.of?.message).toContain('no auth flow');
      });

      then('the fix is the keyrack unlock, named as a command', () => {
        expect(JSON.stringify(error.of)).toContain('rhx keyrack unlock');
      });
    });
  });

  given('[case3] an already-authenticated status', () => {
    when('[t0] the flow is asked for', () => {
      then('it returns early and never reaches the refusal', async () => {
        // ⚠️ without this case, an implementation that threw unconditionally would pass
        // case1 and case2 while it broke every authenticated run
        const result = await genAuthIfAnonymous(
          {
            status: 'authenticated',
            authAdapter: getSesAuthAdapter(),
          },
          { log },
        );

        expect(result.status).toEqual('authenticated');
      });
    });
  });
});
