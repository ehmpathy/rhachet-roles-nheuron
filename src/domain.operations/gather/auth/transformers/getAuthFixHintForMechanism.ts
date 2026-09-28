import { UnexpectedCodePathError } from 'helpful-errors';

import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';

/**
 * .what = the ONE fix a human owes when a mechanism reads anonymous
 * .why = a hint that names a command which REFUSES the human is worse than no hint at all
 *   (`rule.require.errors-name-the-fix`).
 *
 * ⚠️ .note = **NEITHER mechanism has an interactive auth flow, so neither hint may name
 *   `gather.auth`.** both authenticate from credentials keyrack places in the env, and
 *   `genAuth` on both adapters throws rather than grants:
 *
 *   | mechanism | what `gather.auth --from X` does | the real fix |
 *   |-----------|----------------------------------|--------------|
 *   | gmail | throws `gmail has no interactive auth flow` (exit 2) | fill the service account, then unlock |
 *   | ses | throws `ses needs no auth flow` (exit 2) | unlock the aws profile |
 *
 *   the gmail hint DID say `run 'gather.auth --from gmail' to authenticate` — a command that
 *   cannot authenticate anyone, so a human who followed it was bounced through a refusal
 *   before they could reach the real fix. that is the identical defect the ses branch beside
 *   it exists to close, left open on the branch nobody re-read. each hint below states what
 *   its own adapter's `genAuth` already throws, so the two can no longer disagree.
 *
 * ⚠️ .why here = this text was written TWICE — once for the thrown error
 *   (`getAuthenticatedOrThrow`) and once for the status display (`getAuthStatusDisplay`) —
 *   and the two copies had already drifted. one said "ses authenticates via AWS_PROFILE. run:
 *   …", the other said a bare "run: …"; one quoted the gmail command, the other did not. so
 *   one human hit two different answers to one question, from one tool, on one run
 *   (`rule.require.ubiqlang`).
 *
 * ⚠️ .note = the dispatch is EXHAUSTIVE, on the narrow union, with a `never` clamp — the same
 *   shape `getMailAdapterForMechanism` and `getAuthAdapterForMechanism` already use. both
 *   prior copies compared `mechanism === 'ses'` against a bare `string`, so a third mechanism
 *   would have silently inherited gmail's hint and told its human to run a command that does
 *   not authenticate them. it now fails to compile instead.
 */
export const getAuthFixHintForMechanism = (input: {
  mechanism: GatheredMailMechanism;
}): string => {
  if (input.mechanism === 'ses')
    return 'ses authenticates via AWS_PROFILE. run: rhx keyrack unlock --owner ehmpath --env prep';

  if (input.mechanism === 'gmail')
    return 'gmail authenticates via a service account. fill GMAIL_SERVICE_ACCOUNT_JSON + GMAIL_SERVICE_ACCOUNT_SUBJECT, then run: rhx keyrack unlock --owner ehmpath --env test';

  return UnexpectedCodePathError.throw('no auth fix hint for mechanism', {
    mechanism: input.mechanism satisfies never,
  });
};
