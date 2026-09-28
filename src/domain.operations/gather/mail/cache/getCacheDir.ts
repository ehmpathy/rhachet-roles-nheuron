import * as path from 'path';

import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

/**
 * .what = compute full cache directory path for a repo
 * .why = consistent cache location across operations
 *
 * format: {cwd}/.agent/.cache/repo=nheuron/role=gatherer/skill=gather.mail/mechanism={mechanism}/address={address}
 */
export const getCacheDir = (input: {
  repo: GatheredMailRepo;
  cwd: string | null;
}): string => {
  const cwd = input.cwd ?? process.cwd();
  return path.join(
    cwd,
    '.agent',
    '.cache',
    'repo=nheuron',
    'role=gatherer',
    'skill=gather.mail',
    `mechanism=${input.repo.mechanism}`,
    `address=${input.repo.address}`,
  );
};
