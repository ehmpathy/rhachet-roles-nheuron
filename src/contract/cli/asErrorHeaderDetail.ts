/**
 * .what = the part of an error's message a human reads after the qualified header
 * .why = `helpful-errors` writes the thrown class into `.message` (`BadRequestError: <what>`).
 *   behind a `✋ ConstraintError:` header that class is a second label for the same fact, so it
 *   is cut. a message without the prefix comes back whole, so a library that stops the prefix
 *   leaves the header correct
 */
export const asErrorHeaderDetail = (input: { error: unknown }): string => {
  // a thrown non-Error carries no class to cut
  if (!(input.error instanceof Error)) return String(input.error);

  // cut the thrown class, only where the message opens with it. helpful-errors leaves
  // `.name` at 'Error', so the class is read from the constructor
  const prefix = `${input.error.constructor.name}: `;
  return input.error.message.startsWith(prefix)
    ? input.error.message.slice(prefix.length)
    : input.error.message;
};
