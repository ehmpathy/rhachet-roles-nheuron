import type { ParsedMail } from 'mailparser';

/**
 * .what = pick the delivered-at date for a parsed mail
 * .why = the Date header is the SENDER's claim of when they sent it. it is absent
 *        OR malformed on bad mail, so fall back to the time ses wrote the object
 *        into s3 — our own record of receipt, always present and always truthful.
 *
 * .note = a malformed Date header parses to an Invalid Date OBJECT, not null, so
 *         `?? receivedAt` alone would NOT catch it. its `getTime()` is NaN, every
 *         `--since` comparison against NaN is false, so the mail would vanish from
 *         every range query with no log and no count (rule.forbid.failhide). guard
 *         the NaN case explicitly, exactly as the gmail adapter guards internalDate.
 *
 * .note = the epoch is deliberately NOT the fallback. a mail dated 1970 sorts below
 *         every `--since` bound, so it would vanish the same silent way.
 */
export const getDeliveredAtFromParsed = (input: {
  parsed: ParsedMail;
  receivedAt: Date;
}): Date => {
  const claimed = input.parsed.date;
  if (!claimed) return input.receivedAt;
  if (Number.isNaN(claimed.getTime())) return input.receivedAt;
  return claimed;
};
