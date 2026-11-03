import { given, then, when } from 'test-fns';

import { getTokenCacheDir } from './getTokenCacheDir';

describe('getTokenCacheDir', () => {
  given('[case1] default cwd', () => {
    when('[t0] getTokenCacheDir is called', () => {
      then('returns expected path', () => {
        const result = getTokenCacheDir({ cwd: null });
        expect(result).toContain(
          '.agent/.cache/repo=nheuron/role=gatherer/skill=gather.auth/tokens',
        );
      });
    });
  });

  given('[case2] custom cwd', () => {
    when('[t0] getTokenCacheDir is called', () => {
      then('uses provided cwd', () => {
        const result = getTokenCacheDir({ cwd: '/custom/path' });
        expect(result).toBe(
          '/custom/path/.agent/.cache/repo=nheuron/role=gatherer/skill=gather.auth/tokens',
        );
      });
    });
  });
});
