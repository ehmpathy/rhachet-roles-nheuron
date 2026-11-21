import { asEncodedHeaderValue } from './asEncodedHeaderValue';
import { asSafeHeaderValue } from './asSafeHeaderValue';

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
