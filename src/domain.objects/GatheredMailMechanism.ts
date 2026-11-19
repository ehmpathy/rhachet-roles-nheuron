/**
 * .what = every mail mechanism the gatherer can actually collect from
 * .why = identifies which adapter handles this mail
 *
 * .note = this union holds ONLY what is implemented. a placeholder member would make
 *   `isGatheredMailMechanism` lie about what it validates (`rule.require.shapefit`), and it
 *   would compile clean past the dispatchers' `never` guards with no adapter behind it.
 *   so a member added to this line breaks the build until its adapter branches exist
 *   (`rule.prefer.wet-over-dry` — carry no path with no caller).
 */
export type GatheredMailMechanism = 'ses';

/**
 * .what = the same set, as values — for a runtime check and for a `--from` error message
 * .why = declared `as const` and constrained to the union, so a member added to one and not
 *   the other is a compile error rather than a silent divergence
 */
export const VALID_MECHANISMS = [
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
