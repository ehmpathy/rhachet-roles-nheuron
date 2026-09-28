import { given, then, when } from 'test-fns';

import { getScopeDisplay } from './getScopeDisplay';

describe('getScopeDisplay', () => {
  given('[case1] no query and no labels', () => {
    when('[t0] the scope is said', () => {
      then('it names the whole mailbox, rather than say naught', () => {
        // an absent line reads as an omission; a stated one reads as a fact
        expect(getScopeDisplay({ filter: { query: null, labels: [] } })).toBe(
          'whole mailbox',
        );
      });
    });
  });

  given('[case2] labels alone', () => {
    when('[t0] the scope is said', () => {
      then('every label appears', () => {
        expect(
          getScopeDisplay({
            filter: { query: null, labels: ['work', 'urgent'] },
          }),
        ).toBe('labels=work,urgent');
      });
    });
  });

  given('[case3] a query alone', () => {
    when('[t0] the scope is said', () => {
      then('it is quoted, so its spaces read as one value', () => {
        expect(
          getScopeDisplay({
            filter: { query: 'from:boss@co.com is:unread', labels: [] },
          }),
        ).toBe('query="from:boss@co.com is:unread"');
      });
    });
  });

  given('[case4] both', () => {
    when('[t0] the scope is said', () => {
      then('both appear, and neither is dropped', () => {
        // ⚠️ the teeth against a half-report. a scope line that named only one of the two
        // would be the same lie the filter drop was, moved to the output
        expect(
          getScopeDisplay({
            filter: { query: 'is:unread', labels: ['work'] },
          }),
        ).toBe('labels=work query="is:unread"');
      });
    });
  });

  given('[case5] an empty-string query', () => {
    when('[t0] the scope is said', () => {
      then('it reads as a query, never as the whole mailbox', () => {
        // matches `getIsScopeWholeMailbox`, which also treats '' as a narrowed scope —
        // the two must agree, or the output would claim a scope the cache gate denied
        expect(getScopeDisplay({ filter: { query: '', labels: [] } })).toBe(
          'query=""',
        );
      });
    });
  });
});
