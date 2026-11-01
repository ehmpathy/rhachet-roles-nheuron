import type { GatheredMail } from '@src/domain.objects/GatheredMail';

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
