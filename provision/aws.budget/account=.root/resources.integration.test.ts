import { given, then, useBeforeAll, when } from 'test-fns';

import {
  getPlanOfWishLive,
  isProvisionLiveTargeted,
} from '../../getPlanOfWishLive';

/**
 * .what = the real call: plan the spend lockdown against live budgets, organizations, and iam
 * .why = the wish reads the org admins live from identity center (`getAllAdminEmails`), then
 *   declares a deny-all scp, its breaker role, two budgets, three alerts, and two breakers.
 *   only a plan against aws proves each shape round-trips, and the breaker is the one resource
 *   here whose wrong shape latches a freeze on a member account
 *
 * .note = runs under `TEST_LIVE=aws.accounts`, the gate for every root-session wish: budgets
 *   and scps live in the management account (`AWS_PROFILE=nheuron-root`). targeted with no
 *   root session, the plan fails loud
 *
 * .note = the wish is imported DYNAMICALLY, inside the targeted case: its constants module
 *   throws at load when the account root emails are absent (fulcrum F15), so a static import
 *   would fail this suite in every untargeted run, ci included. the declared shape itself is
 *   clamped with no aws call in `getResourcesOfSpendLockdown.test.ts`
 */
describe('resources (aws.budget)', () => {
  given.runIf(isProvisionLiveTargeted({ mechanism: 'aws.accounts' }))(
    '[case1] the root account session is live (TEST_LIVE=aws.accounts)',
    () => {
      when('[t0] the wish is planned against the live org', () => {
        const result = useBeforeAll(async () => ({
          plan: getPlanOfWishLive({
            wish: 'provision/aws.budget/account=.root/resources.ts',
          }),
          declared: await (await import('./resources')).getResources(),
        }));

        then('the plan holds one change per declared resource', () => {
          expect(result.plan.changes).toHaveLength(result.declared.length);
        });

        then(
          'the plan names the freeze scp, both budgets, and both breakers',
          () => {
            const classes = result.plan.changes.map(
              (change) => change.forResource.class,
            );
            expect(classes).toContain(
              'DeclaredAwsOrganizationServiceControlPolicy',
            );
            expect(
              classes.filter((name) => name === 'DeclaredAwsBudget'),
            ).toHaveLength(2);
            expect(
              classes.filter((name) => name === 'DeclaredAwsBudgetAction'),
            ).toHaveLength(2);
          },
        );
      });
    },
  );
});
