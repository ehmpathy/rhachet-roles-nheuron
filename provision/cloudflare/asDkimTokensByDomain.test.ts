import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { asDkimTokensByDomain } from './asDkimTokensByDomain';

/**
 * .what = clamps the parse of the per-domain dkim token map
 * .why = a wrong parse yields wrong or absent cnames with no error, and an identity whose
 *   cnames are absent stays unverified — mail neither sends nor lands
 */
describe('asDkimTokensByDomain', () => {
  given('[case1] a map of two domains', () => {
    when('[t0] it is parsed', () => {
      then('each domain maps to its own tokens', () => {
        expect(
          asDkimTokensByDomain({
            raw: 'one.prep.nheuron.com=a1,a2,a3;one.nheuron.com=b1,b2,b3',
          }),
        ).toEqual({
          'one.prep.nheuron.com': ['a1', 'a2', 'a3'],
          'one.nheuron.com': ['b1', 'b2', 'b3'],
        });
      });
    });
  });

  given('[case2] a map with stray whitespace and a final separator', () => {
    when('[t0] it is parsed', () => {
      then('the whitespace and the empty segment are dropped', () => {
        expect(
          asDkimTokensByDomain({ raw: ' one.nheuron.com = b1 , b2 ,b3 ; ' }),
        ).toEqual({ 'one.nheuron.com': ['b1', 'b2', 'b3'] });
      });
    });
  });

  given('[case3] an empty or absent value', () => {
    when('[t0] it is parsed', () => {
      then('it yields no domains', () => {
        expect(asDkimTokensByDomain({ raw: '' })).toEqual({});
        expect(asDkimTokensByDomain({ raw: null })).toEqual({});
      });
    });
  });

  given('[case4] a segment with no domain', () => {
    when('[t0] it is parsed', () => {
      then('it refuses loud rather than drop the segment', async () => {
        // the bare comma list is the legacy one-domain shape; a silent read would lose it
        const error = await getError(async () =>
          asDkimTokensByDomain({ raw: 'tok1,tok2,tok3' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('a segment with no domain');
      });
    });
  });
});
