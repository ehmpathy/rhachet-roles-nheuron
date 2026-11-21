import { BadRequestError } from 'helpful-errors';

/**
 * .what = service account json shape from google cloud console
 * .why = type the expected structure for validation
 */
export interface ServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

/**
 * .what = cast the raw `GMAIL_SERVICE_ACCOUNT_JSON` string into validated credentials
 * .why = the value is a secret a human pastes by hand, so it is the input most likely to be
 *   truncated, half-quoted, or the wrong file entirely (an oauth client json reads plausibly
 *   like a service account json to a human, and is not one).
 *
 * ⚠️ .why here = it is EXPORTED and lives in its own module because TWO callers must reach
 *   the same verdict on the same env, and they used to reach different ones:
 *
 *   | caller | before | after |
 *   |--------|--------|-------|
 *   | `getAuthStatus` (what `gather.auth` prints) | `authenticated`, on bare presence | the real verdict |
 *   | `getAccessToken` (what `gather.mail` mints) | threw `service account json parse failed` | the same verdict |
 *
 *   so a human who filled both keys with a wrong value was told `boop! auth ready / status:
 *   authenticated`, and the very next command failed at the token mint. two commands
 *   disagreed about one env, and the first one lied (`rule.require.ubiqlang`,
 *   `rule.forbid.failhide`). the status asserted a readiness the adapter could not stand
 *   behind — a silent half-success, which reads worse than a plain refusal because the
 *   human trusts it and looks elsewhere for the fault.
 *
 * .note = the fix is ONE validator with two callers, never a second check kept in step by
 *   discipline. this is the same move `getAuthFixHintForMechanism` made for the auth hint,
 *   for the same reason: a copy stays in step only until someone edits one of them.
 */
export const asServiceAccountCredentials = (input: {
  json: string;
}): ServiceAccountCredentials => {
  const parsed = (() => {
    try {
      return JSON.parse(input.json) as Record<string, unknown>;
    } catch (error) {
      throw new BadRequestError('service account json parse failed', {
        cause: error instanceof Error ? error : undefined,
        hint: 'ensure GMAIL_SERVICE_ACCOUNT_JSON contains valid json',
      });
    }
  })();

  // an oauth client json is the near-miss a human actually hits — it downloads from the same
  // console, under a similar name, and every other field check below would pass on it
  if (parsed.type !== 'service_account') {
    throw new BadRequestError('not a service account credential', {
      type: parsed.type,
      hint: 'ensure json is from a service account, not oauth client',
    });
  }

  const required = ['private_key', 'client_email', 'token_uri'] as const;

  for (const field of required) {
    if (typeof parsed[field] !== 'string') {
      throw new BadRequestError(`service account lacks ${field}`, {
        hint: 'download fresh credentials from google cloud console',
      });
    }
  }

  return parsed as unknown as ServiceAccountCredentials;
};
