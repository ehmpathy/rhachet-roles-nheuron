import { getError, given, then, when } from 'test-fns';

import { asGoogleTokenResponse } from './asGoogleTokenResponse';

describe('asGoogleTokenResponse', () => {
  given('[case1] a refresh response with no rotated token', () => {
    when('[t0] it is parsed', () => {
      const result = asGoogleTokenResponse({
        json: { access_token: 'at', expires_in: 3600 },
        address: 'human@example.com',
        status: 200,
      });

      then('it returns the token and expiry, refresh_token null', () => {
        expect(result).toEqual({
          access_token: 'at',
          expires_in: 3600,
          refresh_token: null,
        });
      });
    });
  });

  given('[case2] a response that rotates the refresh token', () => {
    when('[t0] it is parsed', () => {
      const result = asGoogleTokenResponse({
        json: { access_token: 'at', expires_in: 3600, refresh_token: 'rt2' },
        address: 'human@example.com',
        status: 200,
      });

      then('the rotated token passes through, never dropped', () => {
        expect(result.refresh_token).toEqual('rt2');
      });
    });
  });

  given('[case3] a response without access_token', () => {
    when('[t0] it is parsed', () => {
      const error = getError(() =>
        asGoogleTokenResponse({
          json: { expires_in: 3600 },
          address: 'human@example.com',
          status: 200,
        }),
      );

      then(
        'it refuses at the boundary, rather than pass a bad shape on',
        () => {
          expect(error.message).toContain('invalid token response shape');
        },
      );
    });
  });

  given('[case4] a response whose expires_in is not a number', () => {
    when('[t0] it is parsed', () => {
      const error = getError(() =>
        asGoogleTokenResponse({
          json: { access_token: 'at', expires_in: '3600' },
          address: 'human@example.com',
          status: 200,
        }),
      );

      then('it refuses at the boundary', () => {
        expect(error.message).toContain('invalid token response shape');
      });
    });
  });
});
