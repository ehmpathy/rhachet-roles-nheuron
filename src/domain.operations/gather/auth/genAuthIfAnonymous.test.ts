import { given, then, useBeforeAll, when } from 'test-fns';

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
 * .why = ses REFUSES here, so the message IS the behavior under test — there is no
 *   return value to read
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
 * .why = ses has no interactive auth flow, so this step's whole job is to refuse well. an
 *   error that misdirects costs more than one with no hint at all
 *   (`rule.require.errors-name-the-fix`).
 *
 * .note = the step is LIVE, not dead. `gather.auth --from ses` with no `--address` reaches
 *   it on every unauthenticated run, so this message is what a human meets first.
 */
describe('genAuthIfAnonymous', () => {
  given('[case1] an anonymous status on ses', () => {
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
      then('it refuses — iam grants no interactive flow', () => {
        expect(error.of?.message).toContain('no auth flow');
      });

      then('the fix is the keyrack unlock, named as a command', () => {
        expect(JSON.stringify(error.of)).toContain('rhx keyrack unlock');
      });
    });
  });

  given('[case2] an already-authenticated status', () => {
    when('[t0] the flow is asked for', () => {
      then('it returns early and never reaches the refusal', async () => {
        // ⚠️ without this case, an implementation that threw unconditionally would pass
        // case1 while it broke every authenticated run
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
