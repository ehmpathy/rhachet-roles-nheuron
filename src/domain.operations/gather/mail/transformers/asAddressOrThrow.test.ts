import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { asAddressOrThrow } from './asAddressOrThrow';

/**
 * .what = clamps the address shape check at the cli boundary
 * .why = the address names a cache dir; a `/` in it would reach a filesystem path
 */
describe('asAddressOrThrow', () => {
  given('[case1] a plain mailbox address', () => {
    when('[t0] cast', () => {
      then('it returns the address unchanged', () => {
        expect(asAddressOrThrow({ address: 'jelly@one.nheuron.com' })).toEqual(
          'jelly@one.nheuron.com',
        );
      });
    });
  });

  const CASES_REFUSED = [
    { description: 'a path suffix', address: 'jelly@one.nheuron.com/labels=a' },
    { description: 'a traversal', address: 'jelly@../../etc' },
    { description: 'no @', address: 'jelly' },
    { description: 'two @', address: 'jelly@one@nheuron.com' },
    { description: 'whitespace', address: 'jelly @one.nheuron.com' },
    { description: 'blank', address: '' },
  ];

  given('[case2] an address that is not one plain mailbox', () => {
    CASES_REFUSED.map((thisCase) =>
      when(`[t0] cast with ${thisCase.description}`, () => {
        then('it refuses with a hint', async () => {
          const error = await getError(async () =>
            asAddressOrThrow({ address: thisCase.address }),
          );
          expect(error).toBeInstanceOf(BadRequestError);
          expect(error.message).toContain('is not a mailbox address');
          expect(error.message).toContain('--address jelly@one.nheuron.com');
        });
      }),
    );
  });
});
