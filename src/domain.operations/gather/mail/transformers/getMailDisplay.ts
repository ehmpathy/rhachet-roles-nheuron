import type { GatheredMail } from '@src/domain.objects/GatheredMail';

import { getMailContentVisible } from './getMailContentVisible';

/**
 * .what = what a human may SEE of a gathered mail, given its own sensitivity flag
 * .why = the adapters obfuscate at INGEST, so `mail.subject` already carries the replacement
 *   by the time it reaches an output. this second pass is a nested wall, not a duplicate one:
 *   the cache is a plain file on disk, and `getAllCachedMails` reads `isObfuscated` back out
 *   of it, so a mail can reach an output with the flag set. the display re-applies the rule
 *   rather than trusts the read-back — the same nest of independent walls
 *   `philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes` asks for.
 *
 * ⚠️ .note = the replacement text is NOT written here. this delegates to
 *   `getMailContentVisible`, which owns the one literal. it once held its own pair of
 *   literals (`[OBFUSCATED: security-sensitive content]` / `[OBFUSCATED]`), and those had
 *   already drifted from the single source — so the string a human actually saw was never
 *   the one the single source declared. a second wall may repeat the CHECK; it must never
 *   repeat the ANSWER (`rule.forbid.magic-values`).
 *
 * .note = the input maps `isObfuscated` onto `isSecuritySensitive`. the two words name the
 *   same fact at two stages — sensitivity is what the adapter DETECTS, obfuscation is the
 *   record it then writes of what it did about it.
 */
export const getMailDisplay = (input: {
  mail: GatheredMail;
}): { subject: string; snippet: string; body: string | null } =>
  getMailContentVisible({
    subject: input.mail.subject,
    snippet: input.mail.snippet,
    body: input.mail.body,
    isSecuritySensitive: input.mail.isObfuscated,
  });
