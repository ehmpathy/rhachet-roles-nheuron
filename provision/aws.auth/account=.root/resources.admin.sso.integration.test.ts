import { given, then, useBeforeAll, when } from 'test-fns';

import {
  getPlanOfWishLive,
  isProvisionLiveTargeted,
} from '../../getPlanOfWishLive';

/**
 * .what = the real call: plan the sso admin wish against the live identity center
 * .why = the wish reads the live sso instance and declares two permission sets plus five
 *   account assignments. only a plan against identity center proves each permission set,
 *   its inline policy bundle, and each assignment round-trip through aws
 *
 * .note = runs under `TEST_LIVE=aws.accounts`, the gate for every root-session wish: it
 *   needs `AWS_PROFILE=nheuron-root` (the management account), the same slot the account
 *   triplet plans under. targeted with no root session, the plan fails loud
 *
 * .note = the wish is imported DYNAMICALLY, inside the targeted case: its constants module
 *   throws at load when the account root emails are absent (fulcrum F15), so a static import
 *   would fail this suite in every untargeted run, ci included
 */
describe('resources.admin.sso', () => {
  given.runIf(isProvisionLiveTargeted({ mechanism: 'aws.accounts' }))(
    '[case1] the root account session is live (TEST_LIVE=aws.accounts)',
    () => {
      when('[t0] the wish is planned against the live identity center', () => {
        const result = useBeforeAll(async () => ({
          plan: getPlanOfWishLive({
            wish: 'provision/aws.auth/account=.root/resources.admin.sso.ts',
          }),
          declared: await (
            await import('./resources.admin.sso')
          ).getResources(),
        }));

        then('the plan holds one change per declared resource', () => {
          expect(result.plan.changes).toHaveLength(result.declared.length);
        });

        then(
          'the plan names both permission sets and all five assignments',
          () => {
            const classes = result.plan.changes.map(
              (change) => change.forResource.class,
            );
            expect(
              classes.filter((name) => name === 'DeclaredAwsSsoPermissionSet'),
            ).toHaveLength(2);
            expect(
              classes.filter(
                (name) => name === 'DeclaredAwsSsoAccountAssignment',
              ),
            ).toHaveLength(5);
          },
        );
      });
    },
  );
});
