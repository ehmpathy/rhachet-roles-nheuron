import type { GatherAuthAdapter } from '@src/domain.objects/GatherAuthAdapter';
import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import { getStatusIsAnonymous } from './transformers/getStatusIsAnonymous';

/**
 * .what = ensure auth exists (gen pattern: find-or-create)
 * .why = finds extant auth or creates if absent, always idempotent
 *
 * narrative steps:
 *   1. getStatusIsAnonymous → check if auth is needed
 *   2. authAdapter.genAuth → run auth flow if needed (early return if not)
 */
export const genAuthIfAnonymous = async (
  input: {
    status: GatherAuthStatus;
    authAdapter: GatherAuthAdapter;
  },
  context: {
    log: GatherLogMethods;
  },
): Promise<{ address: string | null; status: GatherAuthStatus }> => {
  // check if auth is needed
  const isAnonymous = getStatusIsAnonymous({ status: input.status });

  // early return if already authenticated
  if (!isAnonymous) {
    return { address: null, status: input.status };
  }

  // ask the mechanism for auth. ses has no interactive flow, so its genAuth throws with
  // the keyrack fix; this line stays mechanism-neutral rather than promise a grant flow.
  context.log.info('auth needed, ask the mechanism for it', {
    mechanism: input.authAdapter.mechanism,
  });

  const result = await input.authAdapter.genAuth({}, { log: context.log });

  return {
    address: result.repo.address,
    status: result.status,
  };
};
