import type { PaginationInput } from 'pagination-fns';

import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import type { GatherMailAdapter } from '@src/domain.objects/GatherMailAdapter';

import { getAllCachedMailExids } from './cache/getAllCachedMailExids';
import { getAllCachedMails } from './cache/getAllCachedMails';
import { getCacheDir } from './cache/getCacheDir';
import { getCachedMailQuant } from './cache/getCachedMailQuant';
import { getOneSyncStats } from './cache/getOneSyncStats';
import { upsertCachedMails } from './cache/upsertCachedMails';
import { upsertSyncStats } from './cache/upsertSyncStats';
import { getMailsWithinRange } from './transformers/getMailsWithinRange';
import { getMergedSyncStats } from './transformers/getMergedSyncStats';
import { getPaginationInput } from './transformers/getPaginationInput';

/**
 * .what = sync mails from adapter into local cache
 * .why = orchestrator composes adapter + cache operations
 *
 * narrative steps:
 *   1. getOneSyncStats → load sync stats from cache
 *   2. mailAdapter.getAllMail → fetch mails with pagination
 *   3. upsertCachedMails → persist each mail to cache
 *   4. upsertSyncStats → persist updated sync stats
 */
export const setMailsFromAdapter = async (
  input: {
    in: {
      repo: GatheredMailRepo;
    };
    /**
     * the caller's `--since`, if they gave one — NOT a built page.
     *
     * .why = the page's lower bound defaults to the prior run's cursor, and that cursor is a
     *   cache fact this operation already reads. built upstream, the bound could only ever
     *   come from the flag — which is exactly how `mailFoundUptil` came to be persisted every
     *   run and read by no one.
     */
    since: string | null;
    limit: number;
  },
  context: {
    mailAdapter: GatherMailAdapter;
    log: GatherLogMethods;
    accessToken: string;
    cwd: string | null;
  },
): Promise<{
  mails: GatheredMail[];
  stats: GatheredMailSyncStats;
  page: PaginationInput<{ deliveredAt: Date }> | null;
}> => {
  const { repo } = input.in;
  const { mailAdapter, log, accessToken, cwd } = context;

  // load sync stats from cache
  const statsPrior = await getOneSyncStats({ repo, cwd });
  log.debug('setMailsFromAdapter: loaded stats', {
    mailFoundUptil: statsPrior.mailFoundUptil,
    mailFoundQuant: statsPrior.mailFoundQuant,
  });

  // build the range HERE, where the prior cursor is in hand. an absent `--since` falls back
  // to `mailFoundUptil`, which is what makes a bare re-run incremental rather than a full
  // re-scan
  const page = getPaginationInput({
    since: input.since,
    cursorPrior: statsPrior.mailFoundUptil,
    limit: input.limit,
  });
  log.debug('setMailsFromAdapter: range', {
    sinceRequested: input.since,
    sinceApplied: page.range.since?.deliveredAt ?? null,
  });

  // name what the cache already holds, so a per-mail mechanism can skip re-fetch of it.
  // read from FILENAMES, so this costs one directory read rather than a parse of every mail
  const exidsKnown = await getAllCachedMailExids({
    cacheDir: getCacheDir({ repo, cwd }),
  });
  log.debug('setMailsFromAdapter: cached exids', {
    exidKnownQuant: exidsKnown.length,
  });

  // fetch mails from adapter
  const result = await mailAdapter.getAllMail(
    { in: { repo }, page, exidsKnown },
    { log, accessToken },
  );

  // persist mails to cache
  await upsertCachedMails({ mails: result.mails, repo, cwd });
  log.debug('setMailsFromAdapter: cached mails', {
    count: result.mails.length,
  });

  // report the WHOLE range, from the cache, rather than only what this run fetched.
  //
  // .why = `exidsKnown` narrows what an adapter FETCHES; it must never narrow what the
  //   caller SEES. ses skips the body read for a mail it already holds, so that mail is
  //   absent from `result.mails` — and were the output taken from there, a second run over
  //   the same range would report fewer mails than the first while the mailbox was
  //   unchanged (`rule.forbid.surprises`). the cache holds the union — it was just written
  //   above — so the range is read back from the one place that has all of it.
  const mails = getMailsWithinRange({
    mails: await getAllCachedMails({ repo, cwd }),
    page,
  });
  log.debug('setMailsFromAdapter: reported range', {
    mailFetchQuant: result.mails.length,
    mailRangeQuant: mails.length,
  });

  // count what the cache now holds — the total is read from it rather than accumulated,
  // so a re-run over the same range converges instead of double-counts
  const mailCachedQuant = await getCachedMailQuant({ repo, cwd });

  // compute updated stats
  const statsAfter = getMergedSyncStats({
    statsPrior,
    statsDelta: result.stats,
    mailCachedQuant,
  });

  // persist updated sync stats
  await upsertSyncStats({ stats: statsAfter, repo, cwd });
  log.debug('setMailsFromAdapter: updated stats', {
    mailFoundUptil: statsAfter.mailFoundUptil,
    mailFoundQuant: statsAfter.mailFoundQuant,
  });

  return {
    mails,
    stats: statsAfter,
    page: result.page,
  };
};
