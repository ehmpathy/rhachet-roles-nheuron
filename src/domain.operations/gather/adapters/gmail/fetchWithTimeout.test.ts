import { getError, given, then, when } from 'test-fns';

import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * .what = a fake transport that never answers until its abort signal fires
 * .why = the whole point of the wrapper is the case a real hung endpoint creates — a request
 *   that neither answers nor errors on its own. this fake reproduces that: it settles ONLY
 *   when the AbortController aborts, so a test can prove the timeout is what unblocks it.
 *   it is injected via `options.fetch`, so no network boundary is crossed or mocked.
 * .note = the `as typeof fetch` casts below fit a two-arg fake to the dom lib's overloaded
 *   `fetch` signature (an external type); the fake honors the one overload the wrapper calls.
 */
const asStalledFetch = (): typeof fetch =>
  (async (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_answer, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as typeof fetch;

/**
 * .what = a fake transport that answers at once, and records the init it was called with
 * .why = proves the wrapper hands the abort signal to the transport, with no global spy
 */
const asAnswerFetch = (): {
  transport: typeof fetch;
  initsSeen: RequestInit[];
} => {
  const initsSeen: RequestInit[] = [];
  const transport = (async (_url: unknown, init?: RequestInit) => {
    initsSeen.push(init ?? {});
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;
  return { transport, initsSeen };
};

describe('fetchWithTimeout', () => {
  given('[case1] an endpoint that never answers', () => {
    when('[t0] the request exceeds its timeout', () => {
      then('it throws a named, recoverable timeout error', async () => {
        // ⚠️ the teeth. remove the AbortError map and the raw AbortError propagates instead,
        // so this assertion goes red. remove the AbortController setup entirely and the
        // request hangs until jest's own timeout — also red, more slowly.
        const error = await getError(() =>
          fetchWithTimeout(
            {
              url: 'https://oauth2.googleapis.com/token',
              init: { method: 'POST' },
              what: 'gmail token refresh',
            },
            { timeoutMs: 10, fetch: asStalledFetch() },
          ),
        );
        expect(error.message).toContain('gmail token refresh timed out');
      });
    });
  });

  given('[case2] an endpoint that answers before the timeout', () => {
    when('[t0] the request completes in time', () => {
      then('it returns the response, never a timeout error', async () => {
        const { transport } = asAnswerFetch();
        const response = await fetchWithTimeout(
          {
            url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
            init: { method: 'GET' },
            what: 'gmail messages.list',
          },
          { timeoutMs: 1000, fetch: transport },
        );
        expect(response.status).toBe(200);
      });

      then('the abort signal was passed to the transport', async () => {
        const { transport, initsSeen } = asAnswerFetch();
        await fetchWithTimeout(
          {
            url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
            init: { method: 'GET' },
            what: 'gmail messages.list',
          },
          { timeoutMs: 1000, fetch: transport },
        );
        expect(initsSeen[0]?.signal).toBeInstanceOf(AbortSignal);
      });
    });
  });
});
