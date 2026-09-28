import * as fs from 'fs/promises';
import * as path from 'path';

import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { getCacheDir } from './getCacheDir';

/**
 * .what = write sync stats to cache (idempotent)
 * .why = persist sync progress for incremental fetch
 */
export const upsertSyncStats = async (input: {
  stats: GatheredMailSyncStats;
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<void> => {
  const cacheDir = getCacheDir({ repo: input.repo, cwd: input.cwd });
  const filePath = path.join(cacheDir, '.sync.json');

  // ensure directory
  await fs.mkdir(cacheDir, { recursive: true });

  // write stats
  const content = JSON.stringify(
    {
      mailFoundUptil: input.stats.mailFoundUptil?.toISOString() ?? null,
      mailFoundQuant: input.stats.mailFoundQuant,
      mailSyncedQuant: input.stats.mailSyncedQuant,
    },
    null,
    2,
  );
  await fs.writeFile(filePath, content, 'utf-8');
};
