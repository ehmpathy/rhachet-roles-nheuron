import { given, then, useBeforeAll, when } from 'test-fns';

import { getSesAuthAdapter } from './getSesAuthAdapter';

const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const SES_ENV_KEYS = ['SES_MAIL_BUCKET', 'SES_REGION', 'SES_CONFIG_SET'];

/**
 * .what = clear the ses env for one case, then restore whatever was there
 * .why = the case asserts the NOT-CONFIGURED contract, so it must not depend on whether
 *   the machine holds an unlocked prep keyrack
 */
const withoutSesEnv = (): void => {
  const priors = Object.fromEntries(
    SES_ENV_KEYS.map((key) => [key, process.env[key] ?? null]),
  );

  beforeAll(() => {
    SES_ENV_KEYS.forEach((key) => {
      delete process.env[key];
    });
  });

  afterAll(() => {
    Object.entries(priors).forEach(([key, value]) => {
      if (value === null) {
        delete process.env[key];
        return;
      }
      process.env[key] = value;
    });
  });
};

describe('getSesAuthAdapter', () => {
  given('[case1] no ses config in the env', () => {
    withoutSesEnv();

    when('[t0] the status and the token are each read', () => {
      // wrapped in an object: useBeforeAll's deferred proxy does not forward primitives
      const result = useBeforeAll(async () => {
        const adapter = getSesAuthAdapter();
        return {
          status: await adapter.getAuthStatus({ repo: null }, { log }),
          accessToken: await adapter.getAccessToken(
            { repo: { mechanism: 'ses', address: 'jelly@one.nheuron.com' } },
            { log },
          ),
        };
      });

      then('the status reads anonymous', () => {
        expect(result.status).toBe('anonymous');
      });

      then(
        'the token reads null, the same answer gmail gives, never a throw',
        () => {
          expect(result.accessToken).toBeNull();
        },
      );
    });
  });
});
