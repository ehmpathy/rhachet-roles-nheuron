import { BadRequestError } from 'helpful-errors';
import type { PaginationInput } from 'pagination-fns';

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
    ? asBoundOrThrow({ since: input.since })
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

/**
 * .what = cast a `--since` string into a real date, or refuse it
 * .why = `new Date('yesterday')` yields an Invalid Date, whose `getTime()` is NaN — and every
 *   comparison against NaN is false, so an unparseable `--since` silently became NO bound and
 *   returned the whole mailbox with exit 0. the same shape as the dropped filter: a success
 *   that lied about what it narrowed (`rule.forbid.failhide`).
 */
const asBoundOrThrow = (input: { since: string }): Date => {
  const parsed = new Date(input.since);

  if (Number.isNaN(parsed.getTime()))
    BadRequestError.throw('--since is not a date we can read', {
      since: input.since,
      why: 'an unreadable date would silently become no bound at all, and return the whole mailbox',
      hint: 'use an ISO date, e.g. --since 2026-08-01',
    });

  return parsed;
};
