import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

/**
 * .what = the same stats, with the sync cursor withheld
 * .why = `getMergedSyncStats` reads a null `mailFoundUptil` on the delta as "keep the prior",
 *        so this is how a run declines to advance the shared cursor while it still reports
 *        the counts it really did fetch.
 *
 *        a filtered run is exactly that case: it saw every mail up to T **that matched**, so
 *        its high-water mark is not the mailbox's (`getIsScopeWholeMailbox`).
 *
 * .note = the counts pass through untouched. what this withholds is the CLAIM of
 *         completeness, never the record of work done.
 */
export const getSyncStatsWithoutCursor = (input: {
  stats: GatheredMailSyncStats;
}): GatheredMailSyncStats =>
  new GatheredMailSyncStats({
    mailFoundUptil: null,
    mailFoundQuant: input.stats.mailFoundQuant,
    mailSyncedQuant: input.stats.mailSyncedQuant,
  });
