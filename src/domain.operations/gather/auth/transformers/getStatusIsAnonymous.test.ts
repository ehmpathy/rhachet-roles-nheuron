import { given, then, when } from 'test-fns';

import { getStatusIsAnonymous } from './getStatusIsAnonymous';

describe('getStatusIsAnonymous', () => {
  given('[case1] anonymous status', () => {
    when('[t0] checked', () => {
      then('returns true', () => {
        const result = getStatusIsAnonymous({ status: 'anonymous' });
        expect(result).toBe(true);
      });
    });
  });

  given('[case2] authenticated status', () => {
    when('[t0] checked', () => {
      then('returns false', () => {
        const result = getStatusIsAnonymous({ status: 'authenticated' });
        expect(result).toBe(false);
      });
    });
  });

  given('[case3] expired status', () => {
    when('[t0] checked', () => {
      then('returns false', () => {
        const result = getStatusIsAnonymous({ status: 'expired' });
        expect(result).toBe(false);
      });
    });
  });
});
