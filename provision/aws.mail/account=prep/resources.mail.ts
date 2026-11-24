import type { DeclastructProvider } from 'declastruct';
import { getCredentials, getDeclastructAwsProvider } from 'declastruct-aws';
import type { DomainEntity } from 'domain-objects';
import { keyrack } from 'rhachet/keyrack';
import { genLogMethods } from 'sdk-logs';

import { getResourcesOfMail } from '../getResourcesOfMail';

// source aws credentials from keyrack — this wish applies into the nheuron-prep account, whose
// profile lives in the nheuron org slot, apart from the shared ehmpathy slots
keyrack.source({
  env: 'prep',
  owner: 'ehmpath',
  org: 'nheuron',
  mode: 'lenient',
});

const log = genLogMethods();

/**
 * .what = the prep mailbox: jelly@one.prep.nheuron.com
 * .why = the mailbox tests run against — the live `TEST_LIVE=ses` suites read and send here, so
 *   a defect lands on prep before it can reach the public prod address
 *
 * @see ../getResourcesOfMail.ts — the resources, shared by both envs
 * @see ../readme.md — prereqs + apply steps
 */
export const getProviders = async (): Promise<DeclastructProvider[]> => [
  await getDeclastructAwsProvider({}, { log }),
];

export const getResources = async (): Promise<DomainEntity<any>[]> => {
  // read account + region via the CHEAP credential lookup (region from env/config + account
  // from sts) — NOT a second full provider build
  const { account, region } = await getCredentials();
  return getResourcesOfMail({ env: 'prep', account, region });
};
