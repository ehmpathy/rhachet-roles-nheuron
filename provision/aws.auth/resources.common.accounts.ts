import { BadRequestError } from 'helpful-errors';
import { keyrack } from 'rhachet/keyrack';

import { getDistinctAccountEmailsOrThrow } from './getDistinctAccountEmailsOrThrow';

// ⚠️ THE SOURCE MUST LIVE IN THE SAME MODULE AS THE READS, ABOVE THEM. it once sat in the
// wish that imports this file, which does not work: typescript's commonjs emit hoists EVERY
// `require` to the top of the module body, so this module was loaded — and threw — before the
// wish's own `keyrack.source(...)` line ever ran. the wish then depended on a human who had
// already unlocked in their shell, and its in-file source was dead code for these constants.
// co-located, the source provably precedes the reads (rule.require.credentials-from-keyrack)
keyrack.source({ env: 'prep', owner: 'ehmpath', mode: 'lenient' });

/**
 * .what = the root email of each declared nheuron aws account, sourced from the keyrack env
 * .why = an account's root email is its NATURAL KEY at create time and aws forbids reuse of one,
 *   so it must never land in git. keyrack is the one sanctioned source
 *   (rule.require.credentials-from-keyrack).
 *
 * .note = these throw at MODULE LOAD, deliberately. a lazy getter would defer the failure into
 *   the middle of an apply, where a half-provisioned org is the cost of a typo. so the wish
 *   refuses to even import without the full account env present.
 *
 * .note = the class is `BadRequestError` (exit 2), never `UnexpectedCodePathError` (exit 1). an
 *   absent key is a CALLER-must-fix condition — a human fills it via `rhx keyrack fill`, and no
 *   retry of the same command helps. exit 1 would tell an automation "server fault, retry me",
 *   which re-runs work no retry can complete (rule.require.exit-code-semantics).
 *
 * .note = the source above is `lenient` ON PURPOSE, and it is NOT a silent skip — the throws
 *   below ARE the strictness. strict mode would fail the whole load over any absent key in
 *   `env.prep`, such as the ses + cloudflare keys this wish never reads; the two throws demand
 *   exactly the two values it does read, and each names its own fix.
 *
 * .note = kept APART from any policy module. co-location would make every policy bundle
 *   unimportable without the account env, which breaks a unit test that touches policy shape
 *   alone. only the root dir mints accounts, so only the root dir pays the env cost.
 */
export const NHEURON_PROD_ACCOUNT_EMAIL =
  process.env.NHEURON_PROD_ACCOUNT_EMAIL ??
  BadRequestError.throw(
    'NHEURON_PROD_ACCOUNT_EMAIL absent — the nheuron-prod account root email is not sourced',
    {
      hint: 'rhx keyrack unlock --owner ehmpath --env prep (fill it first via `rhx keyrack fill`)',
    },
  );

export const NHEURON_PREP_ACCOUNT_EMAIL =
  process.env.NHEURON_PREP_ACCOUNT_EMAIL ??
  BadRequestError.throw(
    'NHEURON_PREP_ACCOUNT_EMAIL absent — the nheuron-prep account root email is not sourced',
    {
      hint: 'rhx keyrack unlock --owner ehmpath --env prep (fill it first via `rhx keyrack fill`)',
    },
  );

// the checks above catch an ABSENT email; this catches a DUPLICATE one. both throw at module
// load for the same reason, and this is the case that reason was written for: an absent email
// stops the wish before aws holds any state, while one address in two entries passes that
// check and halts the apply midway — after the org exists and one account is minted
getDistinctAccountEmailsOrThrow({
  emails: {
    'nheuron-prod': NHEURON_PROD_ACCOUNT_EMAIL,
    'nheuron-prep': NHEURON_PREP_ACCOUNT_EMAIL,
  },
});
