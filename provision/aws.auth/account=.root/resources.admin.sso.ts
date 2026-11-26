import type { DeclastructProvider } from 'declastruct';
import {
  DeclaredAwsIamPolicyBundle,
  DeclaredAwsIamPolicyDocument,
  DeclaredAwsIamPolicyStatement,
  type DeclaredAwsOrganizationAccount,
  DeclaredAwsSsoAccountAssignment,
  type DeclaredAwsSsoInstance,
  DeclaredAwsSsoPermissionSet,
  DeclaredAwsSsoUser,
  getDeclastructAwsProvider,
  getOneSsoInstance,
} from 'declastruct-aws';
import {
  type DomainEntity,
  RefByPrimary,
  RefByUnique,
  refByUnique,
} from 'domain-objects';
import { UnexpectedCodePathError } from 'helpful-errors';
import { keyrack } from 'rhachet/keyrack';
import { genLogMethods } from 'sdk-logs';

import {
  NHEURON_PREP_ACCOUNT_EMAIL,
  NHEURON_PROD_ACCOUNT_EMAIL,
} from '../resources.common.accounts';

// source aws credentials from keyrack env sudo — this wish applies AS THE ROOT account
keyrack.source({ env: 'sudo', owner: 'ehmpath', mode: 'lenient' });

const log = genLogMethods();

/**
 * .what = the human admin's username in identity center
 * .why = the user is part of the hand-made sso floor (howto.bootstrap-aws-sso): it holds a
 *   personal email, so it is never declared here. assignments address it by its natural key
 *   (instance + userName), which keeps the email out of git and out of this wish entirely
 */
const ADMIN_USERNAME = 'vlad';

/**
 * .what = the everyday-power policy: PowerUserAccess, plus the iam a member-account wish needs
 * .why = PowerUserAccess grants no iam at all, so a wish that declares a role (the mail wish's
 *   `nheuron-mail-clone`) cannot even plan under it. same shape as ahbode/infrastructure
 *   `roleEverydayPowerPolicyBundle`: role reads open, role writes allowlisted by name
 * .note = scope is tighter than ahbode's `svc-*`:
 *   - writes reach only `role/nheuron-mail-*`; a new role family is a conscious one-line add
 *   - no AttachRolePolicy: the mail role carries an inline grant only, so this tier can never
 *     attach a managed policy such as AdministratorAccess to a role
 *   - residual: PutRolePolicy still writes any inline document onto an allowlisted role. a
 *     permissions boundary would close that; the allowlist bounds it to the mail roles today
 */
const roleEverydayPowerPolicyBundle = DeclaredAwsIamPolicyBundle.as({
  managed: ['arn:aws:iam::aws:policy/PowerUserAccess'],
  inline: new DeclaredAwsIamPolicyDocument({
    statements: [
      // account alias read, for environment detection
      new DeclaredAwsIamPolicyStatement({
        sid: 'IamAccountAliasRead',
        effect: 'Allow',
        action: 'iam:ListAccountAliases',
        resource: '*',
      }),
      // role reads, so a declastruct plan can decide KEEP vs UPDATE for any role
      new DeclaredAwsIamPolicyStatement({
        sid: 'IamRoleRead',
        effect: 'Allow',
        action: [
          'iam:GetRole',
          'iam:GetRolePolicy',
          'iam:ListRolePolicies',
          'iam:ListAttachedRolePolicies',
          'iam:ListInstanceProfilesForRole',
          'iam:ListRoleTags',
        ],
        resource: 'arn:aws:iam::*:role/*',
      }),
      // role writes, allowlisted to the mail roles the mail wish declares
      new DeclaredAwsIamPolicyStatement({
        sid: 'MailRoleManagement',
        effect: 'Allow',
        action: [
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:UpdateRole',
          'iam:UpdateAssumeRolePolicy',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:TagRole',
          'iam:UntagRole',
        ],
        resource: 'arn:aws:iam::*:role/nheuron-mail-*',
      }),
    ],
  }),
});

/**
 * .what = sso permission sets + account assignments for the human admin
 * .why = admins sign in via `aws sso login` (keyrack), never root credentials. the hand-made
 *   floor (one user, `emergency-admin`, one assignment to root) exists only so this wish can
 *   run; from here the wish owns all sso state. same shape as ahbode/infrastructure
 *   `resources.admin.sso.ts`
 *
 * .note = two tiers, by blast radius:
 *   - emergency-admin (AdministratorAccess, PT1H) — the only tier with unscoped iam writes.
 *     adopted from the hand-made floor by name. short session: an unattended laptop must not
 *     carry org-rewrite power all day
 *   - everyday-power (PowerUserAccess + roleEverydayPowerPolicyBundle, PT12H) — daily work in
 *     prep + prod, the mail wish apply included; iam writes only on allowlisted role names
 */
export const getResourcesOfAdminSso = async (): Promise<
  DomainEntity<any>[]
> => {
  const provider = await getDeclastructAwsProvider({}, { log });

  // the identity center instance is enabled by hand (aws exposes no create api)
  const ssoInstance = await getOneSsoInstance(
    { by: { auth: true } },
    provider.context,
  );
  if (!ssoInstance)
    UnexpectedCodePathError.throw(
      'identity center is not enabled for this organization',
      {
        hint: 'enable it in us-east-1 first — see howto.bootstrap-aws-sso',
      },
    );
  const instance = refByUnique<typeof DeclaredAwsSsoInstance>(ssoInstance!);

  // permission sets
  const emergencyAdmin = new DeclaredAwsSsoPermissionSet({
    instance,
    name: 'emergency-admin',
    description: 'full admin access for emergencies only',
    sessionDuration: 'PT1H',
    policy: DeclaredAwsIamPolicyBundle.as({
      managed: ['arn:aws:iam::aws:policy/AdministratorAccess'],
      inline: new DeclaredAwsIamPolicyDocument({ statements: [] }),
    }),
    tags: null,
  });
  const everydayPower = new DeclaredAwsSsoPermissionSet({
    instance,
    name: 'everyday-power',
    description: 'power user access for daily work',
    sessionDuration: 'PT12H',
    policy: roleEverydayPowerPolicyBundle,
    tags: null,
  });

  // the admin, addressed by natural key (see ADMIN_USERNAME).
  // .note = derived via refByUnique(new DeclaredAwsSsoUser(...)), never RefByUnique.as or a
  //   plain literal: only the dobj form carries the user's `nested.instance` decl, and without
  //   it declastruct's diff + serialize refuse the nested `instance`
  //   (DomainObjectNotSafeToManipulateError). the user object is NEVER declared — refByUnique
  //   keeps only the unique keys (instance, userName), so the email field below is unread and
  //   never reaches the plan or aws; it is an rfc 2606 address only to satisfy the dobj shape
  const admin = refByUnique<typeof DeclaredAwsSsoUser>(
    new DeclaredAwsSsoUser({
      instance,
      userName: ADMIN_USERNAME,
      displayName: ADMIN_USERNAME,
      email: 'unread@example.com',
    }),
  );

  // the three accounts: root by its id (read from these credentials), members by root email
  const accountRoot = RefByPrimary.as<typeof DeclaredAwsOrganizationAccount>({
    id: provider.context.aws.credentials.account,
  });
  const accountProd = RefByUnique.as<typeof DeclaredAwsOrganizationAccount>({
    email: NHEURON_PROD_ACCOUNT_EMAIL,
  });
  const accountPrep = RefByUnique.as<typeof DeclaredAwsOrganizationAccount>({
    email: NHEURON_PREP_ACCOUNT_EMAIL,
  });

  // one assignment per (permission set, account)
  const asAssignment = (input: {
    permissionSet: DeclaredAwsSsoPermissionSet;
    target: typeof accountRoot | typeof accountProd;
  }): DeclaredAwsSsoAccountAssignment =>
    new DeclaredAwsSsoAccountAssignment({
      instance,
      permissionSet: refByUnique<typeof DeclaredAwsSsoPermissionSet>(
        input.permissionSet,
      ),
      principalType: 'USER',
      principal: admin,
      targetType: 'AWS_ACCOUNT',
      target: input.target,
    });

  // emergency-admin reaches all three; everyday-power reaches the two members
  const assignments = [
    asAssignment({ permissionSet: emergencyAdmin, target: accountRoot }),
    asAssignment({ permissionSet: emergencyAdmin, target: accountPrep }),
    asAssignment({ permissionSet: emergencyAdmin, target: accountProd }),
    asAssignment({ permissionSet: everydayPower, target: accountPrep }),
    asAssignment({ permissionSet: everydayPower, target: accountProd }),
  ];

  return [emergencyAdmin, everydayPower, ...assignments];
};

export const getProviders = async (): Promise<DeclastructProvider[]> => [
  await getDeclastructAwsProvider({}, { log }),
];

export const getResources = async (): Promise<DomainEntity<any>[]> =>
  getResourcesOfAdminSso();
