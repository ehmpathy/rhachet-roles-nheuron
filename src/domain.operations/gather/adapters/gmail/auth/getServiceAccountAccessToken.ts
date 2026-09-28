import * as crypto from 'crypto';
import { UnexpectedCodePathError } from 'helpful-errors';

import { fetchWithTimeout } from '../fetchWithTimeout';
import {
  asServiceAccountCredentials,
  type ServiceAccountCredentials,
} from './asServiceAccountCredentials';

/**
 * .what = base64url encode for jwt
 * .why = jwt requires url-safe base64 without pad characters
 */
const base64url = (input: string | Buffer): string => {
  const base64 = Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * .what = create signed jwt for service account auth
 * .why = google requires jwt assertion for service account token exchange
 */
const createSignedJwt = (input: {
  credentials: ServiceAccountCredentials;
  subject: string;
  scope: string;
}): string => {
  const now = Math.floor(Date.now() / 1000);

  // jwt header
  const header = { alg: 'RS256', typ: 'JWT' };

  // jwt claims
  const claims = {
    iss: input.credentials.client_email,
    sub: input.subject, // impersonate this user
    aud: input.credentials.token_uri,
    iat: now,
    exp: now + 3600, // 1 hour
    scope: input.scope,
  };

  // encode header and claims
  const headerB64 = base64url(JSON.stringify(header));
  const claimsB64 = base64url(JSON.stringify(claims));
  const unsigned = `${headerB64}.${claimsB64}`;

  // sign with private key
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(input.credentials.private_key);

  return `${unsigned}.${base64url(signature)}`;
};

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
  const jwt = createSignedJwt({
    credentials,
    subject: input.subject,
    scope: input.scope ?? 'https://www.googleapis.com/auth/gmail.readonly',
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
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
};
