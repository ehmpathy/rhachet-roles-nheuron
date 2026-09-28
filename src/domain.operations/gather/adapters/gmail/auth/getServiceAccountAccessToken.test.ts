import { given, then, when } from 'test-fns';

import { getServiceAccountAccessToken } from './getServiceAccountAccessToken';

describe('getServiceAccountAccessToken', () => {
  given('[case1] invalid json', () => {
    when('[t0] json is malformed', () => {
      then('throws parse error', async () => {
        const error = await getServiceAccountAccessToken({
          serviceAccountJson: 'not-json',
          subject: 'test@example.com',
        }).catch((e) => e);

        expect(error.message).toContain('parse failed');
      });
    });
  });

  given('[case2] not a service account', () => {
    when('[t0] json is oauth client credentials', () => {
      then('throws type error', async () => {
        const error = await getServiceAccountAccessToken({
          serviceAccountJson: JSON.stringify({
            type: 'authorized_user',
            client_id: '123',
          }),
          subject: 'test@example.com',
        }).catch((e) => e);

        expect(error.message).toContain('not a service account');
      });
    });
  });

  given('[case3] service account lacks required fields', () => {
    when('[t0] private_key is absent', () => {
      then('throws validation error', async () => {
        const error = await getServiceAccountAccessToken({
          serviceAccountJson: JSON.stringify({
            type: 'service_account',
            client_email: 'sa@project.iam.gserviceaccount.com',
            token_uri: 'https://oauth2.googleapis.com/token',
            // private_key absent
          }),
          subject: 'test@example.com',
        }).catch((e) => e);

        expect(error.message).toContain('lacks private_key');
      });
    });
  });
});
