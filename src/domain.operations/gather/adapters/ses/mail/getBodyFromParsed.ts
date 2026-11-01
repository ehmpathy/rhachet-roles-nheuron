import type { ParsedMail } from 'mailparser';

/**
 * .what = pick the body text from a parsed mail
 * .why = prefer text/plain; fall back to html so an html-only mail still yields
 *        a body rather than null
 */
export const getBodyFromParsed = (input: {
  parsed: ParsedMail;
}): string | null => {
  if (input.parsed.text) return input.parsed.text;
  if (input.parsed.html) return input.parsed.html;
  return null;
};
