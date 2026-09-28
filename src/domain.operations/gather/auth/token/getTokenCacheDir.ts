import * as path from 'path';

/**
 * .what = compute token cache directory path
 * .why = centralize path logic for token storage
 */
export const getTokenCacheDir = (input: { cwd: string | null }): string => {
  const cwd = input.cwd ?? process.cwd();
  return path.join(
    cwd,
    '.agent',
    '.cache',
    'repo=nheuron',
    'role=gatherer',
    'skill=gather.auth',
    'tokens',
  );
};
