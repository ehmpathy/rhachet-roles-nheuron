import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import type { GatherAuthAdapter } from '@src/domain.objects/GatherAuthAdapter';
import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { genAuthReady } from './genAuthReady';

/**
 * .what = clamps that the auth orchestrator is mechanism-NEUTRAL
 * .why = a shared orchestrator that names one mechanism cannot serve the next one. this
 *   pins the seam rather than the outcome: every credential decision must arrive through
 *   the injected `GatherAuthAdapter`, so a new mechanism reuses this operation untouched.
 *
 * .note = [case1] is the teeth. the orchestrator once read GMAIL_SERVICE_ACCOUNT_JSON
 *   itself and handed it straight to google's token endpoint — so with the env set and a
 *   fake adapter injected, it would parse the junk json and throw rather than consult the
 *   fake at all. that is what this case proves is gone.
 */
const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const ADAPTER_TOKEN = 'token-from-the-injected-adapter';

const getFakeAuthAdapter = (input: {
  status: GatherAuthStatus;
  onRefresh?: () => void;
}): GatherAuthAdapter => ({
  mechanism: 'gmail',
  getAuthStatus: async () => input.status,
  genAuth: async () => {
    throw new Error('genAuth should not be reached');
  },
  genAuthRefresh: async () => {
    input.onRefresh?.();
    return { accessToken: ADAPTER_TOKEN, expiresAt: new Date() };
  },
  getAccessToken: async () => ADAPTER_TOKEN,
});

const REPO = new GatheredMailRepo({
  mechanism: 'gmail',
  address: 'jelly@example.com',
});

describe('genAuthReady', () => {
  given('[case1] gmail service-account env vars are set to junk', () => {
    // junk, deliberately: a real service account json would let the old codepath succeed
    // against the network. junk makes the old codepath throw, so the clamp bites offline.
    const envPrior = {
      json: process.env.GMAIL_SERVICE_ACCOUNT_JSON,
      subject: process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT,
    };
    beforeAll(() => {
      process.env.GMAIL_SERVICE_ACCOUNT_JSON = 'not-json-at-all';
      process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT = 'robot@example.com';
    });
    afterAll(() => {
      // restore exactly, the absent case too — a leaked env var would silently change how
      // every later suite in this worker reads gmail auth
      if (envPrior.json === undefined)
        delete process.env.GMAIL_SERVICE_ACCOUNT_JSON;
      else process.env.GMAIL_SERVICE_ACCOUNT_JSON = envPrior.json;
      if (envPrior.subject === undefined)
        delete process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT;
      else process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT = envPrior.subject;
    });

    when('[t0] auth is readied with an injected adapter', () => {
      then('the token comes from the adapter, never from the env', async () => {
        const result = await genAuthReady(
          {
            repo: REPO,
            authAdapter: getFakeAuthAdapter({ status: 'authenticated' }),
          },
          { log },
        );
        expect(result.accessToken).toEqual(ADAPTER_TOKEN);
      });

      then(
        'the adapter decides status, so an anonymous one still throws',
        async () => {
          // the old codepath returned a service-account token BEFORE the status guard, so
          // this case could not have thrown at all while the env was set
          const error = await getError(
            genAuthReady(
              {
                repo: REPO,
                authAdapter: getFakeAuthAdapter({ status: 'anonymous' }),
              },
              { log },
            ),
          );
          expect(error).toBeInstanceOf(BadRequestError);
          expect(error.message).toContain('not authenticated');
        },
      );
    });
  });

  given('[case2] no service-account env vars are set', () => {
    when('[t0] the adapter reports an expired token', () => {
      then('the refresh runs, then the adapter yields the token', async () => {
        let refreshed = false;
        const result = await genAuthReady(
          {
            repo: REPO,
            authAdapter: getFakeAuthAdapter({
              status: 'expired',
              onRefresh: () => {
                refreshed = true;
              },
            }),
          },
          { log },
        );
        expect(refreshed).toEqual(true);
        expect(result.accessToken).toEqual(ADAPTER_TOKEN);
      });
    });

    when('[t1] the adapter reports authenticated', () => {
      then('no refresh runs', async () => {
        let refreshed = false;
        await genAuthReady(
          {
            repo: REPO,
            authAdapter: getFakeAuthAdapter({
              status: 'authenticated',
              onRefresh: () => {
                refreshed = true;
              },
            }),
          },
          { log },
        );
        expect(refreshed).toEqual(false);
      });
    });
  });
});
