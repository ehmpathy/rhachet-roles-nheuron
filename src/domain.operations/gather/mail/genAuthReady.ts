import { UnexpectedCodePathError } from 'helpful-errors';

import type { GatherAuthAdapter } from '@src/domain.objects/GatherAuthAdapter';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import { getAuthenticatedOrThrow } from './transformers/getAuthenticatedOrThrow';

/**
 * .what = ensure auth is ready before mail operations
 * .why = guard + refresh orchestrator for mail dispatcher
 *
 * narrative steps:
 *   1. authAdapter.getAuthStatus → get current status
 *   2. getAuthenticatedOrThrow → guard: throws if anonymous
 *   3. authAdapter.genAuthRefresh → refresh if expired
 *   4. authAdapter.getAccessToken → return token for downstream
 *
 * .note = it names NO mechanism. each adapter owns its own auth strategy behind the
 *   `GatherAuthAdapter` seam — gmail picks between a service account and oauth inside
 *   `getGmailAuthAdapter`; ses reads AWS_PROFILE inside `getSesAuthAdapter`. so a new
 *   mechanism reuses this orchestrator untouched, and a reader need not know any
 *   mechanism's internals to follow it.
 */
export const genAuthReady = async (
  input: {
    repo: GatheredMailRepo;
    authAdapter: GatherAuthAdapter;
  },
  context: {
    log: GatherLogMethods;
  },
): Promise<{ accessToken: string }> => {
  // get current auth status
  const status = await input.authAdapter.getAuthStatus(
    { repo: input.repo },
    { log: context.log },
  );

  // guard: fail-fast if not authenticated
  getAuthenticatedOrThrow({ status, mechanism: input.repo.mechanism });

  // refresh if expired
  if (status === 'expired') {
    context.log.debug('auth expired, refresh token', {
      address: input.repo.address,
    });

    await input.authAdapter.genAuthRefresh(
      { repo: input.repo },
      { log: context.log },
    );
  }

  // get access token for downstream operations
  const accessToken = await input.authAdapter.getAccessToken(
    { repo: input.repo },
    { log: context.log },
  );

  // guard: token should exist after auth check
  if (!accessToken) {
    throw new UnexpectedCodePathError(
      'token absent after auth check; this should never happen',
      { repo: input.repo },
    );
  }

  return { accessToken };
};
