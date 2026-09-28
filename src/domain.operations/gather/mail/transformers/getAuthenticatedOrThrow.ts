import { BadRequestError } from 'helpful-errors';

import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import { getAuthFixHintForMechanism } from '@src/domain.operations/gather/auth/transformers/getAuthFixHintForMechanism';

/**
 * .what = guard: throw if anonymous (no credentials)
 * .why = fail-fast when user hasn't authenticated at all
 *
 * note: this guard allows 'expired' to pass through
 *       because expired tokens can be auto-refreshed
 */
export const getAuthenticatedOrThrow = (input: {
  status: GatherAuthStatus;
  mechanism: GatheredMailMechanism;
}): void => {
  // authenticated or expired: let caller proceed
  // - authenticated: ready to use
  // - expired: caller should refresh
  if (input.status === 'authenticated' || input.status === 'expired') return;

  // status === 'anonymous': no credentials, cannot proceed
  throw new BadRequestError('not authenticated', {
    mechanism: input.mechanism,
    hint: getAuthFixHintForMechanism({ mechanism: input.mechanism }),
  });
};
