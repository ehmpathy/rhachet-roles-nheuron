/**
 * .what = the output formats gather.mail can render
 */
export const VALID_OUTPUT_FORMATS = ['tree', 'json'] as const;

export type GatherOutputFormat = (typeof VALID_OUTPUT_FORMATS)[number];

/**
 * .what = type guard: is this raw `--format` value one gather.mail can render?
 * .why = narrows the cli string to the format union with no `as` cast, the same way
 *   `isGatheredMailMechanism` narrows `--from`
 */
export const isGatherOutputFormat = (
  value: string,
): value is GatherOutputFormat =>
  (VALID_OUTPUT_FORMATS as readonly string[]).includes(value);
