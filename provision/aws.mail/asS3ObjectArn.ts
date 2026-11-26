/**
 * .what = the arn of every s3 object under a key prefix, the resource a `s3:GetObject` or
 *   `s3:PutObject` grant names
 * .why = an object arn is the bucket arn plus `/<key>`; the `*` at the end widens it to the
 *   whole prefix. a prefix with no final `/` would also match a peer prefix of the same stem,
 *   so the caller passes the prefix exactly as it is stored
 */
export const asS3ObjectArn = (input: {
  bucket: string;
  prefix: string;
}): string => `arn:aws:s3:::${input.bucket}/${input.prefix}*`;
