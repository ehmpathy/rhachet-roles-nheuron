import { given, then, when } from 'test-fns';

import {
  getResourcesOfSpendLockdown,
  SPEND_CEILING_USD,
  SPEND_WARN_USD,
} from './getResourcesOfSpendLockdown';

/**
 * .what = clamps the declared shape of the org spend lockdown
 * .why = a wrong shape here is found only at a live apply against the root account, and a
 *   wrong breaker target or a freeze that denies billing locks a human out of the bill. the
 *   transformer is pure, so the shape is pinned here with no aws call
 */
describe('getResourcesOfSpendLockdown', () => {
  given('[case1] two admins and two member accounts', () => {
    const resources = getResourcesOfSpendLockdown({
      alertEmails: ['admin-a@example.com', 'admin-b@example.com'],
      memberEmails: {
        prod: 'prod-root@example.com',
        prep: 'prep-root@example.com',
      },
    });

    // each resource as a plain record, keyed by its class name
    const asRecord = (resource: object): Record<string, any> => ({
      ...resource,
    });
    const byClass = (name: string): Record<string, any>[] =>
      resources
        .filter((resource) => resource.constructor.name === name)
        .map(asRecord);

    when('[t0] the lockdown is declared', () => {
      then('scps are enabled first, then the freeze, in declared order', () => {
        // declastruct applies in declared order, with no topological sort
        expect(resources.map((resource) => resource.constructor.name)).toEqual([
          'DeclaredAwsOrganizationPolicyEligibility',
          'DeclaredAwsOrganizationServiceControlPolicy',
          'DeclaredAwsIamRole',
          'DeclaredAwsIamRolePolicyAttachedInline',
          'DeclaredAwsBudget',
          'DeclaredAwsBudget',
          'DeclaredAwsBudgetNotification',
          'DeclaredAwsBudgetNotification',
          'DeclaredAwsBudgetNotification',
          'DeclaredAwsBudgetAction',
          'DeclaredAwsBudgetAction',
        ]);
      });

      then('the freeze leaves billing, budgets, and sign-in open', () => {
        // ⚠️ the teeth: a freeze that denied these would lock a human out of the bill and
        // out of the lever that lifts the freeze
        const [freeze] = byClass('DeclaredAwsOrganizationServiceControlPolicy');
        const excluded = freeze!.content.statements[0].action.exclude;
        expect(excluded).toEqual(
          expect.arrayContaining([
            'billing:*',
            'budgets:*',
            'sts:*',
            'sso:*',
            'support:*',
          ]),
        );
        expect(freeze!.content.statements[0].effect).toEqual('Deny');
      });

      then('one breaker freezes prod and one freezes prep', () => {
        const targets = byClass('DeclaredAwsBudgetAction').map(
          (action) => action.definition.scp.target.email,
        );
        expect(targets).toEqual([
          'prod-root@example.com',
          'prep-root@example.com',
        ]);
      });

      then('each breaker fires at the ceiling, hands-off', () => {
        byClass('DeclaredAwsBudgetAction').forEach((action) => {
          expect(action.threshold.quant).toEqual(SPEND_CEILING_USD);
          expect(action.approvalModel).toEqual('AUTOMATIC');
          expect(action.kind).toEqual('APPLY_SCP_POLICY');
        });
      });

      then('alerts warn early, then at the forecast and actual ceiling', () => {
        const alerts = byClass('DeclaredAwsBudgetNotification').map(
          (alert) => ({ basis: alert.basis, quant: alert.threshold.quant }),
        );
        expect(alerts).toEqual([
          { basis: 'ACTUAL', quant: SPEND_WARN_USD },
          { basis: 'FORECASTED', quant: SPEND_CEILING_USD },
          { basis: 'ACTUAL', quant: SPEND_CEILING_USD },
        ]);
      });

      then('every alert and breaker reaches every admin', () => {
        [
          ...byClass('DeclaredAwsBudgetNotification'),
          ...byClass('DeclaredAwsBudgetAction'),
        ].forEach((notice) => {
          expect(
            notice.subscribers.map(
              (subscriber: { address: string }) => subscriber.address,
            ),
          ).toEqual(['admin-a@example.com', 'admin-b@example.com']);
        });
      });

      then('both budgets measure the whole org at the ceiling', () => {
        byClass('DeclaredAwsBudget').forEach((budget) => {
          expect(budget.costFilters).toBeNull();
          expect(budget.limit).toEqual({
            amount: String(SPEND_CEILING_USD),
            unit: 'USD',
          });
        });
      });
    });
  });
});
