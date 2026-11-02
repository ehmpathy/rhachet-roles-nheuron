import { given, then, when } from 'test-fns';

import { getCliLogMethods } from './getCliLogMethods';

/**
 * .what = clamps where a skill's log lines go
 * .why = a log line on stdout lands inside the skill's product — a json document a caller
 *   parses. with `log: console`, `log.debug` wrote to stdout on every real fetch
 */
describe('getCliLogMethods', () => {
  given('[case1] a bare run (not verbose)', () => {
    when('[t0] every level is called', () => {
      then('debug and info write naught; warn and error reach stderr', () => {
        const written: string[] = [];
        const log = getCliLogMethods(
          { isVerbose: false },
          { setStderr: (content) => written.push(content) },
        );
        log.debug('a debug line', { page: 1 });
        log.info('an info line');
        log.warn('a warn line', { keysUndated: 2 });
        log.error('an error line');
        expect(written).toEqual([
          'warn: a warn line {"keysUndated":2}\n',
          'error: an error line\n',
        ]);
      });
    });
  });

  given('[case2] a verbose run', () => {
    when('[t0] debug and info are called', () => {
      then('both reach stderr, one line each', () => {
        const written: string[] = [];
        const log = getCliLogMethods(
          { isVerbose: true },
          { setStderr: (content) => written.push(content) },
        );
        log.debug('a debug line', { page: 1 });
        log.info('an info line');
        expect(written).toEqual([
          'debug: a debug line {"page":1}\n',
          'info: an info line\n',
        ]);
      });
    });
  });
});
