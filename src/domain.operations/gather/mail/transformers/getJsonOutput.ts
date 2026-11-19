import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { getMailDisplay } from './getMailDisplay';

/**
 * .what = format mails as JSON for structured output
 * .why = machine-readable output for pipes and automation
 *
 * ⚠️ .note = the stat keys are `listed` / `synced` / `cached`, the SAME three words the tree
 *   output uses — never the domain field names `mailFoundQuant` / `mailSyncedQuant`. one
 *   command must not name one number two ways across its two outputs, or a human who reads
 *   a tree beside an automation's json has to work out that `cached` and `mailFoundQuant`
 *   are the same value (`rule.require.ubiqlang`). the raw names are also ambiguous on their
 *   own — the exact defect the tree's labels were introduced to close
 *   (`rule.forbid.ambiguous-labels`).
 */
export const getJsonOutput = (input: {
  mails: GatheredMail[];
  stats: GatheredMailSyncStats;
}): string => {
  const output = {
    stats: {
      foundUptil: input.stats.mailFoundUptil?.toISOString() ?? null,
      listed: input.mails.length,
      synced: input.stats.mailSyncedQuant,
      cached: input.stats.mailFoundQuant,
    },
    mails: input.mails.map((mail) => {
      const display = getMailDisplay({ mail });
      return {
        exid: mail.exid,
        deliveredAt: mail.deliveredAt.toISOString(),
        sender: {
          mechanism: mail.sender.mechanism,
          address: mail.sender.address,
        },
        ceiver: {
          mechanism: mail.ceiver.mechanism,
          address: mail.ceiver.address,
        },
        subject: display.subject,
        snippet: display.snippet,
        attachments: mail.attachments,
        isObfuscated: mail.isObfuscated,
      };
    }),
  };

  return JSON.stringify(output, null, 2);
};
