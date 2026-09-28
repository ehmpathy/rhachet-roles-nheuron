/**
 * .what = encode a header value that may hold non-ascii chars
 * .why = rfc2047 requires non-ascii header text be encoded; a raw utf-8 subject
 *        would otherwise arrive as mojibake in most mail clients
 */
export const asEncodedHeaderValue = (input: { value: string }): string => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ascii range check
  const isAscii = /^[\x00-\x7F]*$/.test(input.value);
  if (isAscii) return input.value;

  const encoded = Buffer.from(input.value, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
};

/**
 * .what = strip CR/LF from a header value
 * .why = a newline in a header value would inject additional headers into the
 *        message — the mail equivalent of an injection attack. so any caller
 *        input that lands in a header is flattened first.
 */
export const asSafeHeaderValue = (input: { value: string }): string =>
  input.value.replace(/[\r\n]+/g, ' ').trim();

/**
 * .what = build a raw rfc822/mime message ready for ses:SendRawEmail
 * .why = SendRawEmail takes the full message bytes rather than structured fields,
 *        so the headers + body must be assembled here
 *
 * .note = pure transformer — no i/o, so it unit-tests without aws
 */
export const asRawMimeMessage = (input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
}): string => {
  const headers = [
    `From: ${asSafeHeaderValue({ value: input.from })}`,
    `To: ${asSafeHeaderValue({ value: input.to })}`,
    `Subject: ${asEncodedHeaderValue({
      value: asSafeHeaderValue({ value: input.subject }),
    })}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',

    // thread the reply, when it answers a known message. In-Reply-To names the
    // parent; References carries the thread chain (one entry is valid).
    ...(input.inReplyTo
      ? [
          `In-Reply-To: ${asSafeHeaderValue({ value: input.inReplyTo })}`,
          `References: ${asSafeHeaderValue({ value: input.inReplyTo })}`,
        ]
      : []),
  ];

  // base64-encode the body so any utf-8 content survives transport intact, and
  // wrap at 76 chars per rfc2045
  const encodedBody = (
    Buffer.from(input.body, 'utf-8')
      .toString('base64')
      .match(/.{1,76}/g) ?? []
  ).join('\r\n');

  return [...headers, '', encodedBody].join('\r\n');
};
