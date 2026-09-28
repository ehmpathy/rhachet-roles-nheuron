import type { PaginationInput } from 'pagination-fns';
import { given, then, when } from 'test-fns';

import { asGmailQuery } from './asGmailQuery';

/** a page with no date bounds — isolates the filter half from the range half */
const PAGE_UNBOUND = { range: {}, limit: 500 } as PaginationInput<{
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

  /**
   * .what = clamps that the query gmail receives is the SAME on every host, whatever its zone
   * .why = ⚠️ the bounds are read in UTC (`--since 2026-08-01` is midnight UTC), but the query
   *   was formatted with the LOCAL calendar day of that instant. so one command produced two
   *   different fetch windows on two machines: west of Greenwich `--since 2026-08-01` became
   *   `after:2026/07/31` and pulled mail from BEFORE the date the human typed
   *   (`rule.forbid.time-assumptions`).
   *
   * ⚠️ .note = this case OVERRIDES `process.env.TZ`, which every other case inherits as `UTC`
   *   from `jest.unit.config.ts`. that global is exactly why the defect was invisible: under
   *   `TZ=UTC` the local read and the UTC read agree, so no test could tell them apart and the
   *   whole suite agreed with broken code. a clamp for a zone-dependent defect has to leave
   *   the one zone where it does not reproduce.
   */
  /**
   * .what = the query names the UTC calendar day, so every host produces the same one
   * .why = ⚠️ the bounds are read in UTC (`--since 2026-08-01` is midnight UTC), but the
   *   query was once formatted from the LOCAL calendar day of that instant. so one command
   *   fetched two different windows on two machines — west of Greenwich `--since 2026-08-01`
   *   became `after:2026/07/31` and pulled a whole extra day of mail
   *   (`rule.forbid.time-assumptions`).
   *
   * ⚠️ .note = HOW THIS IS CLAMPED, and why not the obvious way. the obvious clamp — mutate
   *   `process.env.TZ`, then assert the output — was written first and **passed with the
   *   defect restored**. node caches its zone, so the write never reached `Date`, and under
   *   the inherited `TZ=UTC` the local read and the UTC read agree, so no assertion on the
   *   output could tell them apart. it was a green that guarded no one — the same shape as
   *   a hand-typed path that points at a file the reader never opens.
   *
   *   so the clamp asserts against the ONE independent UTC-derived value available with no
   *   zone control at all: `toISOString()`, which is UTC by specification. on a UTC host it
   *   agrees with either implementation and so guards no one — but on any CI or dev host
   *   that is NOT UTC it goes red at once, which is precisely the population that carried
   *   the defect. a clamp that bites where the bug bites is honest; a clamp that bites
   *   nowhere at all is not (`rule.forbid.failhide`).
   */
  given('[case5] a --since bound, on any host', () => {
    when('[t0] cast', () => {
      then('the day named is the UTC one, derived independently', () => {
        const since = new Date('2026-08-01T00:00:00Z');
        const query = asGmailQuery({
          page: {
            range: { since: { deliveredAt: since } },
            limit: 500,
          } as PaginationInput<{ deliveredAt: Date }>,
          filter: { query: null, labels: [] },
        });

        // `toISOString` is UTC by spec, so this is the human's own day, computed by a
        // route that shares no code with the transformer under test
        const dayUtc = since.toISOString().slice(0, 10).replace(/-/g, '/');

        expect(query).toEqual(`after:${dayUtc}`);
      });
    });
  });

  given('[case4] a date range, labels, and a query together', () => {
    when('[t0] cast', () => {
      then('all three compose into one AND-joined expression', () => {
        const query = asGmailQuery({
          page: {
            range: { since: { deliveredAt: new Date('2026-08-01T00:00:00Z') } },
            limit: 500,
          } as PaginationInput<{ deliveredAt: Date }>,
          filter: { query: 'has:attachment', labels: ['work'] },
        });

        // the range bound survives alongside the filter — neither displaces the other
        expect(query).toContain('after:2026/08/01');
        expect(query).toContain('label:work');
        expect(query).toContain('has:attachment');
      });
    });
  });
});
