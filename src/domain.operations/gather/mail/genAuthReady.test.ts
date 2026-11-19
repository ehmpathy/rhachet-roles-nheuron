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
  mechanism: 'ses',
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
  mechanism: 'ses',
  address: 'jelly@example.com',
});

describe('genAuthReady', () => {
  given('[case1] an injected adapter', () => {
    when('[t0] the adapter reports authenticated', () => {
      then('the token comes from the adapter', async () => {
        const result = await genAuthReady(
          {
            repo: REPO,
            authAdapter: getFakeAuthAdapter({ status: 'authenticated' }),
          },
          { log },
        );
        expect(result.accessToken).toEqual(ADAPTER_TOKEN);
      });
    });

    when('[t1] the adapter reports anonymous', () => {
      then('the adapter decides status, so the call throws', async () => {
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
      });
    });
  });

  given('[case2] the adapter reports token freshness', () => {
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
