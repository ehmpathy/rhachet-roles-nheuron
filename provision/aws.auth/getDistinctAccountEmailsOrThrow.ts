import { BadRequestError } from 'helpful-errors';

/**
 * .what = guard: throw unless every declared account root email is distinct
 * .why = an aws account's root email is its natural key at create time, and aws refuses a
 *   second account on an address already in use. so two accounts that name one address is
 *   not a style defect — it is an apply that CANNOT complete.
 *
 * .note = the failure this prevents is the expensive one. an absent email fails at module
 *   load, before any resource exists. a DUPLICATE email passes that check, so the apply
 *   runs: the organization is created, the first account is minted, and the second is
 *   refused by aws mid-apply. to unwind a half-provisioned org takes an aws support ticket
 *   to close an account — days, not a re-run. the peer absence guard exists to avert
 *   precisely that outcome, and until this guard it missed the likelier route to it (one
 *   address pasted into two keyrack entries).
 *
 * .note = comparison is case-folded and trimmed. aws treats a root email
 *   case-insensitively, so `Jelly@x.com` and `jelly@x.com` are ONE address to aws while a
 *   raw `===` reads them as two — which would let the collision through the very guard
 *   built to catch it.
 */
export const getDistinctAccountEmailsOrThrow = (input: {
  emails: Record<string, string>;
}): void => {
  const seen = new Map<string, string>();

  for (const [account, email] of Object.entries(input.emails)) {
    const key = email.trim().toLowerCase();
    const accountPrior = seen.get(key);

    if (accountPrior)
      BadRequestError.throw(
        'two declared aws accounts name the same root email',
        {
          accounts: [accountPrior, account],
          why: 'an account root email is its natural key at create time; aws refuses a second account on an address already in use, so this apply would halt with the organization half-provisioned',
          hint: 'give each account its own fresh, unused address, then `rhx keyrack fill --owner ehmpath --env prep`',
        },
      );

    seen.set(key, account);
  }
};
