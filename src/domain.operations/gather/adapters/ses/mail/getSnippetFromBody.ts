/**
 * .what = max chars of body text used as the preview snippet
 * .why = rfc822 has no snippet concept (gmail supplies one); we derive it, and
 *        200 chars matches the gmail snippet length closely enough to read alike
 */
const SNIPPET_MAX_CHARS = 200;

/**
 * .what = derive a preview snippet from body text
 * .why = rfc822 carries no snippet field, so the ses adapter must synthesize one;
 *        collapse whitespace first so folded headers + hard wraps read as prose
 */
export const getSnippetFromBody = (input: { body: string | null }): string => {
  if (!input.body) return '';

  const collapsed = input.body.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SNIPPET_MAX_CHARS) return collapsed;

  return `${collapsed.slice(0, SNIPPET_MAX_CHARS)}…`;
};
