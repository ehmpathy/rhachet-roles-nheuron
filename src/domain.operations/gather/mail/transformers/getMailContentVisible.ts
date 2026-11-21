/**
 * .what = what a human may SEE of a mail's content, given whether it is security sensitive
 * .why = the gatherer shows only the EXISTENCE of a security-sensitive mail, never its
 *   content — an mfa code, a password reset, a login token. that is the innermost wall of
 *   `philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`: even a legitimate read of
 *   the vault does not surface the crown jewels.
 *
 *   every mechanism must obfuscate identically, so the rule lives here rather than once per
 *   adapter. it was previously hand-rolled byte-for-byte in gmail's and ses's readers, with
 *   the replacement literal repeated six times across the two — so a change to the message
 *   meant six correct edits, and a divergence between two adapters would be a defect no test
 *   would catch (`rule.forbid.magic-values`).
 *
 * .note = the three fields are obfuscated TOGETHER or not at all. sensitivity is a property
 *   of the mail, never of one field — a clean subject beside a body that still carries a
 *   token is the exact partial disclosure this exists to prevent.
 *
 * .note = an absent body stays `null`, sensitive or not: there is no content to hide, and
 *   `null` is the real state of the record (fulcrum F17, ruled by the director).
 */
export const MAIL_CONTENT_OBFUSCATED =
  '[security-sensitive content obfuscated]';

export const getMailContentVisible = (input: {
  subject: string;
  snippet: string;
  body: string | null;
  isSecuritySensitive: boolean;
}): { subject: string; snippet: string; body: string | null } =>
  input.isSecuritySensitive
    ? {
        subject: MAIL_CONTENT_OBFUSCATED,
        snippet: MAIL_CONTENT_OBFUSCATED,
        body: input.body === null ? null : MAIL_CONTENT_OBFUSCATED,
      }
    : {
        subject: input.subject,
        snippet: input.snippet,
        body: input.body,
      };
