import { BadRequestError } from 'helpful-errors';

/**
 * .what = the scope keys an address may carry after its `/`
 * .why = `getAddressScope` parses ANY `key=a,b` pair, so the set of keys it can produce is
 *   open. the set this repo can actually honor is closed — exactly one. that gap is where a
 *   silent drop lives, so the closed set is declared here and enforced below.
 */
const SCOPE_KEYS_SUPPORTED = ['labels'] as const;

/**
 * .what = read the labels out of a parsed address scope, and refuse any key we cannot honor
 * .why = `gather.mail --address 'a@b.com/labels=work'` once parsed the scope and then dropped
 *   it: the human got their whole mailbox with exit 0 and no note that the filter was ignored.
 *   an unhonored filter must fail LOUD, never widen the result silently
 *   (`rule.forbid.surprises`, `rule.forbid.failhide`).
 *
 * .note = an absent scope is a real state (most calls have none), so it yields an empty list
 *   rather than an error. only a scope we cannot honor throws.
 */
export const getAllLabelsFromScope = (input: {
  scope: Record<string, string[]> | null;
}): string[] => {
  if (!input.scope) return [];

  const keysUnsupported = Object.keys(input.scope).filter(
    (key) => !SCOPE_KEYS_SUPPORTED.includes(key as 'labels'),
  );

  if (keysUnsupported.length > 0)
    BadRequestError.throw('address scope has a key we cannot honor', {
      keysUnsupported,
      keysSupported: SCOPE_KEYS_SUPPORTED,
      why: 'an ignored scope would widen the result silently — you would get more mail than you asked for, with no error',
      hint: `drop it, or use one of: ${SCOPE_KEYS_SUPPORTED.join(', ')}`,
    });

  return input.scope.labels ?? [];
};
