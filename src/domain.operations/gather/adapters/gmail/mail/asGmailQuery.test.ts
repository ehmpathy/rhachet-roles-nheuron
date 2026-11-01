import type { PaginationInput } from 'pagination-fns';
import { given, then, when } from 'test-fns';

import { asGmailQuery } from './asGmailQuery';

/** a page with no date bounds — isolates the filter half from the range half */
const PAGE_UNBOUND = { range: {}, limit: 500 } as PaginationInput<{
  deliveredAt: Date;
}>;

/** a page bounded only by the given range */
const asPage = (input: {
  range: PaginationInput<{ deliveredAt: Date }>['range'];
}): PaginationInput<{ deliveredAt: Date }> =>
  ({ range: input.range, limit: 500 }) as PaginationInput<{
    deliveredAt: Date;
  }>;

/**
 * .what = clamps that the caller's `--query` and `/labels=` scope actually REACH gmail
 * .why = both were parsed at the cli and then dropped before this point, so
 *   `gather.mail --query "from:boss@co.com"` fetched the whole mailbox and exited 0. the
 *   human read a full inbox as "that is all of it from boss", when the filter never ran
 *   (`rule.forbid.surprises`).
 *
 * .note = [case2] and [case3] are the teeth. under the old code both returned null — no
 *   constraint at all — which gmail reads as "list the mailbox".
 */
describe('asGmailQuery', () => {
  given('[case1] no bounds and no filter', () => {
    when('[t0] cast', () => {
      then('null comes back — the caller asked for no constraint', () => {
        expect(
          asGmailQuery({
            page: PAGE_UNBOUND,
            filter: { query: null, labels: [] },
          }),
        ).toEqual(null);
      });
    });
  });

  given('[case2] a --query and no bounds', () => {
    when('[t0] cast', () => {
      then('the query reaches gmail verbatim', () => {
        expect(
          asGmailQuery({
            page: PAGE_UNBOUND,
            filter: { query: 'from:boss@company.com', labels: [] },
          }),
        ).toEqual('from:boss@company.com');
      });
    });
  });

  given('[case3] a /labels= scope and no bounds', () => {
    when('[t0] cast', () => {
      then('each label becomes a gmail label: term', () => {
        expect(
          asGmailQuery({
            page: PAGE_UNBOUND,
            filter: { query: null, labels: ['work', 'urgent'] },
          }),
        ).toEqual('label:work label:urgent');
      });
    });
  });

  given('[case4] a date range, labels, and a query together', () => {
    when('[t0] cast', () => {
      then('all three compose into one AND-joined expression', () => {
        const query = asGmailQuery({
          page: asPage({
            range: { since: { deliveredAt: new Date('2026-08-01T00:00:00Z') } },
          }),
          filter: { query: 'has:attachment', labels: ['work'] },
        });

        // the range bound survives alongside the filter — neither displaces the other
        expect(query).toEqual('after:1785542400 label:work has:attachment');
      });
    });
  });

  /**
   * .what = clamps that a sync cursor reaches gmail as the INSTANT, never a calendar day
   * .why = ⚠️ gmail reads a `YYYY/MM/DD` bound as a day in pacific time. a cursor at
   *   `2024-01-15T03:00Z` once became `after:2024/01/15`, which gmail starts at `08:00Z` —
   *   so mail delivered in the five hours between was skipped by every incremental run and
   *   never recovered (`rule.forbid.time-assumptions`).
   *
   * .note = the cursor here sits BEFORE pacific midnight on purpose: it is the instant a day
   *   bound mishandles. the expected value is derived from `Date.parse`, a route that shares
   *   no code with the transformer under test.
   */
  given('[case5] a sync cursor that falls before pacific midnight', () => {
    when('[t0] cast', () => {
      then('the bound is the cursor instant in epoch seconds', () => {
        const cursor = new Date('2024-01-15T03:00:00.000Z');
        const query = asGmailQuery({
          page: asPage({ range: { since: { deliveredAt: cursor } } }),
          filter: { query: null, labels: [] },
        });

        expect(query).toEqual(
          `after:${Date.parse('2024-01-15T03:00:00Z') / 1000}`,
        );
      });
    });
  });

  given('[case6] bounds with a sub-second part', () => {
    when('[t0] cast', () => {
      const at = new Date('2024-01-15T03:00:00.750Z');
      const seconds = Date.parse('2024-01-15T03:00:00Z') / 1000;

      then('a lower bound rounds down, so the fetch never starts late', () => {
        expect(
          asGmailQuery({
            page: asPage({ range: { since: { deliveredAt: at } } }),
            filter: { query: null, labels: [] },
          }),
        ).toEqual(`after:${seconds}`);
      });

      then(
        'an exclusive upper bound rounds up, so the fetch never ends early',
        () => {
          expect(
            asGmailQuery({
              page: asPage({ range: { until: { deliveredAt: at } } }),
              filter: { query: null, labels: [] },
            }),
          ).toEqual(`before:${seconds + 1}`);
        },
      );

      then('an inclusive upper bound reaches one second past it', () => {
        expect(
          asGmailQuery({
            page: asPage({ range: { uptil: { deliveredAt: at } } }),
            filter: { query: null, labels: [] },
          }),
        ).toEqual(`before:${seconds + 1}`);
      });
    });
  });
});
