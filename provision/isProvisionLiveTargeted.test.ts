import { then } from 'test-fns';

import { isProvisionLiveTargeted } from './getPlanOfWishLive';

/**
 * .what = clamps how the `TEST_LIVE` gate list is read
 * .why = `test.live` once exported `ses,cloudflare` as `ses cloudflare`, and a reader that split
 *   on commas alone saw ONE unknown gate. every provision live case behind it skipped without a
 *   word, so a two-gate run proved naught while it read green
 */
const TEST_CASES: {
  description: string;
  given: {
    testLive: string | undefined;
    mechanism: 'ses' | 'cloudflare' | 'aws.accounts';
  };
  expect: boolean;
}[] = [
  {
    description: 'one gate, named',
    given: { testLive: 'ses', mechanism: 'ses' },
    expect: true,
  },
  {
    description: 'a comma list names each gate',
    given: { testLive: 'ses,cloudflare', mechanism: 'cloudflare' },
    expect: true,
  },
  {
    description: 'a space list names each gate',
    given: { testLive: 'ses cloudflare', mechanism: 'ses' },
    expect: true,
  },
  {
    description: 'a gate absent from the list',
    given: { testLive: 'ses,cloudflare', mechanism: 'aws.accounts' },
    expect: false,
  },
  {
    description: 'no flag at all',
    given: { testLive: undefined, mechanism: 'ses' },
    expect: false,
  },
  {
    description: 'a prefix of a gate is not the gate',
    given: { testLive: 'aws.accounts', mechanism: 'ses' },
    expect: false,
  },
];

describe('isProvisionLiveTargeted', () => {
  TEST_CASES.forEach((thisCase) =>
    then(thisCase.description, () => {
      // set the flag for this case alone, then put back what was there
      const before = process.env.TEST_LIVE;
      if (thisCase.given.testLive === undefined) delete process.env.TEST_LIVE;
      if (thisCase.given.testLive !== undefined)
        process.env.TEST_LIVE = thisCase.given.testLive;
      try {
        expect(
          isProvisionLiveTargeted({ mechanism: thisCase.given.mechanism }),
        ).toEqual(thisCase.expect);
      } finally {
        if (before === undefined) delete process.env.TEST_LIVE;
        if (before !== undefined) process.env.TEST_LIVE = before;
      }
    }),
  );
});
