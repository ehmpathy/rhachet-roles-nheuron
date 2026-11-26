import {
  DeclaredAwsBudget,
  DeclaredAwsBudgetAction,
  DeclaredAwsBudgetNotification,
  DeclaredAwsIamPolicyDocument,
  DeclaredAwsIamRole,
  DeclaredAwsIamRolePolicyAttachedInline,
  type DeclaredAwsOrganizationAccount,
  DeclaredAwsOrganizationPolicyEligibility,
  DeclaredAwsOrganizationServiceControlPolicy,
} from 'declastruct-aws';
import { type DomainEntity, RefByUnique } from 'domain-objects';

/**
 * .what = the org's hard monthly spend ceiling, in usd
 * .why = the nheuron org must never spend more than this in a month. the breaker freezes every
 *   member account at this mark; the alerts below fire on the way up to it
 */
export const SPEND_CEILING_USD = 100;

/**
 * .what = the early-warn mark, in usd — an email, no freeze
 */
export const SPEND_WARN_USD = 50;

/**
 * .what = the actions the freeze leaves open, so a human can still sign in, see the bill, and
 *   lift the freeze
 */
export const SPEND_FREEZE_EXCLUDES = [
  'aws-portal:*',
  'billing:*',
  'budgets:*',
  'ce:*',
  'sts:*',
  'sso:*',
  'iam:Get*',
  'iam:List*',
  'organizations:Describe*',
  'organizations:List*',
  'support:*',
];

/**
 * .what = the org spend lockdown: one monthly budget with tiered alerts, plus a circuit breaker
 *   that freezes every member account when org spend reaches the ceiling
 * .why = the nheuron org must never spend past SPEND_CEILING_USD/mo. alerts warn at
 *   SPEND_WARN_USD and when the forecast crosses the ceiling; the breaker attaches a deny-all
 *   SCP to prod and prep the moment actual spend reaches it
 *
 * .note = pure: every address arrives as input, so the shape is testable with no keyrack, no
 *   env, and no aws call. the wish (`resources.ts`) reads the inputs live and passes them in
 *
 * .note = budgets set in the management account with no cost filter cover the whole org
 *   (consolidated billing), so every budget below measures org-wide spend
 *
 * .note = one breaker budget per member account, because aws binds a budget action's SCP to
 *   ONE target and declastruct allows one action of each kind per budget. each budget carries
 *   the same org-wide ceiling, so both accounts freeze at the same mark
 *
 * .note = the limits aws imposes, which no declaration can lift:
 *   - aws evaluates budgets a few times a day and bill data lags hours, so spend can pass the
 *     ceiling before the freeze lands. the ceiling is a breaker, not a guarantee to the cent
 *   - an SCP never binds the management account. nheuron-root runs no workloads (org, sso,
 *     budgets — all free), so the alerts are its guard
 *   - the freeze blocks new api calls; it does not delete resources that already accrue
 *     (s3 storage, ses receipt — cents)
 *   - aws lifts an SCP action at the next budget period, so the freeze ends with the month
 */
export const getResourcesOfSpendLockdown = (input: {
  alertEmails: string[];
  memberEmails: { prod: string; prep: string };
}): DomainEntity<any>[] => {
  // scps must be enabled on the org before any can attach
  const scpEligibility = DeclaredAwsOrganizationPolicyEligibility.as({
    type: 'SERVICE_CONTROL_POLICY',
    choice: 'ENABLED',
  });

  // the freeze: deny every action except the recovery set
  const scpSpendFreeze = DeclaredAwsOrganizationServiceControlPolicy.as({
    name: 'nheuron-scp-spend-freeze',
    description:
      'circuit breaker: deny all new activity once org spend hits the ceiling',
    content: new DeclaredAwsIamPolicyDocument({
      statements: [
        {
          sid: 'DenyAllButRecovery',
          effect: 'Deny',
          action: { exclude: SPEND_FREEZE_EXCLUDES },
          resource: '*',
        },
      ],
    }),
    tags: { managedBy: 'declastruct', purpose: 'spend-breaker' },
  });

  // the role aws budgets assumes to attach + later detach the freeze
  const breakerRole = DeclaredAwsIamRole.as({
    name: 'nheuron-budgets-breaker-role',
    path: '/',
    description:
      'role aws budgets assumes to attach + detach the spend-freeze scp',
    policies: [
      {
        effect: 'Allow',
        principal: { service: 'budgets.amazonaws.com' },
        action: 'sts:AssumeRole',
      },
    ],
    tags: { managedBy: 'declastruct', purpose: 'spend-breaker' },
  });
  const breakerRoleRef = RefByUnique.as<typeof DeclaredAwsIamRole>(breakerRole);
  const breakerRoleGrant = DeclaredAwsIamRolePolicyAttachedInline.as({
    name: 'attach-spend-freeze',
    role: breakerRoleRef,
    document: new DeclaredAwsIamPolicyDocument({
      statements: [
        {
          sid: 'AttachDetachScp',
          effect: 'Allow',
          action: [
            'organizations:AttachPolicy',
            'organizations:DetachPolicy',
            'organizations:DescribePolicy',
            'organizations:ListPolicies',
            'organizations:ListTargetsForPolicy',
            'organizations:DescribeOrganization',
          ],
          resource: '*',
        },
      ],
    }),
  });

  // a shared shape for every subscriber list
  const subscribers = input.alertEmails.map((address) => ({
    via: 'EMAIL' as const,
    address,
  }));

  // the primary budget: org-wide, monthly, at the ceiling. alerts hang here
  const budgetTotal = DeclaredAwsBudget.as({
    name: 'nheuron-monthly-total',
    kind: 'COST',
    limit: { amount: String(SPEND_CEILING_USD), unit: 'USD' },
    timeUnit: 'MONTHLY',
    costFilters: null, // null = the whole org, from the management account
    tags: { managedBy: 'declastruct', purpose: 'spend-ceiling' },
  });
  const budgetTotalRef = RefByUnique.as<typeof DeclaredAwsBudget>(budgetTotal);

  // alerts: early warn on actual, then forecast + actual at the ceiling
  const alertWarn = DeclaredAwsBudgetNotification.as({
    budget: budgetTotalRef,
    basis: 'ACTUAL',
    comparison: 'GREATER_THAN',
    threshold: { quant: SPEND_WARN_USD, unit: 'ABSOLUTE_VALUE' },
    subscribers,
  });
  const alertForecastCeiling = DeclaredAwsBudgetNotification.as({
    budget: budgetTotalRef,
    basis: 'FORECASTED',
    comparison: 'GREATER_THAN',
    threshold: { quant: SPEND_CEILING_USD, unit: 'ABSOLUTE_VALUE' },
    subscribers,
  });
  const alertActualCeiling = DeclaredAwsBudgetNotification.as({
    budget: budgetTotalRef,
    basis: 'ACTUAL',
    comparison: 'GREATER_THAN',
    threshold: { quant: SPEND_CEILING_USD, unit: 'ABSOLUTE_VALUE' },
    subscribers,
  });

  // the twin budget: same org-wide ceiling, exists only to carry prep's breaker
  const budgetFreezePrep = DeclaredAwsBudget.as({
    name: 'nheuron-monthly-total-freeze-prep',
    kind: 'COST',
    limit: { amount: String(SPEND_CEILING_USD), unit: 'USD' },
    timeUnit: 'MONTHLY',
    costFilters: null,
    tags: { managedBy: 'declastruct', purpose: 'spend-breaker' },
  });

  // one breaker per member account: at the ceiling, attach the freeze, hands-off
  const asBreaker = (breaker: {
    budget: DeclaredAwsBudget;
    accountEmail: string;
  }): DeclaredAwsBudgetAction =>
    DeclaredAwsBudgetAction.as({
      budget: RefByUnique.as<typeof DeclaredAwsBudget>(breaker.budget),
      kind: 'APPLY_SCP_POLICY',
      basis: 'ACTUAL',
      threshold: { quant: SPEND_CEILING_USD, unit: 'ABSOLUTE_VALUE' },
      approvalModel: 'AUTOMATIC',
      executionRole: breakerRoleRef,
      definition: {
        scp: {
          policy:
            RefByUnique.as<typeof DeclaredAwsOrganizationServiceControlPolicy>(
              scpSpendFreeze,
            ),
          target: RefByUnique.as<typeof DeclaredAwsOrganizationAccount>({
            email: breaker.accountEmail,
          }),
        },
        ssm: null,
        iam: null,
      },
      subscribers,
    });
  const breakerProd = asBreaker({
    budget: budgetTotal,
    accountEmail: input.memberEmails.prod,
  });
  const breakerPrep = asBreaker({
    budget: budgetFreezePrep,
    accountEmail: input.memberEmails.prep,
  });

  // apply order = declared order (declastruct does no topological sort)
  return [
    scpEligibility, // scps enabled before any scp exists
    scpSpendFreeze,
    breakerRole, // role before its grant and before the breakers ref it
    breakerRoleGrant,
    budgetTotal, // budgets before the alerts + breakers ref them
    budgetFreezePrep,
    alertWarn,
    alertForecastCeiling,
    alertActualCeiling,
    breakerProd,
    breakerPrep,
  ];
};
