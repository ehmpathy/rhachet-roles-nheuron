import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getAuthAdapterForMechanism } from './getAuthAdapterForMechanism';

describe('getAuthAdapterForMechanism', () => {
  given('[case1] ses mechanism', () => {
    when('[t0] adapter is selected', () => {
      const adapter = getAuthAdapterForMechanism({ mechanism: 'ses' });

      then('returns ses adapter', () => {
        expect(adapter.mechanism).toBe('ses');
      });

      then('adapter has getAuthStatus method', () => {
        expect(typeof adapter.getAuthStatus).toBe('function');
      });

      then('adapter has genAuth method', () => {
        expect(typeof adapter.genAuth).toBe('function');
      });

      then('adapter has genAuthRefresh method', () => {
        expect(typeof adapter.genAuthRefresh).toBe('function');
      });
    });
  });

  given('[case2] unsupported mechanism', () => {
    when('[t0] adapter is selected', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(() =>
          getAuthAdapterForMechanism({
            mechanism: 'slack' as 'ses',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('mechanism not supported');
      });
    });
  });
});
