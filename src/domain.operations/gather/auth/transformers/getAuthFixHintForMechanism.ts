import { UnexpectedCodePathError } from 'helpful-errors';

import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';

/**
 * .what = the ONE fix a human owes when a mechanism reads anonymous
 * .why = a hint that names a command which REFUSES the human is worse than no hint at all
 *   (`rule.require.errors-name-the-fix`).
 *
 * ⚠️ .note = **the hint never names `gather.auth`.** ses authenticates from the AWS_PROFILE
 *   keyrack places in the env, and its `genAuth` throws `ses needs no auth flow` (exit 2)
 *   rather than grants. so the real fix is the keyrack unlock, stated here once.
 *
 * ⚠️ .why here = one text serves both the thrown error (`getAuthenticatedOrThrow`) and the
 *   status display (`getAuthStatusDisplay`), so one human never meets two answers to one
 *   question from one tool (`rule.require.ubiqlang`).
 *
 * ⚠️ .note = the dispatch is EXHAUSTIVE, on the narrow union, with a `never` clamp — the same
 *   shape `getMailAdapterForMechanism` and `getAuthAdapterForMechanism` use. a new mechanism
 *   fails to compile here until it names its own fix.
 */
export const getAuthFixHintForMechanism = (input: {
  mechanism: GatheredMailMechanism;
}): string => {
  if (input.mechanism === 'ses')
    return 'ses authenticates via AWS_PROFILE. run: rhx keyrack unlock --owner ehmpath --env prep';

  return UnexpectedCodePathError.throw('no auth fix hint for mechanism', {
    mechanism: input.mechanism satisfies never,
  });
};
