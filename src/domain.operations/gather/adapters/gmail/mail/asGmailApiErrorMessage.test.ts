import { given, then, when } from 'test-fns';

import { asGmailApiErrorMessage } from './asGmailApiErrorMessage';

const TEST_CASES = [
  {
    description: '[case1] the gmail error envelope',
    body: JSON.stringify({
      error: {
        code: 401,
        message: 'Request had invalid authentication credentials.',
        status: 'UNAUTHENTICATED',
      },
    }),
    expected: 'Request had invalid authentication credentials.',
  },
  {
    description: '[case2] a body that is not json',
    body: '<html>bad gateway</html>',
    expected: '<html>bad gateway</html>',
  },
  {
    description: '[case3] json that is not the envelope',
    body: '{"detail":"odd"}',
    expected: '{"detail":"odd"}',
  },
];

describe('asGmailApiErrorMessage', () => {
  TEST_CASES.map((testCase) =>
    given(testCase.description, () => {
      when('[t0] the message is read', () => {
        then(
          'it returns the human-useful text, never less than the body',
          () => {
            expect(asGmailApiErrorMessage({ body: testCase.body })).toEqual(
              testCase.expected,
            );
          },
        );
      });
    }),
  );
});
