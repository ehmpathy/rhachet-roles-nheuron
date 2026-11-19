import { BadRequestError } from 'helpful-errors';

/**
 * .what = a mailbox address, checked at the cli boundary
 * .why = the address names the cache dir (`mechanism=ses/address=<it>`), so a `/` or a
 *   blank in it would reach a filesystem path. refuse it here, before auth, with the
 *   shape a human must type (`rule.require.failfast`, `rule.require.errors-name-the-fix`)
 *
 * .note = the check is the shape only — one `@`, a local part and a domain, no `/` and no
 *   whitespace. whether the mailbox exists is the mechanism's question, not this one's.
 */
export const asAddressOrThrow = (input: { address: string }): string => {
  const isShaped = /^[^\s@/]+@[^\s@/]+$/.test(input.address);
  if (!isShaped)
    BadRequestError.throw(
      `address '${input.address}' is not a mailbox address`,
      {
        address: input.address,
        why: 'the address names the mailbox and its cache dir, so it must be one plain email address',
        hint: 'pass one address, e.g. --address jelly@one.nheuron.com',
      },
    );

  return input.address;
};
