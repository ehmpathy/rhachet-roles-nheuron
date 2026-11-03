import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getGmailAuthAdapter } from './getGmailAuthAdapter';

const CREDENTIAL_VALID = JSON.stringify({
  type: 'service_account',
  project_id: 'nheuron-test',
  private_key_id: 'kid',
  private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
  client_email: 'jelly@nheuron-test.iam.gserviceaccount.com',
  client_id: '123',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});

const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * .what = put an env key back to a prior value, or remove it when it had none
 * .why = `process.env.X = undefined` stores the STRING `'undefined'`, which is truthy — so a
 *   bare restore of an unset key leaks a fake credential into every later suite in the worker
 */
const setEnvOrDel = (input: {
  key: string;
  value: string | undefined;
}): void => {
  if (input.value === undefined) {
    delete process.env[input.key];
    return;
  }
  process.env[input.key] = input.value;
};

/**
 * .what = clamps that `gather.auth` cannot report a readiness `gather.mail` will refuse
 * .why = ⚠️ `getAuthStatus` returned `authenticated` the moment both service-account env keys
 *   were merely PRESENT, with no check that either held a real credential. so a human who
 *   pasted a truncated json saw `boop! auth ready / status: authenticated`, and the very next
 *   `gather.mail` threw `service account json parse failed` at the token mint. two commands
 *   disagreed about one env — and the one asked first was the one that was wrong
 *   (`rule.forbid.failhide`).
 *
 *   a plain refusal would have cost the human one read. a false green costs them a search for
 *   a fault in the one place the tool just told them was fine.
 *
 * ⚠️ .note = these cases run NO remote boundary, which is why they are unit. a service
 *   account is answered before the repo and before the token cache, so neither branch below
 *   reaches the filesystem (`rule.forbid.unit.remote-boundaries`).
 *
 * .note = the env is saved and restored. these keys are read live from `process.env` at call
 *   time — unlike `TZ`, which node caches, so a mutation here does reach the code under test.
 */
describe('getGmailAuthAdapter.getAuthStatus', () => {
  const envPrior = {
    json: process.env.GMAIL_SERVICE_ACCOUNT_JSON,
    subject: process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT,
  };

  afterAll(() => {
    setEnvOrDel({ key: 'GMAIL_SERVICE_ACCOUNT_JSON', value: envPrior.json });
    setEnvOrDel({
      key: 'GMAIL_SERVICE_ACCOUNT_SUBJECT',
      value: envPrior.subject,
    });
  });

  given('[case1] both keys filled with a real service account', () => {
    beforeAll(() => {
      process.env.GMAIL_SERVICE_ACCOUNT_JSON = CREDENTIAL_VALID;
      process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT = 'jelly@nheuron.com';
    });

    when('[t0] the status is asked', () => {
      then('it reports authenticated', async () => {
        const status = await getGmailAuthAdapter({ cwd: null }).getAuthStatus(
          { repo: null },
          { log },
        );

        expect(status).toEqual('authenticated');
      });
    });
  });

  given('[case2] both keys filled, but the json is a truncated paste', () => {
    beforeAll(() => {
      process.env.GMAIL_SERVICE_ACCOUNT_JSON = '{"type":"service_acc';
      process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT = 'jelly@nheuron.com';
    });

    when('[t0] the status is asked', () => {
      then('it refuses rather than report a false readiness', async () => {
        // ⚠️ the teeth. drop the validation and this RESOLVES with 'authenticated' — the
        // exact false green a human then trusts
        const error = await getError(() =>
          getGmailAuthAdapter({ cwd: null }).getAuthStatus(
            { repo: null },
            { log },
          ),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('parse failed');
      });

      then('the refusal names the key to re-fill', async () => {
        const error = await getError(() =>
          getGmailAuthAdapter({ cwd: null }).getAuthStatus(
            { repo: null },
            { log },
          ),
        );

        expect(error.message).toContain('GMAIL_SERVICE_ACCOUNT_JSON');
      });
    });
  });

  /**
   * .what = the near-miss: the wrong file from the right console page
   * .why = an oauth client json is what a human downloads when they follow the setup guide
   *   one step too fast. it is valid json, so [case2]'s guard does not catch it.
   */
  given('[case3] both keys filled, but the json is an oauth client', () => {
    beforeAll(() => {
      process.env.GMAIL_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'authorized_user',
        client_id: '123',
        token_uri: 'https://oauth2.googleapis.com/token',
      });
      process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT = 'jelly@nheuron.com';
    });

    when('[t0] the status is asked', () => {
      then('it refuses, and says which file was wanted', async () => {
        const error = await getError(() =>
          getGmailAuthAdapter({ cwd: null }).getAuthStatus(
            { repo: null },
            { log },
          ),
        );

        expect(error.message).toContain('not a service account');
      });
    });
  });
});
