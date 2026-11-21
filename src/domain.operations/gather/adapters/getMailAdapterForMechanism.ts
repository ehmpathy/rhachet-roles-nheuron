import { BadRequestError } from 'helpful-errors';

import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import type { GatherMailAdapter } from '@src/domain.objects/GatherMailAdapter';

import { getGmailMailAdapter } from './gmail/mail/getGmailMailAdapter';
import { getSesMailAdapter } from './ses/mail/getSesMailAdapter';

/**
 * .what = select mail adapter for mechanism
 * .why = enables --from flag to route to correct adapter
 */
export const getMailAdapterForMechanism = (input: {
  mechanism: GatheredMailMechanism;
  cwd: string | null;
}): GatherMailAdapter => {
  switch (input.mechanism) {
    case 'gmail':
      return getGmailMailAdapter({ cwd: input.cwd });

    case 'ses':
      // no cwd: ses reads its bucket + region from the keyrack env
      return getSesMailAdapter();

    // ⚠️ the annotation is the point. `GatheredMailMechanism` holds only what is
    // implemented, so once every member has a case above, this branch is unreachable and
    // `mechanism` narrows to `never`. add a member to the union and it no longer narrows —
    // so the build breaks HERE, at the dispatcher that owes the new adapter a branch,
    // rather than at runtime in front of a human (`rule.prefer.prevent-over-correct`)
    default: {
      const mechanismUnhandled: never = input.mechanism;
      return BadRequestError.throw('mechanism not supported', {
        mechanism: mechanismUnhandled,
        hint: 'use --from gmail or --from ses',
      });
    }
  }
};
