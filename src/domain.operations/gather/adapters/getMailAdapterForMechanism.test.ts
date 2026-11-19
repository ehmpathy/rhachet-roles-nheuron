import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getMailAdapterForMechanism } from './getMailAdapterForMechanism';

describe('getMailAdapterForMechanism', () => {
  given('[case1] ses mechanism', () => {
    when('[t0] adapter is selected', () => {
      const adapter = getMailAdapterForMechanism({ mechanism: 'ses' });

      then('returns ses adapter', () => {
        expect(adapter.mechanism).toBe('ses');
      });

      then('adapter has getAllMail method', () => {
        expect(typeof adapter.getAllMail).toBe('function');
      });
    });
  });

  given('[case2] unsupported mechanism', () => {
    when('[t0] adapter is selected', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(() =>
          getMailAdapterForMechanism({
            mechanism: 'slack' as 'ses',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('mechanism not supported');
      });
    });
  });
});
