/**
 * .what = detect if mail content triggers obfuscation
 * .why = protect user from accidental exposure of sensitive authentication content
 *
 * triggers: password, mfa, otp, verification code, 2fa, signin, reset, authentication
 */
export const getIsSecuritySensitive = (input: {
  subject: string;
  snippet: string;
  body?: string | null;
}): boolean => {
  // security-sensitive keywords that trigger obfuscation
  const sensitivePatterns = [
    /password/i,
    /\bmfa\b/i,
    /\botp\b/i,
    /verification\s*code/i,
    /\b2fa\b/i,
    /two[- ]?factor/i,
    /sign[- ]?in/i,
    /signin/i,
    /reset\s*(your\s*)?(password|account)/i,
    /authentication/i,
    /security\s*code/i,
    /one[- ]?time\s*(password|code)/i,
    /login\s*(code|verification)/i,
    /verify\s*your\s*(identity|account|email)/i,
    /account\s*recovery/i,
    /suspicious\s*(activity|sign[- ]?in)/i,
    /confirm\s*your\s*identity/i,
  ];

  // combine all content to check
  const content = [input.subject, input.snippet, input.body ?? ''].join(' ');

  // check if any sensitive pattern matches
  return sensitivePatterns.some((pattern) => pattern.test(content));
};
