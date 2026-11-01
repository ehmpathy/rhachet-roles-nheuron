import { BadRequestError } from 'helpful-errors';

/**
 * .what = report a caught cli error to the human, and yield the exit code it earns
 * .why = both entrypoints held a byte-identical copy of this map. that is the worst place
 *   for a duplicate: `rule.require.exit-code-semantics` makes the code a CONTRACT — 2
 *   means the caller must fix, 1 means the tool malfunctioned — and an automation that
 *   branches on it would be silently wrong for one skill if only the other's copy changed.
 *
 * .note = it prints the `.message` and NOT the stack, deliberately. `helpful-errors`
 *   serializes its metadata into the message, so the hint, the why, and the expected keys
 *   all reach the human; a stack trace as a human's only error output is a blocker
 *   (`rule.require.errors-name-the-fix`).
 *
 * .note = it takes the report sink rather than reach for `console` itself, so the map is
 *   testable without capture of a global.
 *
 * .note = each report opens with its qualified class behind its glyph — `✋ ConstraintError:`
 *   (the caller fixes, exit 2) or `💥 MalfunctionError:` (the system fixes, exit 1) — so the
 *   human reads who owns the fix before the detail (`rule.require.qualified-error-headers`).
 *   the thrown kind (`BadRequestError: …`) stays after it, as the detail.
 */
export const getExitCodeForError = (
  input: { error: unknown },
  context: { setStderr: (content: string) => void },
): number => {
  if (input.error instanceof BadRequestError) {
    context.setStderr(`✋ ConstraintError: ${input.error.message}`);
    return 2; // caller-must-fix
  }

  // catch-all: an unexpected error still earns human-readable output
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  context.setStderr(`💥 MalfunctionError: ${message}`);
  return 1; // unexpected
};
