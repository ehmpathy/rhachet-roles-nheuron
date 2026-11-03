import { given, then, useBeforeAll, when } from 'test-fns';

import {
  getPlanOfWishLive,
  isProvisionLiveTargeted,
} from '../../getPlanOfWishLive';

/**
 * .what = the real call: plan the account triplet against the live aws organization
 * .why = the wish reads the management account id from the live session and declares the
 *   organization plus two member accounts. only a plan against organizations proves the
 *   session can read the org and each declared account shape round-trips.
 *
 * .note = runs only under `TEST_LIVE=aws.accounts` with `AWS_PROFILE=nheuron-root` (the
 *   management account). targeted with no root session, the plan fails loud. an INTEGRATION
 *   test: the wish module calls `keyrack.source` at load, which reads the filesystem.
 *
 * .note = the wish is imported DYNAMICALLY, inside the targeted case. its constants module
 *   throws at load when the account root emails are absent (fulcrum F15) — a static import
 *   would fail this whole suite in every untargeted run, ci included.
 */
describe('resources.accounts', () => {
  given.runIf(isProvisionLiveTargeted({ mechanism: 'aws.accounts' }))(
    '[case1] the root account session is live (TEST_LIVE=aws.accounts)',
    () => {
      when('[t0] the wish is planned against the live organization', () => {
        const result = useBeforeAll(async () => ({
          plan: getPlanOfWishLive({
            wish: 'provision/aws.auth/account=.root/resources.accounts.ts',
          }),
          declared: await (await import('./resources.accounts')).getResources(),
        }));

        then('the plan holds one change per declared resource', () => {
          expect(result.plan.changes).toHaveLength(result.declared.length);
        });

        then('the plan names the organization and both member accounts', () => {
          const classes = result.plan.changes.map(
            (change) => change.forResource.class,
          );
          expect(classes).toContain('DeclaredAwsOrganization');
          expect(
            classes.filter((name) => name === 'DeclaredAwsOrganizationAccount'),
          ).toHaveLength(2);
        });
      });
    },
  );
});
