import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getAllCachedMailFilenames } from './getAllCachedMailFilenames';
import { getCacheDir } from './getCacheDir';

/**
 * .what = count how many mails the cache currently holds for a repo
 * .why = `mailFoundQuant` means "total mails found and cached", so the CACHE is its one
 *   source of truth. it was once accumulated instead — `prior + thisRun` — which made a
 *   re-run over the same range count the same mails twice and grow the number without
 *   bound, while the cache itself stayed correct (`upsertCachedMail` keys on the exid).
 *   read it from the cache and the count converges on a re-run, same as the cache does
 *   (`rule.require.fewer-paths-via-idempotency`).
 *
 * .note = it counts FILENAMES rather than a parse of each file. the name alone answers
 *   the question, and a parse of every mail to produce one integer would make the count
 *   cost grow with the mailbox.
 */
export const getCachedMailQuant = async (input: {
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<number> => {
  const files = await getAllCachedMailFilenames({
    cacheDir: getCacheDir({ repo: input.repo, cwd: input.cwd }),
  });

  return files.length;
};
