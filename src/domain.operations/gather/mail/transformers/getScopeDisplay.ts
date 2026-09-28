import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

/**
 * .what = the slice of the mailbox a run asked for, said in one line
 * .why = a human who reads a mail list has no way to tell, from the list alone, whether it
 *        is their whole mailbox or a narrowed view of it. the count above it reads the same
 *        either way — so "12 mails" invites the wrong read and the wrong conclusion
 *        (`rule.forbid.ambiguous-labels`).
 *
 *        it matters more since the cache and cursor became scope-aware: a filtered run
 *        reports only what IT fetched while an unfiltered one reports the cached range, and
 *        that difference is invisible unless the scope is stated.
 *
 * .note = "whole mailbox" is spelled out rather than left blank. an absent line reads as an
 *         omission; a stated one reads as a fact.
 */
export const getScopeDisplay = (input: {
  filter: GatherMailFilter;
}): string => {
  const parts = [
    input.filter.labels.length > 0
      ? `labels=${input.filter.labels.join(',')}`
      : null,
    input.filter.query !== null ? `query="${input.filter.query}"` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(' ') : 'whole mailbox';
};
