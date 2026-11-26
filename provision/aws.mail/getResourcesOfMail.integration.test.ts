import { given, then, useBeforeAll, when } from 'test-fns';

import {
  getPlanOfWishLive,
  isProvisionLiveTargeted,
} from '../getPlanOfWishLive';
import { getResources } from './account=prep/resources.mail';

/**
 * .what = the real call: plan the prep mail wish against the live nheuron-prep account
 * .why = `getResourcesOfMail.test.ts` proves the declared shapes in memory. this proves ses, s3,
 *   and iam accept them: the plan reads each declared resource back from aws. it targets prep —
 *   the mailbox tests run against — and runs only under `TEST_LIVE=ses`, which sources the
 *   nheuron prep slot; targeted with no session, it fails loud
 *
 * .note = an INTEGRATION test: the wish module calls `keyrack.source` at load, a remote boundary
 */
describe('getResourcesOfMail, live', () => {
  given.runIf(isProvisionLiveTargeted({ mechanism: 'ses' }))(
    '[case1] the prep account session is live (TEST_LIVE=ses)',
    () => {
      when('[t0] the wish is planned against the live account', () => {
        const result = useBeforeAll(async () => ({
          plan: getPlanOfWishLive({
            wish: 'provision/aws.mail/account=prep/resources.mail.ts',
          }),
          declared: await getResources(),
        }));

        then('the plan holds one change per declared resource', () => {
          expect(result.plan.changes).toHaveLength(result.declared.length);
        });

        then('the plan names the ses identity and the inbound bucket', () => {
          const classes = result.plan.changes.map(
            (change) => change.forResource.class,
          );
          expect(classes).toContain('DeclaredAwsSesEmailIdentity');
          expect(classes).toContain('DeclaredAwsS3Bucket');
        });
      });
    },
  );
});
