import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getMailAdapterForMechanism } from './getMailAdapterForMechanism';

describe('getMailAdapterForMechanism', () => {
  given('[case1] gmail mechanism', () => {
    when('[t0] adapter is selected', () => {
      then('returns gmail adapter', () => {
        const adapter = getMailAdapterForMechanism({
          mechanism: 'gmail',
          cwd: null,
        });
        expect(adapter.mechanism).toBe('gmail');
      });

      then('adapter has getAllMail method', () => {
        const adapter = getMailAdapterForMechanism({
          mechanism: 'gmail',
          cwd: null,
        });
        expect(typeof adapter.getAllMail).toBe('function');
      });
    });
  });

  given('[case2] unsupported mechanism', () => {
    when('[t0] adapter is selected', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(() =>
          getMailAdapterForMechanism({
            mechanism: 'slack' as 'gmail',
            cwd: null,
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('mechanism not supported');
      });
    });
  });
});
