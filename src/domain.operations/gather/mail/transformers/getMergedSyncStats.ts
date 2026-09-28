import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

/**
 * .what = merge prior sync stats with delta from fetch
 * .why = pure transformer for stats aggregation; no decode-friction in orchestrator
 *
 * ⚠️ .note = `mailFoundQuant` is READ FROM THE CACHE, never accumulated. it once read
 *   `statsPrior.mailFoundQuant + statsDelta.mailFoundQuant`, and that made the whole
 *   operation non-idempotent: `gather.mail` over the same range twice re-fetched the
 *   same mails and added their count again, so the persisted number climbed on every
 *   run while the cache it claimed to describe stayed correct. the cache is idempotent
 *   (`upsertCachedMail` keys on the exid), so it is the one honest source for a total —
 *   and to read from it collapses the accumulate branch entirely
 *   (`rule.require.fewer-paths-via-idempotency`).
 */
export const getMergedSyncStats = (input: {
  statsPrior: GatheredMailSyncStats;
  statsDelta: GatheredMailSyncStats;

  /**
   * how many mails the cache holds AFTER this run's upserts — the total, counted rather
   * than accumulated
   */
  mailCachedQuant: number;
}): GatheredMailSyncStats => {
  const { statsPrior, statsDelta } = input;

  // use max() for dates to prevent cursor regression if user re-runs with older --since
  const mailFoundUptil = (() => {
    if (!statsDelta.mailFoundUptil) return statsPrior.mailFoundUptil;
    if (!statsPrior.mailFoundUptil) return statsDelta.mailFoundUptil;
    return statsDelta.mailFoundUptil > statsPrior.mailFoundUptil
      ? statsDelta.mailFoundUptil
      : statsPrior.mailFoundUptil;
  })();

  return new GatheredMailSyncStats({
    mailFoundUptil,
    // the cache's own count, not prior + delta — see the ⚠️ note above
    mailFoundQuant: input.mailCachedQuant,
    // mailSyncedQuant is per-op, not cumulative — just use delta value
    mailSyncedQuant: statsDelta.mailSyncedQuant,
  });
};
