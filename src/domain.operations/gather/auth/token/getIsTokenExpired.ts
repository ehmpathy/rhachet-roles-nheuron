import type { GatherAccessToken } from '@src/domain.objects/GatherAccessToken';

/**
 * .what = check if token has expired
 * .why = determine auth status without api call
 */
export const getIsTokenExpired = (input: {
  token: GatherAccessToken;
  now: Date | null;
}): boolean => {
  const expiresAtMs = input.token.expiresAt.getTime();

  // ⚠️ an Invalid Date reads as EXPIRED, never as valid. its getTime() is NaN, and every
  // comparison against NaN is false — so the bare `<` below would have answered "not
  // expired" for a token whose expiry we cannot read at all, and the caller would have
  // walked into the api with a dead token. `getOneGatherAccessToken` already refuses to
  // build such a token; this is the second wall, so no other construction path can
  // reintroduce the silent pass (rule.require.safe-by-default)
  if (Number.isNaN(expiresAtMs)) return true;

  const now = input.now ?? new Date();
  // add 5 minute buffer to avoid edge cases
  const bufferMs = 5 * 60 * 1000;
  return expiresAtMs - bufferMs < now.getTime();
};
