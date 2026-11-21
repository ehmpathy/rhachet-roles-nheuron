/**
 * .what = every mail mechanism the gatherer can actually collect from
 * .why = identifies which adapter handles this mail
 *
 * ⚠️ .note = this union holds ONLY what is implemented. it once carried `'slack' | 'phone'`
 *   as future placeholders, and that cost more than it saved on two counts:
 *
 *   1. it made `isGatheredMailMechanism` lie. the guard narrows to this union, but validates
 *      against `VALID_MECHANISMS` — so a value that passed was only ever gmail or ses, while
 *      the type told every downstream reader it might be `'slack'` (`rule.require.shapefit`).
 *   2. it hid the dispatchers' gap. with a wider union and a `default: throw`, a new member
 *      compiled clean even though no adapter branch existed for it — the defect surfaced at
 *      runtime, for a human, rather than at the keyboard.
 *
 *   narrowed, `VALID_MECHANISMS` covers the whole union and both dispatchers are exhaustive,
 *   so a member added to this line breaks the build until its adapter branches exist
 *   (`rule.prefer.wet-over-dry` — carry no path with no caller).
 */
export type GatheredMailMechanism = 'gmail' | 'ses';

/**
 * .what = the same set, as values — for a runtime check and for a `--from` error message
 * .why = declared `as const` and constrained to the union, so a member added to one and not
 *   the other is a compile error rather than a silent divergence
 */
export const VALID_MECHANISMS = [
  'gmail',
  'ses',
] as const satisfies readonly GatheredMailMechanism[];

/**
 * .what = type guard for GatheredMailMechanism
 * .why = a `--from` value arrives as a bare string from the cli; this is the boundary where
 *   it becomes a domain term
 */
export const isGatheredMailMechanism = (
  value: string,
): value is GatheredMailMechanism =>
  VALID_MECHANISMS.some((mechanism) => mechanism === value);
