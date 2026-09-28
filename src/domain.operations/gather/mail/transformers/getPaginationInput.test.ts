import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getPaginationInput } from './getPaginationInput';

const CURSOR = new Date('2026-08-15T00:00:00Z');

const readSince = (input: {
  since: string | null;
  cursorPrior: Date | null;
}): Date | undefined =>
  getPaginationInput({ ...input, limit: 500 }).range.since?.deliveredAt;

/**
 * .what = clamps the precedence that makes a bare re-run incremental
 * .why = the prior cursor was persisted every run and read by no one. two artifacts promised
 *   otherwise — the field's own doc-comment, and the gatherer readme's "subsequent calls only
 *   fetch new mail since last sync" — so the feature was documented and absent.
 *
 * .note = [case2] is the teeth. under the old code it returned `undefined` (no bound at all),
 *   which is a FULL re-scan on every run rather than the incremental fetch both docs claimed.
 */
describe('getPaginationInput', () => {
  given('[case1] an explicit --since and a prior cursor', () => {
    when('[t0] the range is built', () => {
      then(
        'the caller WINS — the cursor is a default, never an override',
        () => {
          const since = readSince({
            since: '2026-01-01T00:00:00Z',
            cursorPrior: CURSOR,
          });

          // a human who asks for a wider window must get it, or they could never re-scan
          // after a cache wipe or a mail that arrived out of order
          expect(since).toEqual(new Date('2026-01-01T00:00:00Z'));
        },
      );
    });
  });

  given('[case2] no --since, but a prior cursor', () => {
    when('[t0] the range is built', () => {
      then('the cursor becomes the bound — the run is incremental', () => {
        expect(readSince({ since: null, cursorPrior: CURSOR })).toEqual(CURSOR);
      });
    });
  });

  given('[case3] no --since and no prior cursor', () => {
    when('[t0] the range is built', () => {
      then('there is no lower bound — a first run reads it all', () => {
        expect(readSince({ since: null, cursorPrior: null })).toEqual(
          undefined,
        );
      });
    });
  });

  given('[case4] an unreadable --since', () => {
    when('[t0] the range is built', () => {
      then('it refuses, rather than silently drop the bound', async () => {
        const error = await getError(() =>
          getPaginationInput({
            since: 'yesterday',
            cursorPrior: null,
            limit: 500,
          }),
        );

        // ⚠️ `new Date('yesterday')` is an Invalid Date, and every comparison against its
        // NaN time is false — so this once became NO bound and returned the whole mailbox
        // with exit 0. the same lie as a dropped filter, in a different flag
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('not a date we can read');
        expect(error.message).toContain('--since 2026-08-01');
      });
    });
  });

  given('[case5] an unreadable --since WITH a prior cursor', () => {
    when('[t0] the range is built', () => {
      then('it still refuses — it never silently falls back', async () => {
        const error = await getError(() =>
          getPaginationInput({
            since: 'yesterday',
            cursorPrior: CURSOR,
            limit: 500,
          }),
        );

        // the quiet failure mode is the worse one: fall back to the cursor and the human
        // gets a plausible result for a window they did not ask for
        expect(error).toBeInstanceOf(BadRequestError);
      });
    });
  });
});
