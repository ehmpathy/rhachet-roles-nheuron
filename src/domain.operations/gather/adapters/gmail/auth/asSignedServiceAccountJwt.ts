import * as crypto from 'crypto';

import type { ServiceAccountCredentials } from './asServiceAccountCredentials';

/**
 * .what = base64url encode for jwt
 * .why = jwt requires url-safe base64 without pad characters
 */
const asBase64Url = (input: string | Buffer): string => {
  const base64 = Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * .what = sign the jwt assertion a service account trades for an access token
 * .why = google's jwt-bearer grant requires an rs256 assertion that names the issuer, the
 *   impersonated subject, the audience, and the scope. pure compute, no i/o, so the
 *   signature is testable with no network and reusable for a second google endpoint.
 */
export const asSignedServiceAccountJwt = (input: {
  credentials: ServiceAccountCredentials;
  subject: string;
  scope: string;
  now: Date;
}): string => {
  const issuedAt = Math.floor(input.now.getTime() / 1000);

  // jwt header + claims
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: input.credentials.client_email,
    sub: input.subject, // impersonate this user
    aud: input.credentials.token_uri,
    iat: issuedAt,
    exp: issuedAt + 3600, // 1 hour
    scope: input.scope,
  };

  // encode header and claims
  const unsigned = `${asBase64Url(JSON.stringify(header))}.${asBase64Url(JSON.stringify(claims))}`;

  // sign with private key
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(input.credentials.private_key);

  return `${unsigned}.${asBase64Url(signature)}`;
};
