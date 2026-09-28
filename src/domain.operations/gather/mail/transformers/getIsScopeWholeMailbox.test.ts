import { given, then, when } from 'test-fns';

import { getIsScopeWholeMailbox } from './getIsScopeWholeMailbox';

describe('getIsScopeWholeMailbox', () => {
  given('[case1] no query and no labels', () => {
    when('[t0] the scope is assessed', () => {
      then('it is the whole mailbox', () => {
        expect(
          getIsScopeWholeMailbox({ filter: { query: null, labels: [] } }),
        ).toBe(true);
      });
    });
  });

  given('[case2] a query', () => {
    when('[t0] the scope is assessed', () => {
      then('it is NOT the whole mailbox', () => {
        expect(
          getIsScopeWholeMailbox({
            filter: { query: 'from:boss@co.com', labels: [] },
          }),
        ).toBe(false);
      });
    });
  });

  given('[case3] labels', () => {
    when('[t0] the scope is assessed', () => {
      then('it is NOT the whole mailbox', () => {
        expect(
          getIsScopeWholeMailbox({ filter: { query: null, labels: ['work'] } }),
        ).toBe(false);
      });
    });
  });

  given('[case4] both a query and labels', () => {
    when('[t0] the scope is assessed', () => {
      then('it is NOT the whole mailbox', () => {
        expect(
          getIsScopeWholeMailbox({
            filter: { query: 'is:unread', labels: ['work', 'urgent'] },
          }),
        ).toBe(false);
      });
    });
  });

  given('[case5] an empty-string query', () => {
    // .why = the cli parses an absent flag to null, never to ''. so an empty string is a
    //   query the human typed — treat it as a narrowed scope rather than guess at intent,
    //   since the safe read of an ambiguous scope is the narrow one
    when('[t0] the scope is assessed', () => {
      then('it is NOT the whole mailbox', () => {
        expect(
          getIsScopeWholeMailbox({ filter: { query: '', labels: [] } }),
        ).toBe(false);
      });
    });
  });
});
