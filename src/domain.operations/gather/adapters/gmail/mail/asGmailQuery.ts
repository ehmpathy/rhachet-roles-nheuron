import type { PaginationInput } from 'pagination-fns';

import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

/**
 * .what = cast a date bound into the epoch seconds gmail's `after:` / `before:` accept
 * .why = ⚠️ a `YYYY/MM/DD` bound is read by gmail as a calendar day in its OWN zone (pacific),
 *   never the instant the caller holds. a sync cursor at `2024-01-15T03:00Z` rendered as
 *   `after:2024/01/15` asked gmail for mail from `08:00Z` on — so mail delivered between the
 *   cursor and pacific midnight was never fetched on an incremental run, and never recovered
 *   (`rule.forbid.time-assumptions`). epoch seconds name the instant itself, on every host
 *   and in every zone.
 *
 * .note = the bound is rounded OUTWARD (`floor` for a lower bound, `ceil` for an upper one),
 *   so the remote fetch never holds less than the range. the precise bound is applied after,
 *   by `getMailsWithinRange`; an extra sub-second of mail fetched is benign, one dropped is not.
 */
const asEpochSeconds = (input: { at: Date; round: 'floor' | 'ceil' }): number =>
  Math[input.round](input.at.getTime() / 1000);

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
    // since = inclusive lower bound → after:<epoch seconds, floored>
    page.range.since?.deliveredAt
      ? `after:${asEpochSeconds({ at: page.range.since.deliveredAt, round: 'floor' })}`
      : null,
    // until = exclusive upper bound → before:<epoch seconds, ceiled>
    page.range.until?.deliveredAt
      ? `before:${asEpochSeconds({ at: page.range.until.deliveredAt, round: 'ceil' })}`
      : null,
    // uptil = inclusive upper bound; before: is exclusive, so one second past it
    page.range.uptil?.deliveredAt
      ? `before:${asEpochSeconds({ at: page.range.uptil.deliveredAt, round: 'floor' }) + 1}`
      : null,
    // the `/labels=work,urgent` scope → `label:work label:urgent`
    ...filter.labels.map((label) => `label:${label}`),
    // the human's own `--query`, verbatim — it is already gmail search syntax
    filter.query,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(' ') : null;
};
