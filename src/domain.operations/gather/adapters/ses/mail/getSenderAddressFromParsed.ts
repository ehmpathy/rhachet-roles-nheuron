import type { ParsedMail } from 'mailparser';

/**
 * .what = extract the bare sender address from a parsed mail
 * .why = mailparser exposes `from.value[]` as {address, name}; we want the address
 *        alone, and an absent From is possible on malformed mail
 */
export const getSenderAddressFromParsed = (input: {
  parsed: ParsedMail;
}): string => {
  const from = input.parsed.from;
  if (!from) return '';

  // prefer the structured value — mailparser already split "Name <addr>" for us
  const firstValue = from.value[0];
  if (firstValue?.address) return firstValue.address;

  // fall back to the raw text form when the structured parse found no address
  return from.text ?? '';
};
