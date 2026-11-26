import { UnexpectedCodePathError } from 'helpful-errors';

/**
 * .what = parse and validate google oauth token response
 * .why = pure transformer for response parse at external boundary
 */
export const asGoogleTokenResponse = (input: {
  json: unknown;
  address: string;
  status: number;
}): {
  access_token: string;
  expires_in: number;
  /**
   * present ONLY when google rotates it. a refresh response usually omits it, so an
   * absent one is the common case rather than a fault — but when it IS present the
   * caller must persist it, or every later refresh presents a revoked token
   * (see `getGmailAuthAdapter.genAuthRefresh`)
   */
  refresh_token: string | null;
} => {
  // guard: verify shape at external boundary
  const data = input.json as Record<string, unknown>;
  if (
    typeof data?.access_token !== 'string' ||
    typeof data?.expires_in !== 'number'
  ) {
    throw new UnexpectedCodePathError('invalid token response shape', {
      address: input.address,
      status: input.status,
      hasAccessToken: typeof data?.access_token,
      hasExpiresIn: typeof data?.expires_in,
      hint: 'google oauth api response did not match expected shape',
    });
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    // pass a rotated refresh token through rather than drop it. this transformer once
    // returned only the two fields above, so a rotation was discarded here before the
    // adapter could ever see it — the token would then be silently stale
    refresh_token:
      typeof data.refresh_token === 'string' ? data.refresh_token : null,
  };
};
