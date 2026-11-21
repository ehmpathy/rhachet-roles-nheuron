import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getAuthAdapterForMechanism } from './getAuthAdapterForMechanism';

describe('getAuthAdapterForMechanism', () => {
  given('[case1] gmail mechanism', () => {
    when('[t0] adapter is selected', () => {
      then('returns gmail adapter', () => {
        const adapter = getAuthAdapterForMechanism({
          mechanism: 'gmail',
          cwd: null,
        });
        expect(adapter.mechanism).toBe('gmail');
      });

      then('adapter has getAuthStatus method', () => {
        const adapter = getAuthAdapterForMechanism({
          mechanism: 'gmail',
          cwd: null,
        });
        expect(typeof adapter.getAuthStatus).toBe('function');
      });

      then('adapter has genAuth method', () => {
        const adapter = getAuthAdapterForMechanism({
          mechanism: 'gmail',
          cwd: null,
        });
        expect(typeof adapter.genAuth).toBe('function');
      });

      then('adapter has genAuthRefresh method', () => {
        const adapter = getAuthAdapterForMechanism({
          mechanism: 'gmail',
          cwd: null,
        });
        expect(typeof adapter.genAuthRefresh).toBe('function');
      });
    });
  });

  given('[case2] unsupported mechanism', () => {
    when('[t0] adapter is selected', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(() =>
          getAuthAdapterForMechanism({
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
