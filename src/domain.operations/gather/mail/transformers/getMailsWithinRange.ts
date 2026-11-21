import type { PaginationInput } from 'pagination-fns';

import type { GatheredMail } from '@src/domain.objects/GatheredMail';

/**
 * .what = keep only the mails whose delivery time falls inside the page range
 * .why = a mechanism that cannot push a date bound into its own fetch must apply it here
 *   instead. ses is one: mail lives under an s3 prefix, and ListObjectsV2 has no date
 *   index, so every object is read and then narrowed. gmail pushes the same bound into
 *   its api query and never needs this.
 *
 * .note = it lives with the SHARED mail transformers rather than inside the ses adapter,
 *   because the orchestrator applies the same bound to the mails it reads back out of the
 *   cache. one bound, applied by one function, so a fetched mail and a cached mail can
 *   never be judged in-range by two different rules (`rule.prefer.most-common-denominator`).
 */
export const getMailsWithinRange = (input: {
  mails: GatheredMail[];
  page: PaginationInput<{ deliveredAt: Date }>;
}): GatheredMail[] => {
  const { since, until, uptil } = input.page.range;

  return input.mails.filter((mail) => {
    const at = mail.deliveredAt.getTime();

    // since = inclusive lower bound
    if (since?.deliveredAt && at < since.deliveredAt.getTime()) return false;

    // until = exclusive upper bound
    if (until?.deliveredAt && at >= until.deliveredAt.getTime()) return false;

    // uptil = inclusive upper bound
    if (uptil?.deliveredAt && at > uptil.deliveredAt.getTime()) return false;

    return true;
  });
};
