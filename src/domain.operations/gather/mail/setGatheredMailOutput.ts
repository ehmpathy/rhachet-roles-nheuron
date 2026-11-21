import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

import { getJsonOutput } from './transformers/getJsonOutput';
import { getSortedMails } from './transformers/getSortedMails';
import { getTreeOutput } from './transformers/getTreeOutput';

/**
 * .what = format and emit gathered mail results
 * .why = orchestrator composes sort + format + emit
 *
 * narrative steps:
 *   1. getSortedMails → sort mails deterministically
 *   2. getTreeOutput or getJsonOutput → format for output
 *   3. setStdout → write to stdout
 */
export const setGatheredMailOutput = (
  input: {
    mails: GatheredMail[];
    stats: GatheredMailSyncStats;
    mechanism: GatheredMailMechanism;
    address: string;
    /**
     * the slice of the mailbox this run asked for.
     *
     * .why = the output must SAY it. a filtered run lists only what it fetched while an
     *   unfiltered one lists the cached range, and the two are indistinguishable from the
     *   list alone (`rule.forbid.ambiguous-labels`).
     */
    filter: GatherMailFilter;
    format: 'tree' | 'json';
  },
  context: {
    setStdout: (content: string) => void;
  },
): void => {
  // sort mails deterministically
  const mailsSorted = getSortedMails({ mails: input.mails });

  // format for output
  const output =
    input.format === 'json'
      ? getJsonOutput({
          mails: mailsSorted,
          stats: input.stats,
          filter: input.filter,
        })
      : getTreeOutput({
          mails: mailsSorted,
          stats: input.stats,
          mechanism: input.mechanism,
          address: input.address,
          filter: input.filter,
        });

  // emit to stdout, newline-terminated so the shell prompt starts on its own line
  context.setStdout(`${output}\n`);
};
