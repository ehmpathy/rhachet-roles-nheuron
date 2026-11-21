/**
 * .what = whether the caller asked for help
 * .why = every cli entrypoint offers `--help`/`-h`, and each had its own copy of this
 *   check. two copies of one convention drift silently: add `-?` to one entrypoint and
 *   the other still refuses it, so the same flag works on one skill and fails on its
 *   neighbor — a surface a human reads as arbitrary (`rule.forbid.surprises`).
 *
 * .note = it takes the argv rather than reads `process.argv` itself, so it stays pure and
 *   testable — the entrypoint owns the read of process state.
 */
export const getIsHelpAsked = (input: { argv: string[] }): boolean => {
  return input.argv.includes('--help') || input.argv.includes('-h');
};
