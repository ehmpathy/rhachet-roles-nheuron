import { RoleRegistry } from 'rhachet';

import { ROLE_COLLECTOR } from './collector/getCollectorRole';

/**
 * .what = returns the nheuron registry of predefined roles
 * .why = enables rhachet to discover and enroll nheuron roles
 */
export const getRoleRegistry = (): RoleRegistry =>
  RoleRegistry.build({
    slug: 'nheuron',
    readme: { uri: `${__dirname}/readme.md` },
    roles: [ROLE_COLLECTOR],
  });
