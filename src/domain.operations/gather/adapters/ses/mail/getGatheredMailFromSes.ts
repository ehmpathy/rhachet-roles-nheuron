import type { ParsedMail } from 'mailparser';

import { GatherContactRef } from '@src/domain.objects/GatherContactRef';
import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { getIsSecuritySensitive } from '@src/domain.operations/gather/mail/transformers/getIsSecuritySensitive';
import { getMailContentVisible } from '@src/domain.operations/gather/mail/transformers/getMailContentVisible';

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

/**
 * .what = extract the bare sender address from a parsed mail
 * .why = mailparser exposes `from.value[]` as {address, name}; we want the address
 *        alone, and an absent From is possible on malformed mail
 */
export const getSenderAddressFromParsed = (input: {
  parsed: ParsedMail;
}): string => {
  const from = input.parsed.from;
  if (!from) return '';

  // prefer the structured value — mailparser already split "Name <addr>" for us
  const firstValue = from.value[0];
  if (firstValue?.address) return firstValue.address;

  // fall back to the raw text form when the structured parse found no address
  return from.text ?? '';
};

/**
 * .what = extract attachment filenames from a parsed mail
 * .why = GatheredMail carries names only, never content
 */
export const getAttachmentNamesFromParsed = (input: {
  parsed: ParsedMail;
}): string[] =>
  input.parsed.attachments
    .map((attachment) => attachment.filename)
    .filter((filename): filename is string => !!filename);

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

/**
 * .what = pick the delivered-at date for a parsed mail
 * .why = the Date header is the SENDER's claim of when they sent it. it is absent
 *        OR malformed on bad mail, so fall back to the time ses wrote the object
 *        into s3 — our own record of receipt, always present and always truthful.
 *
 * .note = a malformed Date header parses to an Invalid Date OBJECT, not null, so
 *         `?? receivedAt` alone would NOT catch it. its `getTime()` is NaN, every
 *         `--since` comparison against NaN is false, so the mail would vanish from
 *         every range query with no log and no count (rule.forbid.failhide). guard
 *         the NaN case explicitly, exactly as the gmail adapter guards internalDate.
 *
 * .note = the epoch is deliberately NOT the fallback. a mail dated 1970 sorts below
 *         every `--since` bound, so it would vanish the same silent way.
 */
export const getDeliveredAtFromParsed = (input: {
  parsed: ParsedMail;
  receivedAt: Date;
}): Date => {
  const claimed = input.parsed.date;
  if (!claimed) return input.receivedAt;
  if (Number.isNaN(claimed.getTime())) return input.receivedAt;
  return claimed;
};

/**
 * .what = convert a parsed rfc822 mail into a GatheredMail domain object
 * .why = decouple the domain from the rfc822 shape; apply security obfuscation
 *
 * .note = rfc822 has no native concept of labels, so `labels` is always empty for
 *         ses. gmail's labels are a gmail feature, not a mail feature.
 */
export const getGatheredMailFromSes = (input: {
  parsed: ParsedMail;
  exid: string;
  receivedAt: Date;
  ceiverAddress: string;
}): GatheredMail => {
  const { parsed, exid, receivedAt, ceiverAddress } = input;

  const subject = parsed.subject ?? '';
  const body = getBodyFromParsed({ parsed });
  const snippet = getSnippetFromBody({ body });
  const senderAddress = getSenderAddressFromParsed({ parsed });

  // check if content is security sensitive
  const isSecuritySensitive = getIsSecuritySensitive({
    subject,
    snippet,
    body,
  });

  // apply obfuscation if security sensitive — the rule is shared with every other mechanism,
  // so that no adapter can drift from it (`getMailContentVisible`)
  const visible = getMailContentVisible({
    subject,
    snippet,
    body,
    isSecuritySensitive,
  });

  return new GatheredMail({
    exid,
    ceiver: new GatheredMailRepo({
      mechanism: 'ses',
      address: ceiverAddress,
    }),
    sender: new GatherContactRef({
      mechanism: 'ses',
      address: senderAddress,
    }),
    subject: visible.subject,
    snippet: visible.snippet,
    body: visible.body,
    deliveredAt: getDeliveredAtFromParsed({ parsed, receivedAt }),
    // rfc822 has no labels — a gmail-only concept
    labels: [],
    attachments: getAttachmentNamesFromParsed({ parsed }),
    isObfuscated: isSecuritySensitive,
  });
};
