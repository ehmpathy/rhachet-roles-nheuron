/**
 * .what = parse the comma-separated `SES_DKIM_TOKENS` env value into a clean token list
 * .why = these 3 tokens are the ONE dynamic input to the whole dns record set — a wrong parse
 *   (a stray empty segment, an untrimmed token) produces wrong CNAME records with no error, so
 *   the parse carries the dns wish and earns a named, tested form of its own rather than a
 *   private closure (`rule.prefer.decomposable-architecture`).
 *
 * .note = pure: it takes the raw string, never `process.env`, so a test pins the contract with
 *   no env mutation. the caller reads the env and hands the value in.
 *
 * .the contract = split on comma, trim each segment, drop the empties. an empty or absent raw
 *   yields `[]` — which the caller reads as "the aws wish has not applied yet" and refuses loud,
 *   rather than a half-declared dns set.
 */
export const asDkimTokens = (input: { raw: string | null }): string[] =>
  (input.raw ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
