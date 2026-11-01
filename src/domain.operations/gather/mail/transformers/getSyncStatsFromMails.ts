import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { getLatestMailDate } from './getLatestMailDate';

/**
 * .what = build the sync stats a mail adapter returns from the mails it gathered
 * .why = every mechanism computes the same three fields the same way, so the
 *        shape lives here rather than once per adapter — a divergence between
 *        two adapters' stats would be a defect no test would catch
 */
export const getSyncStatsFromMails = (input: {
  mails: GatheredMail[];
}): GatheredMailSyncStats =>
  new GatheredMailSyncStats({
    mailFoundUptil: getLatestMailDate({ mails: input.mails }),
    mailFoundQuant: input.mails.length,
    mailSyncedQuant: input.mails.length,
  });
