import { given, then, when } from 'test-fns';

import { asDkimTokens } from './asDkimTokens';

/**
 * .what = clamps the parse of the dns wish's one dynamic input
 * .why = the 3 dkim tokens are the sole apply-sourced value in the whole dns set; a wrong parse
 *   declares wrong CNAME records with no error. the parse was once a private closure with zero
 *   coverage — every peer compute in the diff (`asSesMailDnsRecords`, `asCloudflareDnsRecords`)
 *   is a named transformer with its own clamp, and this one was not
 *   (`rule.prefer.decomposable-architecture`).
 */
describe('asDkimTokens', () => {
  given('[case1] the 3 tokens google actually emits, comma-separated', () => {
    when('[t0] parsed', () => {
      then('all three come back intact and in order', () => {
        expect(asDkimTokens({ raw: 'tok1,tok2,tok3' })).toEqual([
          'tok1',
          'tok2',
          'tok3',
        ]);
      });
    });
  });

  given('[case2] the value filled with spaces around each token', () => {
    when('[t0] parsed', () => {
      then(
        'each token is trimmed — a stray space never reaches a record',
        () => {
          // ⚠️ the teeth: a space beside a CNAME name silently declares the wrong record
          expect(asDkimTokens({ raw: ' tok1 , tok2 ,tok3 ' })).toEqual([
            'tok1',
            'tok2',
            'tok3',
          ]);
        },
      );
    });
  });

  given('[case3] a comma at the end leaves an empty segment', () => {
    when('[t0] parsed', () => {
      then('the empty segment is dropped, never a blank token', () => {
        // a blank token would produce a CNAME whose name is just the domain — a real defect
        expect(asDkimTokens({ raw: 'tok1,tok2,' })).toEqual(['tok1', 'tok2']);
      });
    });
  });

  given('[case4] an empty or absent raw value', () => {
    when('[t0] parsed', () => {
      then('an empty string yields no tokens', () => {
        // the caller reads [] as "the aws wish has not applied yet" and refuses loud
        expect(asDkimTokens({ raw: '' })).toEqual([]);
      });

      then('a null raw yields no tokens', () => {
        expect(asDkimTokens({ raw: null })).toEqual([]);
      });
    });
  });
});
