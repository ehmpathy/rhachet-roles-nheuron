import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

/**
 * .what = the delivery time of the most recent mail in a set
 * .why = the sync cursor — how far forward the mailbox has been read
 *
 * .note = null for an empty set, which reads as "no cursor yet" rather than a
 *         date. getMergedSyncStats treats a null delta as "keep the prior".
 */
export const getLatestMailDate = (input: {
  mails: GatheredMail[];
}): Date | null => {
  if (input.mails.length === 0) return null;

  const maxTime = Math.max(
    ...input.mails.map((mail) => mail.deliveredAt.getTime()),
  );
  return new Date(maxTime);
};

/**
 * .what = build the sync stats a mail adapter returns from the mails it gathered
 * .why = every mechanism computes the same three fields the same way, so the
 *        shape lives here rather than once per adapter — a divergence between
 *        two adapters' stats would be a defect no test would catch
 *
 */
export const getSyncStatsFromMails = (input: {
  mails: GatheredMail[];
}): GatheredMailSyncStats =>
  new GatheredMailSyncStats({
    mailFoundUptil: getLatestMailDate({ mails: input.mails }),
    mailFoundQuant: input.mails.length,
    mailSyncedQuant: input.mails.length,
  });
