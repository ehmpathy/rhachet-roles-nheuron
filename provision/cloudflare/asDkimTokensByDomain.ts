import { BadRequestError } from 'helpful-errors';

import { asDkimTokens } from './asDkimTokens';

/**
 * .what = parse the `SES_DKIM_TOKENS` env value into each domain's dkim tokens
 * .why = every ses domain identity mints its own 3 tokens, and the mailboxes span several
 *   domains (prep, prod, and the prod alias) in one dns zone. one keyrack value carries them all,
 *   keyed by domain, so the dns wish declares every domain's cnames from one source.
 *
 * .the contract = `<domain>=tok1,tok2,tok3;<domain>=tok1,tok2,tok3`. segments split on `;`, each
 *   on its first `=`; the tokens parse via `asDkimTokens` (trim, drop empties). an empty or
 *   absent raw yields `{}`. a segment with no `=` or no domain refuses loud — a silent drop
 *   would leave that domain's cnames undeclared and its identity unverified forever.
 *
 * .note = pure: it takes the raw string, never `process.env`. the caller reads the env.
 */
export const asDkimTokensByDomain = (input: {
  raw: string | null;
}): Record<string, string[]> => {
  const segments = (input.raw ?? '')
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return Object.fromEntries(
    segments.map((segment) => {
      // reject a segment that names no domain — it cannot be placed in the zone
      const sep = segment.indexOf('=');
      const domain = sep > 0 ? segment.slice(0, sep).trim() : '';
      if (!domain)
        BadRequestError.throw(
          'SES_DKIM_TOKENS holds a segment with no domain',
          {
            segment,
            hint: 'shape each segment as <domain>=tok1,tok2,tok3, joined by ;  — `rhx mail.dns.records.get --env <env>` prints the exact value',
          },
        );
      return [domain, asDkimTokens({ raw: segment.slice(sep + 1) })];
    }),
  );
};
