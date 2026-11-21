/**
 * .what = detect whether an s3 error says the inbound bucket does not exist
 * .why = an absent bucket has exactly one cause worth a hint: the mail wish was
 *        never applied. every other s3 fault (denied, throttled, unreachable) needs a
 *        different fix, so the match must be narrow enough to never claim them.
 *
 * .note = the aws sdk v3 sets `name` to the wire error code, so `NoSuchBucket` is an
 *         exact match rather than a loose text hunt. the message check covers a
 *         wrapped or re-thrown error that kept the text but lost the name.
 */
export const getIsNoSuchBucketError = (input: { error: unknown }): boolean => {
  if (!(input.error instanceof Error)) return false;

  if (input.error.name === 'NoSuchBucket') return true;

  return input.error.message.includes('NoSuchBucket');
};
