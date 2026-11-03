import { BadRequestError } from 'helpful-errors';

import { getSesConfig, type SesConfig } from './getSesConfig';

/**
 * .what = read the ses config, or null when keyrack has not placed it
 * .why = an absent config is a real state to the auth adapter (not yet unlocked), so its
 *   two reads — `getAuthStatus` and `getAccessToken` — must both see it as null, never one
 *   as null and the other as a throw. the catch allowlists ONLY the absent-config
 *   refusal and rethrows every other error (rule.forbid.failhide)
 */
export const getSesConfigOrNull = (): SesConfig | null => {
  try {
    return getSesConfig();
  } catch (error) {
    if (error instanceof BadRequestError) return null;
    throw error;
  }
};
