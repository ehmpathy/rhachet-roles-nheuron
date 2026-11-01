import type { GatheredMail } from '@src/domain.objects/GatheredMail';

/**
 * .what = the delivery time of the most recent mail in a set
 * .why = the sync cursor — how far forward the mailbox has been read
 *
 * .note = null for an empty set, which reads as "no cursor yet" rather than a
 *         date. getMergedSyncStats treats a null delta as "keep the prior".
 *
 * .note = a fold, never `Math.max(...spread)`. a spread passes each mail as one argument,
 *         and v8 caps the argument count near 1e5 — a cap a busy mailbox passes within the
 *         page limit, which would throw a bare RangeError that names no mail and no fix.
 */
export const getLatestMailDate = (input: {
  mails: GatheredMail[];
}): Date | null => {
  if (input.mails.length === 0) return null;

  const maxTime = input.mails.reduce(
    (max, mail) => Math.max(max, mail.deliveredAt.getTime()),
    Number.NEGATIVE_INFINITY,
  );
  return new Date(maxTime);
};
