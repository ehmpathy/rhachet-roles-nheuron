import { getError, given, then, useBeforeAll, when } from 'test-fns';

import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * .what = a fetch stub that never answers until its abort signal fires
 * .why = the whole point of the wrapper is the case a real hung endpoint creates — a request
 *   that neither answers nor errors on its own. this stub reproduces that: it settles ONLY
 *   when the AbortController aborts, so a test can prove the timeout is what unblocks it.
 */
const asStalledFetch =
  () =>
  (_url: string, init: RequestInit): Promise<Response> =>
    new Promise((_answer, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

describe('fetchWithTimeout', () => {
  given('[case1] an endpoint that never answers', () => {
    const scene = useBeforeAll(async () => {
      const spy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(asStalledFetch() as unknown as typeof fetch);
      return { spy };
    });

    afterAll(() => scene.spy.mockRestore());

    when('[t0] the request exceeds its timeout', () => {
      then('it throws a named, recoverable timeout error', async () => {
        // ⚠️ the teeth. remove the AbortError→MalfunctionError map and the raw AbortError
        // propagates instead, so this assertion goes red. remove the AbortController setup
        // entirely and the request hangs until jest's own timeout — also red, more slowly.
        const error = await getError(() =>
          fetchWithTimeout(
            {
              url: 'https://oauth2.googleapis.com/token',
              init: { method: 'POST' },
              what: 'gmail token refresh',
            },
            { timeoutMs: 10 },
          ),
        );
        expect(error.message).toContain('gmail token refresh timed out');
      });
    });
  });

  given('[case2] an endpoint that answers before the timeout', () => {
    const scene = useBeforeAll(async () => {
      const okResponse = new Response('{"ok":true}', { status: 200 });
      const spy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          (async () => okResponse) as unknown as typeof fetch,
        );
      return { spy };
    });

    afterAll(() => scene.spy.mockRestore());

    when('[t0] the request completes in time', () => {
      then('it returns the response, never a timeout error', async () => {
        const response = await fetchWithTimeout(
          {
            url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
            init: { method: 'GET' },
            what: 'gmail messages.list',
          },
          { timeoutMs: 1000 },
        );
        expect(response.status).toBe(200);
      });

      then('the abort signal was passed to fetch', async () => {
        await fetchWithTimeout(
          {
            url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
            init: { method: 'GET' },
            what: 'gmail messages.list',
          },
          { timeoutMs: 1000 },
        );
        const init = scene.spy.mock.calls[0]?.[1] as RequestInit;
        expect(init.signal).toBeInstanceOf(AbortSignal);
      });
    });
  });
});
