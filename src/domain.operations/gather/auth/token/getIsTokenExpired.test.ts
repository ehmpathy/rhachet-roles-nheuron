import { given, then, when } from 'test-fns';

import { GatherAccessToken } from '@src/domain.objects/GatherAccessToken';

import { getIsTokenExpired } from './getIsTokenExpired';

describe('getIsTokenExpired', () => {
  given('[case1] token expires in the future', () => {
    const token = new GatherAccessToken({
      mechanism: 'gmail',
      address: 'test@gmail.com',
      accessToken: 'access_123',
      refreshToken: 'refresh_456',
      expiresAt: new Date('2024-01-15T12:00:00Z'),
    });

    when('[t0] checked against time well before expiry', () => {
      then('returns false', () => {
        const now = new Date('2024-01-15T11:00:00Z');
        const result = getIsTokenExpired({ token, now });
        expect(result).toBe(false);
      });
    });
  });

  given('[case2] token expired in the past', () => {
    const token = new GatherAccessToken({
      mechanism: 'gmail',
      address: 'test@gmail.com',
      accessToken: 'access_123',
      refreshToken: 'refresh_456',
      expiresAt: new Date('2024-01-15T12:00:00Z'),
    });

    when('[t0] checked against time after expiry', () => {
      then('returns true', () => {
        const now = new Date('2024-01-15T13:00:00Z');
        const result = getIsTokenExpired({ token, now });
        expect(result).toBe(true);
      });
    });
  });

  given('[case3] token expires within 5 minute buffer', () => {
    const token = new GatherAccessToken({
      mechanism: 'gmail',
      address: 'test@gmail.com',
      accessToken: 'access_123',
      refreshToken: 'refresh_456',
      expiresAt: new Date('2024-01-15T12:00:00Z'),
    });

    when('[t0] checked against time 3 minutes before expiry', () => {
      then('returns true due to buffer', () => {
        const now = new Date('2024-01-15T11:57:00Z');
        const result = getIsTokenExpired({ token, now });
        expect(result).toBe(true);
      });
    });

    when('[t1] checked against time 10 minutes before expiry', () => {
      then('returns false', () => {
        const now = new Date('2024-01-15T11:50:00Z');
        const result = getIsTokenExpired({ token, now });
        expect(result).toBe(false);
      });
    });
  });
});
