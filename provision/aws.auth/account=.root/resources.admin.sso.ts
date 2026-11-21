import type { DeclastructProvider } from 'declastruct';
import {
  DeclaredAwsIamPolicyBundle,
  DeclaredAwsIamPolicyDocument,
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
 * .what = sso permission sets + account assignments for the human admin
 * .why = admins sign in via `aws sso login` (keyrack), never root credentials. the hand-made
 *   floor (one user, `emergency-admin`, one assignment to root) exists only so this wish can
 *   run; from here the wish owns all sso state. same shape as ahbode/infrastructure
 *   `resources.admin.sso.ts`
 *
 * .note = two tiers, by blast radius:
 *   - emergency-admin (AdministratorAccess, PT1H) — the only tier that may write iam. adopted
 *     from the hand-made floor by name. short session: an unattended laptop must not carry
 *     org-rewrite power all day
 *   - everyday-power (PowerUserAccess, PT12H) — daily work in prep + prod; no iam writes
 */
export const getResourcesOfAdminSso = async (): Promise<DomainEntity<any>[]> => {
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
    policy: DeclaredAwsIamPolicyBundle.as({
      managed: ['arn:aws:iam::aws:policy/PowerUserAccess'],
      inline: new DeclaredAwsIamPolicyDocument({ statements: [] }),
    }),
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
