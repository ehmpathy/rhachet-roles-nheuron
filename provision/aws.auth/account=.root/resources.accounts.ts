import type { DeclastructProvider } from 'declastruct';
import {
  DeclaredAwsOrganization,
  DeclaredAwsOrganizationAccount,
  getCredentials,
  getDeclastructAwsProvider,
} from 'declastruct-aws';
import { type DomainEntity, RefByPrimary } from 'domain-objects';
import { keyrack } from 'rhachet/keyrack';
import { genLogMethods } from 'sdk-logs';

import {
  NHEURON_PREP_ACCOUNT_EMAIL,
  NHEURON_PROD_ACCOUNT_EMAIL,
} from '../resources.common.accounts';

// source aws credentials from keyrack — this wish applies AS THE ROOT account.
// ⚠️ this covers the AWS credentials only. the account ROOT EMAILS are sourced inside
// `resources.common.accounts`, above their own reads — a source here cannot reach them,
// because commonjs hoists that import above this line (see the note in that file)
keyrack.source({ env: 'prep', owner: 'ehmpath', mode: 'lenient' });

const log = genLogMethods();

/**
 * .what = the two member accounts of the nheuron aws organization — nheuron-prod and
 *   nheuron-prep — declared against the organization the root account manages
 * .why = the external brain's lockdown nests: org -> account -> subdomain -> mailbox -> grant.
 *   a dedicated account per env is the second wall, so a breach in prep cannot reach prod and
 *   neither can reach any other project's infra.
 *   see `philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`
 *
 * .note = `nheuron-root` is NOT declared here. declastruct cannot mint the organization it
 *   authenticates as, so a human creates that account + its org by hand ONCE — see bootstrap.md.
 *   from there this wish runs AS THE ROOT and mints the other two.
 *
 * .note = prod / prep, never dev — prep names what happens there (pre-production), symmetric
 *   with prod and test. see `prefer.env_access.prep_over_dev`.
 *
 * @see .behavior/v2026_07_30.collect-from-ses/1.vision.yield.md — deliverable (a0)
 * @see readme.md for the apply steps
 */
export const getResourcesOfAccounts = async (): Promise<
  DomainEntity<any>[]
> => {
  // the root's own account id — read at apply time from the credentials this wish runs under,
  // so the management account is never a literal in git. via the CHEAP credential lookup, the
  // same way the mail wish reads its account — a full provider build would re-construct the
  // whole dao map just to read one string
  const { account: managementAccountId } = await getCredentials();

  const organization = DeclaredAwsOrganization.as({
    managementAccount: RefByPrimary.as<typeof DeclaredAwsOrganizationAccount>({
      id: managementAccountId,
    }),
    featureSet: 'ALL',
  });

  // where real traffic lands. no mail applies here yet — it is reserved, not idle filler
  const accountProd = new DeclaredAwsOrganizationAccount({
    organization,
    name: 'nheuron-prod',
    email: NHEURON_PROD_ACCOUNT_EMAIL,
    iamUserAccessToBilling: 'ALLOW',
    roleName: 'OrganizationAccountAccessRole',
    tags: { managedBy: 'declastruct', purpose: 'prod' },
  });

  // where the jelly@one.nheuron.com mailbox lands (the mail wish applies HERE, not prod)
  const accountPrep = new DeclaredAwsOrganizationAccount({
    organization,
    name: 'nheuron-prep',
    email: NHEURON_PREP_ACCOUNT_EMAIL,
    iamUserAccessToBilling: 'ALLOW',
    roleName: 'OrganizationAccountAccessRole',
    tags: { managedBy: 'declastruct', purpose: 'prep' },
  });

  // apply order = declared array order (declastruct does no topological sort):
  //   organization first (both accounts ref it), then the two members
  return [organization, accountProd, accountPrep];
};

export const getProviders = async (): Promise<DeclastructProvider[]> => [
  await getDeclastructAwsProvider({}, { log }),
];

export const getResources = async (): Promise<DomainEntity<any>[]> =>
  getResourcesOfAccounts();
