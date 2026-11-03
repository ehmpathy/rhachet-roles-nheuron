import type { GatheredMail } from '@src/domain.objects/GatheredMail';

/**
 * .what = sort mails by deliveredAt for deterministic output
 * .why = consistent order across runs and snapshots
 *
 * default: DESC (newest first)
 */
export const getSortedMails = (input: {
  mails: GatheredMail[];
  order?: 'ASC' | 'DESC';
}): GatheredMail[] => {
  const order = input.order ?? 'DESC';
  const sorted = [...input.mails].sort((a, b) => {
    const aTime = a.deliveredAt.getTime();
    const bTime = b.deliveredAt.getTime();
    return order === 'ASC' ? aTime - bTime : bTime - aTime;
  });
  return sorted;
};
