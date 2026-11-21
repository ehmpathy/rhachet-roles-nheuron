import * as fs from 'fs/promises';
import * as path from 'path';

import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getTokenCacheDir } from './getTokenCacheDir';

/**
 * .what = store token in cache (idempotent upsert)
 * .why = persist oauth tokens for mechanism + address
 */
export const upsertGatherAccessToken = async (input: {
  repo: GatheredMailRepo;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  cwd: string | null;
}): Promise<void> => {
  const tokenDir = getTokenCacheDir({ cwd: input.cwd });
  const mechanismDir = path.join(tokenDir, `mechanism=${input.repo.mechanism}`);
  const tokenPath = path.join(
    mechanismDir,
    `address=${input.repo.address}.json`,
  );

  // ensure directory
  await fs.mkdir(mechanismDir, { recursive: true });

  // write token as json
  const content = JSON.stringify(
    {
      mechanism: input.repo.mechanism,
      address: input.repo.address,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt.toJSON(),
    },
    null,
    2,
  );
  await fs.writeFile(tokenPath, content, 'utf-8');
};
