import { UnexpectedCodePathError } from 'helpful-errors';

/**
 * .what = the default wall-clock bound on a single gmail http request
 * .why = a stalled TLS handshake or an unreachable host makes a bare `fetch` hang with no
 *   answer and no error, so `gather.auth` / `gather.mail` block forever with no signal and no
 *   way to abort. 30s is long enough for a slow-but-live endpoint, short enough that a dead
 *   one surfaces as an error a human can act on rather than a silent hang
 *   (`rule.forbid.friction-hazards`).
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * .what = perform an http request bounded by a wall-clock timeout
 * .why = every gmail communicator (token refresh, service-account exchange, messages.list,
 *   batch get) called the global `fetch` with no `AbortController`, so a hung connection left
 *   the cli blocked with no error. this wraps the four call sites in ONE bounded fetch, so a
 *   timeout surfaces as a recoverable, named error rather than a raw hang.
 *
 * .note = a timeout throws exit-1 (server/environment-must-fix), not a `BadRequestError` — the
 *   caller's input is not wrong; the network or the remote is. the message names the endpoint
 *   and the bound, and the hint points at the recovery (`rule.require.failloud`).
 */
export const fetchWithTimeout = async (
  input: {
    url: string;
    init: RequestInit;
    what: string;
  },
  options?: {
    timeoutMs?: number;
    /** the http transport; the global `fetch` unless a caller injects one (unit tests) */
    fetch?: typeof fetch;
  },
): Promise<Response> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const transport = options?.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await transport(input.url, {
      ...input.init,
      signal: controller.signal,
    });
  } catch (error: any) {
    // the abort fires as an `AbortError`; map it to a named, recoverable error. every other
    // fetch failure (dns, tls reset) keeps its own identity and propagates unchanged.
    if (error?.name === 'AbortError')
      throw new UnexpectedCodePathError(`${input.what} timed out`, {
        url: input.url,
        timeoutMs,
        why: 'the endpoint did not answer within the timeout — a stalled handshake or an unreachable host would otherwise hang the cli with no signal',
        hint: 'check network connectivity and retry',
      });
    throw error;
  } finally {
    // clear the timer on EVERY exit — an answered request must not leave a pending abort that
    // fires later, and a rejected one must not leak a handle
    clearTimeout(timer);
  }
};
