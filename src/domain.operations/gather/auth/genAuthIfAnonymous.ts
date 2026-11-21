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

  // ask the mechanism for auth. NEITHER mechanism has an interactive flow today:
  // gmail authenticates via a keyrack service account (its genAuth refuses a browser
  // grant), and ses has no flow at all — both throw with their keyrack fix. so this
  // line must stay mechanism-neutral rather than name an oauth dance that cannot run.
  context.log.info('auth needed, ask the mechanism for it', {
    mechanism: input.authAdapter.mechanism,
  });

  const result = await input.authAdapter.genAuth({}, { log: context.log });

  return {
    address: result.repo.address,
    status: result.status,
  };
};
