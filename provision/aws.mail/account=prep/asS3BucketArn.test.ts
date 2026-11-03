import { given, then, when } from 'test-fns';

import { asIamRootPrincipalArn } from './asIamRootPrincipalArn';
import { asS3BucketArn } from './asS3BucketArn';
import { asS3ObjectArn } from './asS3ObjectArn';

/**
 * .what = clamps the three arn shapes the mail wish grants on
 * .why = each expected value is the literal aws documents, so a wrong segment count or a
 *   stray region in a transformer goes red here rather than at an iam apply
 */
const TEST_CASES = [
  {
    description: 'a bucket arn carries no region and no account',
    given: () => asS3BucketArn({ bucket: 'nheuron-mail-inbound-one' }),
    expect: 'arn:aws:s3:::nheuron-mail-inbound-one',
  },
  {
    description: 'an object arn widens the prefix with a final *',
    given: () =>
      asS3ObjectArn({ bucket: 'nheuron-mail-inbound-one', prefix: 'inbound/' }),
    expect: 'arn:aws:s3:::nheuron-mail-inbound-one/inbound/*',
  },
  {
    description: 'a root principal names the account, never a region',
    given: () => asIamRootPrincipalArn({ account: '123456789012' }),
    expect: 'arn:aws:iam::123456789012:root',
  },
];

describe('the mail wish arn transformers', () => {
  TEST_CASES.map((thisCase, index) =>
    given(`[case${index + 1}] ${thisCase.description}`, () => {
      when('[t0] the arn is formed', () => {
        then('it equals the literal aws documents', () => {
          expect(thisCase.given()).toEqual(thisCase.expect);
        });
      });
    }),
  );
});
