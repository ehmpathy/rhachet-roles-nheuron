import type { DeclastructProvider } from 'declastruct';
import { getDeclastructAwsProvider } from 'declastruct-aws';
import type { DomainEntity } from 'domain-objects';
import { keyrack } from 'rhachet/keyrack';
import { genLogMethods } from 'sdk-logs';

import {
  NHEURON_PREP_ACCOUNT_EMAIL,
  NHEURON_PROD_ACCOUNT_EMAIL,
} from '../../aws.auth/resources.common.accounts';
import { getAllAdminEmails } from './getAllAdminEmails';
import { getResourcesOfSpendLockdown } from './getResourcesOfSpendLockdown';

// source aws credentials from keyrack env sudo — budgets + scps apply AS THE ROOT account
keyrack.source({ env: 'sudo', owner: 'ehmpath', mode: 'lenient' });

const log = genLogMethods();

/**
 * .what = the sso permission set whose holders on the management account are the org admins
 * .why = every spend alert and breaker notice reaches the admins, read live from identity
 *   center (see getAllAdminEmails), so no address lands in git or keyrack
 */
const ADMIN_PERMISSION_SET_NAME = 'emergency-admin';

export const getProviders = async (): Promise<DeclastructProvider[]> => [
  await getDeclastructAwsProvider({}, { log }),
];

export const getResources = async (): Promise<DomainEntity<any>[]> => {
  // alerts reach the org admins, read live from identity center
  const provider = await getDeclastructAwsProvider({}, { log });
  const alertEmails = await getAllAdminEmails(
    { permissionSetName: ADMIN_PERMISSION_SET_NAME },
    provider.context,
  );
  return getResourcesOfSpendLockdown({
    alertEmails,
    memberEmails: {
      prod: NHEURON_PROD_ACCOUNT_EMAIL,
      prep: NHEURON_PREP_ACCOUNT_EMAIL,
    },
  });
};
