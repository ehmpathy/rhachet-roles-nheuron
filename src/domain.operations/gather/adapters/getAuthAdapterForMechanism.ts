import { BadRequestError } from 'helpful-errors';

import type { GatherAuthAdapter } from '@src/domain.objects/GatherAuthAdapter';
import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';

import { getGmailAuthAdapter } from './gmail/auth/getGmailAuthAdapter';
import { getSesAuthAdapter } from './ses/auth/getSesAuthAdapter';

/**
 * .what = select auth adapter for mechanism
 * .why = enables --from flag to route to correct adapter
 */
export const getAuthAdapterForMechanism = (input: {
  mechanism: GatheredMailMechanism;
  cwd: string | null;
}): GatherAuthAdapter => {
  switch (input.mechanism) {
    case 'gmail':
      return getGmailAuthAdapter({ cwd: input.cwd });

    case 'ses':
      // no cwd: ses caches no token, so it anchors no path to one
      return getSesAuthAdapter();

    // the `never` annotation makes this dispatcher exhaustive — see its peer,
    // `getMailAdapterForMechanism`, for why. a new mechanism owes BOTH a mail adapter and
    // an auth adapter, and this is the half that would otherwise be easy to forget
    default: {
      const mechanismUnhandled: never = input.mechanism;
      return BadRequestError.throw('mechanism not supported', {
        mechanism: mechanismUnhandled,
        hint: 'use --from gmail or --from ses',
      });
    }
  }
};
