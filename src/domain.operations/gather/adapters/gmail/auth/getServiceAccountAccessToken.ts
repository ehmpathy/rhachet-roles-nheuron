import { UnexpectedCodePathError } from 'helpful-errors';

import { fetchWithTimeout } from '../fetchWithTimeout';
import { asServiceAccountCredentials } from './asServiceAccountCredentials';
import { asSignedServiceAccountJwt } from './asSignedServiceAccountJwt';
import { getExpiresAtFromTokenResponse } from './getExpiresAtFromTokenResponse';

/**
 * .what = exchange jwt for access token via google token endpoint
 * .why = service accounts authenticate via jwt assertion grant
 */
export const getServiceAccountAccessToken = async (input: {
  serviceAccountJson: string;
  subject: string;
  scope?: string;
}): Promise<{ accessToken: string; expiresAt: Date }> => {
  // parse credentials
  const credentials = asServiceAccountCredentials({
    json: input.serviceAccountJson,
  });

  // create signed jwt
  const jwt = asSignedServiceAccountJwt({
    credentials,
    subject: input.subject,
    scope: input.scope ?? 'https://www.googleapis.com/auth/gmail.readonly',
    now: new Date(),
  });

  // exchange jwt for access token — bounded by a timeout so a hung token endpoint
  // surfaces as a named error rather than a silent hang (`fetchWithTimeout`)
  const response = await fetchWithTimeout({
    url: credentials.token_uri,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    },
    what: 'service account token exchange',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new UnexpectedCodePathError('service account token exchange failed', {
      status: response.status,
      error,
      subject: input.subject,
      hint: 'check domain-wide delegation is configured for this service account',
    });
  }

  // parse token response.
  //
  // ⚠️ the parse is wrapped, never bare. a 2xx whose body is NOT json — a proxy's html error
  // page, a truncated body — makes `response.json()` throw a raw `SyntaxError` that names
  // neither the subject nor the status nor the fix. the peer refresh path
  // (`getGmailAuthAdapter`) already wraps its own `response.json()` this exact way; the same
  // external boundary was left bare here (`rule.require.errors-name-the-fix`).
  const data = await (async (): Promise<{
    access_token?: string;
    expires_in?: number;
  }> => {
    try {
      return (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };
    } catch (error: any) {
      throw new UnexpectedCodePathError(
        'service account token response parse failed',
        {
          cause: error,
          status: response.status,
          subject: input.subject,
          hint: 'token endpoint returned a non-json body (a proxy html error page?)',
        },
      );
    }
  })();

  if (!data.access_token || !data.expires_in) {
    throw new UnexpectedCodePathError('token response lacks required fields', {
      hasAccessToken: !!data.access_token,
      hasExpiresIn: !!data.expires_in,
    });
  }

  return {
    accessToken: data.access_token,
    expiresAt: getExpiresAtFromTokenResponse({ expiresIn: data.expires_in }),
  };
};
