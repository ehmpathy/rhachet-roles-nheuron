import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getIsTokenExpired } from './getIsTokenExpired';
import { getOneGatherAccessToken } from './getOneGatherAccessToken';

/**
 * .what = check current auth state for mechanism + address
 * .why = determine if auth flow is needed before operations
 */
export const getOneGatherAuthStatus = async (input: {
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<GatherAuthStatus> => {
  // fetch stored token
  const token = await getOneGatherAccessToken({
    repo: input.repo,
    cwd: input.cwd,
  });

  // no token = anonymous
  if (!token) return 'anonymous';

  // check if expired
  const isExpired = getIsTokenExpired({ token, now: null });
  if (isExpired) return 'expired';

  return 'authenticated';
};
