import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

import { asDateKey } from './asDateKey';
import { getMailDisplay } from './getMailDisplay';
import { getScopeDisplay } from './getScopeDisplay';

/**
 * .what = format mails as treestruct for cli output
 * .why = human-readable hierarchical display with nheuron vibes
 */
/**
 * .what = format a single mail item for tree display
 */
const getMailLines = (input: {
  mail: GatheredMail;
  isLast: boolean;
}): string[] => {
  const prefix = input.isLast ? '      \u2514\u2500' : '      \u251C\u2500';
  const contPrefix = input.isLast ? '         ' : '      \u2502  ';

  const display = getMailDisplay({ mail: input.mail });
  const dateStr = asDateKey({ date: input.mail.deliveredAt });

  return [
    `${prefix} ${dateStr} | ${input.mail.sender.address}`,
    `${contPrefix}\u2514\u2500 ${display.subject}`,
  ];
};

export const getTreeOutput = (input: {
  mails: GatheredMail[];
  stats: GatheredMailSyncStats;
  address: string;
  filter: GatherMailFilter;
}): string => {
  // header with the scope, then the three counts.
  //
  // ⚠️ each count says WHICH set it counts, because they are three different sets and the
  //   one label `found` once served all three. `listed` matches the mails below it,
  //   `synced` is what this run fetched, and `cached` is the whole local store for the
  //   address — which under a filter counts mails this run neither fetched nor lists
  //   (`rule.forbid.ambiguous-labels`)
  const headerLines = [
    `\u{1fABC} boop!`, // jellyfish emoji
    '',
    `\u{1FAD9} gather.mail --address ${input.address}`,
    `   \u251C\u2500 scope: ${getScopeDisplay({ filter: input.filter })}`,
    `   \u251C\u2500 listed: ${input.mails.length}`,
    `   \u251C\u2500 synced: ${input.stats.mailSyncedQuant}`,
    `   \u251C\u2500 cached: ${input.stats.mailFoundQuant}`,
  ];

  // early return for empty mails
  if (input.mails.length === 0) {
    return [...headerLines, `   \u2514\u2500 (no mails to display)`].join('\n');
  }

  // mail items via flatMap (immutable)
  const mailLines = input.mails.flatMap((mail, index) =>
    getMailLines({ mail, isLast: index === input.mails.length - 1 }),
  );

  // combine via spread (immutable)
  const lines = [...headerLines, `   \u2514\u2500 mails`, ...mailLines];

  return lines.join('\n');
};
