import type { PaginationInput } from 'pagination-fns';
import { given, then, when } from 'test-fns';

import { getMailsWithinRange } from './getMailsWithinRange';

const PAGE_UNBOUND = { range: {}, limit: 500 } as PaginationInput<{
  deliveredAt: Date;
}>;

/**
 * .what = clamps the date filter applied to mail after it is read
 * .why = s3 has no date index, so a ListObjectsV2 cannot bound by delivery time. gmail pushes
 *   the same bound into its `q`; ses must apply it after the read, which makes it real logic
 *   rather than a delegation, and therefore worth its own clamp.
 *
 * .note = it now has a SECOND caller — the orchestrator applies the same bound to the mails
 *   it reads back out of the cache, so a fetched mail and a cached mail are judged in-range
 *   by one rule. that is why it sits with the shared transformers rather than in the ses
 *   adapter that first needed it.
 */
describe('getMailsWithinRange', () => {
  const asMail = (iso: string): { deliveredAt: Date } => ({
    deliveredAt: new Date(iso),
  });

  const mails = [
    asMail('2026-08-01T00:00:00Z'),
    asMail('2026-08-15T00:00:00Z'),
    asMail('2026-08-31T00:00:00Z'),
  ] as Parameters<typeof getMailsWithinRange>[0]['mails'];

  given('[case1] no bounds', () => {
    when('[t0] narrowed', () => {
      then('every mail survives', () => {
        expect(getMailsWithinRange({ mails, page: PAGE_UNBOUND })).toHaveLength(
          3,
        );
      });
    });
  });

  given('[case2] a since bound', () => {
    when('[t0] narrowed', () => {
      then('since is INCLUSIVE — a mail exactly on it survives', () => {
        const kept = getMailsWithinRange({
          mails,
          page: {
            range: { since: { deliveredAt: new Date('2026-08-15T00:00:00Z') } },
            limit: 500,
          } as PaginationInput<{ deliveredAt: Date }>,
        });

        expect(kept).toHaveLength(2);
      });
    });
  });

  given('[case3] an until bound', () => {
    when('[t0] narrowed', () => {
      then('until is EXCLUSIVE — a mail exactly on it is dropped', () => {
        const kept = getMailsWithinRange({
          mails,
          page: {
            range: { until: { deliveredAt: new Date('2026-08-15T00:00:00Z') } },
            limit: 500,
          } as PaginationInput<{ deliveredAt: Date }>,
        });

        expect(kept).toHaveLength(1);
      });
    });
  });

  given('[case4] an uptil bound', () => {
    when('[t0] narrowed', () => {
      then('uptil is INCLUSIVE — the until/uptil split is real', () => {
        const kept = getMailsWithinRange({
          mails,
          page: {
            range: { uptil: { deliveredAt: new Date('2026-08-15T00:00:00Z') } },
            limit: 500,
          } as PaginationInput<{ deliveredAt: Date }>,
        });

        // ⚠️ [case3] and [case4] together are the teeth: swap the `>=` and `>` in either
        // branch and exactly one of these two goes red
        expect(kept).toHaveLength(2);
      });
    });
  });
});
