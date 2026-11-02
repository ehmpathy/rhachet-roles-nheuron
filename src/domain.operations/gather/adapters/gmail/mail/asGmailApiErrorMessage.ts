/**
 * .what = the human-useful message out of a gmail api error body
 * .why = the raw body is a json envelope (`{ error: { code, message, errors, status } }`).
 *   embedded whole in a cli error, it renders as one escaped line a human must wade through to
 *   find the one fact that matters. this pulls `error.message`; a body that is not the
 *   envelope passes through as-is, so no detail is ever lost.
 */
export const asGmailApiErrorMessage = (input: { body: string }): string => {
  try {
    const parsed: unknown = JSON.parse(input.body);
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof parsed.error === 'object' &&
      parsed.error !== null &&
      'message' in parsed.error &&
      typeof parsed.error.message === 'string'
        ? parsed.error.message
        : null;
    return message ?? input.body;
  } catch (error) {
    // only a json parse failure means "not the envelope"; any other error is a defect
    if (!(error instanceof SyntaxError)) throw error;
    return input.body;
  }
};
