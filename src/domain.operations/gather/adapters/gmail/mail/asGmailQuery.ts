import type { PaginationInput } from 'pagination-fns';

import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

/**
 * .what = format date for gmail api query
 * .why = gmail uses YYYY/MM/DD format for date filters
 *
 * ⚠️ .note = the calendar parts are read in **UTC**, never local. `--since 2026-08-01` parses
 *   as midnight UTC, so the local-timezone read of that same instant is a DIFFERENT calendar
 *   day west of Greenwich — and the query built from it asked gmail for a different window
 *   than the human typed. the same command, on two machines, fetched two ranges:
 *
 *   | host zone | `--since 2026-08-01` became | what the human got |
 *   |-----------|------------------------------|---------------------|
 *   | UTC-5     | `after:2026/07/31`           | mail from BEFORE the date they asked for |
 *   | UTC       | `after:2026/08/01`           | correct |
 *   | UTC+8     | `after:2026/08/01`           | correct — but the `uptil` bound skews the other way |
 *
 *   the suite forces `TZ=UTC`, so every test agreed with the code and none could see this
 *   (`rule.forbid.time-assumptions`). the clamp below pins a bound whose local and UTC
 *   calendar days DIFFER, so a revert to the local read goes red rather than stays invisible.
 */
const formatDateForGmail = (date: Date): string => {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
};

/**
 * .what = cast a page range + a caller's filter into the one gmail `q` expression they mean
 * .why = gmail's search takes a single flat string, so the date bounds, the human's
 *   `--query`, and the `/labels=` scope all compose into it. a space reads as AND.
 *
 * ⚠️ .note = the filter halves are NOT decoration. they were once parsed at the cli and
 *   dropped before they reached here, so `gather.mail --query "from:boss@co.com"` returned
 *   the WHOLE mailbox with exit 0 — a success that lied about what it had filtered
 *   (`rule.forbid.surprises`). this transformer is where they become real, which is why it
 *   is its own testable module rather than a closure inside the adapter.
 *
 * .note = a null return means "no constraint at all" — gmail then lists the mailbox. that is
 *   correct ONLY when the caller truly asked for no bound; it must never be the result of a
 *   dropped filter.
 */
export const asGmailQuery = (input: {
  page: PaginationInput<{ deliveredAt: Date }>;
  filter: GatherMailFilter;
}): string | null => {
  const { page, filter } = input;

  // build parts immutably via filter
  const parts = [
    // gmail api query: after:YYYY/MM/DD (>= since)
    page.range.since?.deliveredAt
      ? `after:${formatDateForGmail(page.range.since.deliveredAt)}`
      : null,
    // gmail api query: before:YYYY/MM/DD (< until)
    page.range.until?.deliveredAt
      ? `before:${formatDateForGmail(page.range.until.deliveredAt)}`
      : null,
    // gmail api: before: is exclusive, so uptil (<=) needs next day
    page.range.uptil?.deliveredAt
      ? `before:${formatDateForGmail(
          new Date(
            page.range.uptil.deliveredAt.getTime() + 24 * 60 * 60 * 1000,
          ),
        )}`
      : null,
    // the `/labels=work,urgent` scope → `label:work label:urgent`
    ...filter.labels.map((label) => `label:${label}`),
    // the human's own `--query`, verbatim — it is already gmail search syntax
    filter.query,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(' ') : null;
};
