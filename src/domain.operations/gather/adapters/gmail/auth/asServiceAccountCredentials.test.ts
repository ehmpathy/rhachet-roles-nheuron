import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { asServiceAccountCredentials } from './asServiceAccountCredentials';

/** the minimum shape google's console emits that this accepts */
const CREDENTIAL_VALID = {
  type: 'service_account',
  project_id: 'nheuron-test',
  private_key_id: 'kid',
  private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
  client_email: 'jelly@nheuron-test.iam.gserviceaccount.com',
  client_id: '123',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

/**
 * .what = clamps the ONE verdict two commands must share about one credential
 * .why = ⚠️ this validator was a private function inside `getServiceAccountAccessToken`, so
 *   only the MINT path ran it. `getAuthStatus` had its own answer — bare presence of the two
 *   env keys — and returned `authenticated` for a credential the mint would reject on the
 *   very next command. one env, two commands, two answers, and the human asked the false one
 *   first (`rule.forbid.failhide`).
 *
 * .note = the cases below are the near-misses a human actually hits. none is exotic: a paste
 *   cut short, and the oauth client json that downloads from the same console under a
 *   similar name and is not a service account at all.
 */
describe('asServiceAccountCredentials', () => {
  given('[case1] the json google actually emits', () => {
    when('[t0] cast', () => {
      then('the credential comes back intact', () => {
        const credential = asServiceAccountCredentials({
          json: JSON.stringify(CREDENTIAL_VALID),
        });

        expect(credential.client_email).toEqual(CREDENTIAL_VALID.client_email);
        expect(credential.token_uri).toEqual(CREDENTIAL_VALID.token_uri);
      });
    });
  });

  given('[case2] a paste cut short', () => {
    when('[t0] cast', () => {
      then('it refuses, and names the key to re-fill', async () => {
        const error = await getError(() =>
          asServiceAccountCredentials({ json: '{"type":"service_acc' }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('parse failed');
        expect(error.message).toContain('GMAIL_SERVICE_ACCOUNT_JSON');
      });
    });
  });

  /**
   * .what = the near-miss that reads plausible to a human and is the wrong file
   * .why = an oauth client json downloads from the same console page, has a `client_id` and
   *   a `token_uri`, and looks correct at a glance. the `type` check is the one field that
   *   tells them apart, which is why it is checked FIRST — every other guard below would
   *   pass on it and the failure would surface much later, as a signature error.
   */
  given('[case3] an oauth client json, not a service account', () => {
    when('[t0] cast', () => {
      then('it refuses, and says which file was wanted', async () => {
        const error = await getError(() =>
          asServiceAccountCredentials({
            json: JSON.stringify({
              type: 'authorized_user',
              client_id: '123',
              client_secret: 'shh',
              token_uri: 'https://oauth2.googleapis.com/token',
            }),
          }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('not a service account');
      });
    });
  });

  given('[case4] a service account with no private key', () => {
    when('[t0] cast', () => {
      then('it refuses, and names the absent field', async () => {
        const error = await getError(() =>
          asServiceAccountCredentials({
            json: JSON.stringify({
              ...CREDENTIAL_VALID,
              private_key: undefined,
            }),
          }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('private_key');
      });
    });
  });
});
