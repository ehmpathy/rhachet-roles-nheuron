import type { PaginationInput } from 'pagination-fns';

import { asSinceDateOrThrow } from './asSinceDateOrThrow';

/**
 * .what = build the page range a fetch runs over — from the caller's `--since` when they gave
 *   one, and otherwise from the cursor the prior run left behind
 * .why = this is what makes a bare re-run INCREMENTAL. `GatheredMailSyncStats.mailFoundUptil`
 *   was computed, cursor-regression-guarded, and persisted on every run — and then read by no
 *   one, because the range was built from the `--since` flag alone. so the field's own
 *   doc-comment and the gatherer readme both promised "subsequent calls only fetch new mail
 *   since last sync", while every run re-scanned the whole window (`rule.forbid.surprises`).
 *
 * .note = the caller's `--since` WINS. the cursor is a default, never an override — a human
 *   who asks for a wider window must get it, or they could never re-scan after a cache wipe
 *   or a mail that arrived out of order.
 */
export const getPaginationInput = (input: {
  /** the caller's `--since`, if they gave one */
  since: string | null;
  /** where the prior run stopped; null on a first run or a cleared cache */
  cursorPrior: Date | null;
  limit: number;
}): PaginationInput<{ deliveredAt: Date }> => {
  const sinceRequested = input.since
    ? asSinceDateOrThrow({ since: input.since })
    : null;

  // precedence: an explicit --since, else the prior cursor, else no lower bound at all
  const since = sinceRequested ?? input.cursorPrior;

  return {
    range: {
      since: since ? { deliveredAt: since } : undefined,
    },
    order: 'DESC',
    limit: input.limit,
  };
};
