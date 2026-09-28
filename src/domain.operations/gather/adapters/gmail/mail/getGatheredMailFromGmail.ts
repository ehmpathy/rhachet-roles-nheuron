import { BadRequestError } from 'helpful-errors';

import { GatherContactRef } from '@src/domain.objects/GatherContactRef';
import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { getIsSecuritySensitive } from '@src/domain.operations/gather/mail/transformers/getIsSecuritySensitive';
import { getMailContentVisible } from '@src/domain.operations/gather/mail/transformers/getMailContentVisible';

/**
 * .what = gmail api message shape (subset we use)
 * .why = type the minimal fields we need from gmail api response
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    mimeType: string;
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      filename?: string;
      body?: { data?: string; size: number };
      parts?: Array<{
        mimeType: string;
        body?: { data?: string; size: number };
      }>;
    }>;
  };
}

/**
 * .what = extract header value by name from gmail headers array
 * .why = gmail api returns headers as array of {name, value} objects
 */
const getHeaderValue = (
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | null => {
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? null;
};

/**
 * .what = extract email address from "Name <email>" or raw email format
 * .why = gmail From header may include display name; we need bare address
 */
const asSenderAddress = (input: { senderRaw: string }): string => {
  const { senderRaw } = input;

  // try to match "Name <email@example.com>" format
  const bracketMatch = senderRaw.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1];

  // try to match bare email (first non-whitespace token)
  const bareMatch = senderRaw.match(/\S+/);
  if (bareMatch?.[0]) return bareMatch[0];

  // fallback to raw string if no patterns match
  return senderRaw;
};

/**
 * .what = decode base64url encoded body content
 * .why = gmail api uses url-safe base64 encode for body data
 */
const decodeBase64Url = (data: string): string => {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
};

/**
 * .what = extract body text from gmail message payload
 * .why = body can be in different locations based on mime structure
 */
const getBodyText = (payload: GmailMessage['payload']): string | null => {
  // check direct body (plain text emails)
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // check parts for multipart emails
  if (payload.parts) {
    // prefer text/plain
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }

    // fall back to text/html
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return decodeBase64Url(htmlPart.body.data);
    }

    // check nested parts (multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      if (part.parts) {
        const nestedText = part.parts.find((p) => p.mimeType === 'text/plain');
        if (nestedText?.body?.data) {
          return decodeBase64Url(nestedText.body.data);
        }
      }
    }
  }

  return null;
};

/**
 * .what = extract attachment filenames from gmail message
 * .why = attachments are in parts with filename property
 */
const getAttachmentNames = (payload: GmailMessage['payload']): string[] => {
  if (!payload.parts) return [];

  return payload.parts
    .filter((part) => part.filename && part.filename.length > 0)
    .map((part) => part.filename!);
};

/**
 * .what = convert gmail api message to GatheredMail domain object
 * .why = decouple domain from gmail api shape; apply security obfuscation
 */
export const getGatheredMailFromGmail = (input: {
  gmailMessage: GmailMessage;
  ceiverAddress: string;
}): GatheredMail => {
  const { gmailMessage, ceiverAddress } = input;
  const headers = gmailMessage.payload.headers;

  const subject = getHeaderValue(headers, 'Subject') ?? '';
  const senderRaw = getHeaderValue(headers, 'From') ?? '';
  const body = getBodyText(gmailMessage.payload);

  // extract sender email from "Name <email@example.com>" format
  const senderAddress = asSenderAddress({ senderRaw });

  // check if content is security sensitive
  const isSecuritySensitive = getIsSecuritySensitive({
    subject,
    snippet: gmailMessage.snippet,
    body,
  });

  // apply obfuscation if security sensitive — the rule is shared with every other mechanism,
  // so that no adapter can drift from it (`getMailContentVisible`)
  const visible = getMailContentVisible({
    subject,
    snippet: gmailMessage.snippet,
    body,
    isSecuritySensitive,
  });

  // ⚠️ the delivery time is checked, never trusted. gmail's `internalDate` is a
  // millisecond epoch as a STRING, so an absent or non-numeric one makes parseInt yield
  // NaN and `new Date(NaN)` an Invalid Date. that date does not throw — it sorts
  // unpredictably and compares false against every `--since` bound, so the mail would
  // vanish from every range query with no error to point at. its ses peer
  // `getGatheredMailFromSes` guards the same field for the same reason
  // (rule.forbid.behavior-hazards)
  const deliveredAtMs = parseInt(gmailMessage.internalDate, 10);
  if (Number.isNaN(deliveredAtMs))
    BadRequestError.throw('gmail message has an unreadable internalDate', {
      exid: gmailMessage.id,
      internalDate: gmailMessage.internalDate,
      why: 'an invalid delivery time mis-sorts the mail and drops it from every --since range',
      hint: 'gmail should always return internalDate as a millisecond epoch string; re-run the fetch, and report it if it recurs',
    });

  return new GatheredMail({
    exid: gmailMessage.id,
    ceiver: new GatheredMailRepo({
      mechanism: 'gmail',
      address: ceiverAddress,
    }),
    sender: new GatherContactRef({
      mechanism: 'gmail',
      address: senderAddress,
    }),
    subject: visible.subject,
    snippet: visible.snippet,
    body: visible.body,
    deliveredAt: new Date(deliveredAtMs),
    labels: gmailMessage.labelIds ?? [],
    attachments: getAttachmentNames(gmailMessage.payload),
    isObfuscated: isSecuritySensitive,
  });
};
