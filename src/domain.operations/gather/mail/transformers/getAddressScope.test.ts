import { getError, given, then, when } from 'test-fns';

import { getAddressScope } from './getAddressScope';

const TEST_CASES = [
  {
    description: 'parses plain email address',
    given: {
      address: 'vlad@gmail.com',
    },
    expect: {
      address: { given: 'vlad@gmail.com', formed: 'vlad@gmail.com' },
      scope: null,
    },
  },
  {
    description: 'parses email with single label scope',
    given: {
      address: 'vlad@gmail.com/labels=work',
    },
    expect: {
      address: {
        given: 'vlad@gmail.com/labels=work',
        formed: 'vlad@gmail.com',
      },
      scope: { labels: ['work'] },
    },
  },
  {
    description: 'parses email with multiple labels',
    given: {
      address: 'vlad@gmail.com/labels=work,urgent',
    },
    expect: {
      address: {
        given: 'vlad@gmail.com/labels=work,urgent',
        formed: 'vlad@gmail.com',
      },
      scope: { labels: ['work', 'urgent'] },
    },
  },
  {
    description: 'parses slack-style address with channels',
    given: {
      address: 'ehmpathy/channels=general',
    },
    expect: {
      address: {
        given: 'ehmpathy/channels=general',
        formed: 'ehmpathy',
      },
      scope: { channels: ['general'] },
    },
  },
  {
    description: 'parses address with multiple scope params',
    given: {
      address: 'vlad@gmail.com/labels=work&after=2024-01-01',
    },
    expect: {
      address: {
        given: 'vlad@gmail.com/labels=work&after=2024-01-01',
        formed: 'vlad@gmail.com',
      },
      scope: { labels: ['work'], after: ['2024-01-01'] },
    },
  },
];

describe('getAddressScope', () => {
  TEST_CASES.map((thisCase, index) =>
    given(`[case${index + 1}] ${thisCase.description}`, () => {
      when('[t0] the address scope is read', () => {
        then('the address and the scope match', () => {
          const result = getAddressScope(thisCase.given);
          expect(result.address).toEqual(thisCase.expect.address);
          expect(result.scope).toEqual(thisCase.expect.scope);
        });
      });
    }),
  );

  given(
    `[case${TEST_CASES.length + 1}] a scope segment that is not a key=value pair`,
    () => {
      when('[t0] the address scope is read', () => {
        then('it refuses the segment', async () => {
          // ⚠️ the teeth. revert the guard to `if (eqIndex === -1) return acc` and no error is
          // thrown — `inbox` is dropped and the whole mailbox comes back as if unfiltered
          const error = await getError(async () =>
            getAddressScope({ address: 'vlad@gmail.com/inbox' }),
          );
          expect(error.message).toContain(
            "segment 'inbox' is not a key=value pair",
          );
        });
      });
    },
  );

  given(
    `[case${TEST_CASES.length + 2}] a stray separator at the end of the scope`,
    () => {
      when('[t0] the address scope is read', () => {
        then('it tolerates the empty segment', () => {
          // an empty segment names no scope, so it is skipped rather than refused
          const result = getAddressScope({
            address: 'vlad@gmail.com/labels=work&',
          });
          expect(result.scope).toEqual({ labels: ['work'] });
        });
      });
    },
  );
});
