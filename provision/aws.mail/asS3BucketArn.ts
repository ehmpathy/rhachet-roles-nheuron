/**
 * .what = the arn of an s3 bucket itself, the resource a `s3:ListBucket` grant names
 * .why = s3 arns carry no region and no account (bucket names are globally unique), so the
 *   shape `arn:aws:s3:::<bucket>` is easy to get wrong by analogy with other services
 */
export const asS3BucketArn = (input: { bucket: string }): string =>
  `arn:aws:s3:::${input.bucket}`;
