import * as fs from 'fs/promises';
import * as path from 'path';

import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { getSyncStatsFromJson } from '../transformers/getSyncStatsFromJson';
import { getCacheDir } from './getCacheDir';

/**
 * .what = read sync stats from cache
 * .why = resume incremental fetch from last sync position
 */
export const getOneSyncStats = async (input: {
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<GatheredMailSyncStats> => {
  const cacheDir = getCacheDir({ repo: input.repo, cwd: input.cwd });
  const filePath = path.join(cacheDir, '.sync.json');

  // read the file, or null when it is absent. one const, one flow — the read and its
  // absent case are answered inside the expression rather than across a mutated
  // binding (`rule.require.immutable-vars`)
  const syncJson = await (async (): Promise<string | null> => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      // allowlist ENOENT ONLY — an absent file is the expected first-run state. every
      // other error (a permission fault, a directory where a file belongs) is a real
      // fault, and to read it as "no prior sync" would silently re-fetch every mail
      // (rule.forbid.failhide)
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw error;
    }
  })();

  return getSyncStatsFromJson({ syncJson });
};
