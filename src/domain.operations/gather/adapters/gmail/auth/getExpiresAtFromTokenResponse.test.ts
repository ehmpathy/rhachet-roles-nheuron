import { given, then, when } from 'test-fns';

import { getExpiresAtFromTokenResponse } from './getExpiresAtFromTokenResponse';

const NOW = new Date('2026-11-24T06:00:00.000Z');

const TEST_CASES = [
  {
    description: 'an hour-long token expires an hour after now',
    given: { expiresIn: 3600 },
    expect: '2026-11-24T07:00:00.000Z',
  },
  {
    description: 'a zero-second token expires at now',
    given: { expiresIn: 0 },
    expect: '2026-11-24T06:00:00.000Z',
  },
];

describe('getExpiresAtFromTokenResponse', () => {
  TEST_CASES.forEach((thisCase, index) => {
    given(`[case${index + 1}] ${thisCase.description}`, () => {
      when('[t0] the expiry is computed', () => {
        then('it is now plus expiresIn seconds', () => {
          const expiresAt = getExpiresAtFromTokenResponse({
            expiresIn: thisCase.given.expiresIn,
            now: NOW,
          });
          expect(expiresAt.toISOString()).toEqual(thisCase.expect);
        });
      });
    });
  });
});
