import * as crypto from 'crypto';
import { given, then, when } from 'test-fns';

import type { ServiceAccountCredentials } from './asServiceAccountCredentials';
import { asSignedServiceAccountJwt } from './asSignedServiceAccountJwt';

const keypair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const credentials: ServiceAccountCredentials = {
  type: 'service_account',
  project_id: 'demo-project',
  private_key_id: 'demo-key-id',
  private_key: keypair.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString(),
  client_email: 'sa@demo-project.iam.gserviceaccount.com',
  client_id: '123',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

const asJsonFromBase64Url = (input: { part: string }): unknown =>
  JSON.parse(Buffer.from(input.part, 'base64url').toString('utf-8'));

describe('asSignedServiceAccountJwt', () => {
  given('[case1] a service account and a subject to impersonate', () => {
    when('[t0] the jwt is signed', () => {
      const jwt = asSignedServiceAccountJwt({
        credentials,
        subject: 'human@example.com',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        now: new Date('2026-11-01T00:00:00.000Z'),
      });
      const [header, claims, signature] = jwt.split('.');

      then('it has three url-safe parts, no pad characters', () => {
        expect(jwt.split('.')).toHaveLength(3);
        expect(jwt).not.toMatch(/[+/=]/);
      });

      then('the header names rs256', () => {
        expect(asJsonFromBase64Url({ part: header! })).toEqual({
          alg: 'RS256',
          typ: 'JWT',
        });
      });

      then(
        'the claims name issuer, subject, audience, scope, and a 1h life',
        () => {
          const issuedAt = Date.parse('2026-11-01T00:00:00.000Z') / 1000;
          expect(asJsonFromBase64Url({ part: claims! })).toEqual({
            iss: credentials.client_email,
            sub: 'human@example.com',
            aud: credentials.token_uri,
            iat: issuedAt,
            exp: issuedAt + 3600,
            scope: 'https://www.googleapis.com/auth/gmail.readonly',
          });
        },
      );

      then('the signature verifies against the public key', () => {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(`${header}.${claims}`);
        expect(
          verifier.verify(
            keypair.publicKey,
            Buffer.from(signature!, 'base64url'),
          ),
        ).toBe(true);
      });
    });
  });
});
