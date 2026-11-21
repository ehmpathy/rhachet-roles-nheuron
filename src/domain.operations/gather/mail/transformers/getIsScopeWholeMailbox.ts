import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

/**
 * .what = does this run ask for the WHOLE mailbox, or a narrowed slice of it?
 * .why = the mail cache and the sync cursor are keyed on the mailbox alone —
 *        `mechanism` + `address` (`GatheredMailRepo`), with no filter component. so both
 *        answer one question only: *"what does this address hold, in full?"*
 *
 *        a filtered run cannot honestly answer it. two consequences follow, and this
 *        predicate gates both:
 *
 *        1. the CURSOR claims *"every mail up to time T has been seen."* a filtered fetch
 *           backs no such claim — it saw every mail up to T **that matched the filter**.
 *           advance the shared cursor from it and a later bare run skips every unmatched
 *           mail delivered before T, forever, with exit 0 and no signal.
 *        2. the CACHE holds the union of every run ever made against the address. read it
 *           back under a filter and the output blends mails the filter excludes.
 *
 * .note = the cache WRITE stays ungated on purpose. a gathered mail is a gathered mail
 *         whatever filter surfaced it, so to add one is always true. it is the READ and
 *         the CURSOR that assert completeness, and only those are gated here.
 */
export const getIsScopeWholeMailbox = (input: {
  filter: GatherMailFilter;
}): boolean => input.filter.query === null && input.filter.labels.length === 0;
