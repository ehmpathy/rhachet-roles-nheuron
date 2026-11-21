import type { ParsedMail } from 'mailparser';

import { GatherContactRef } from '@src/domain.objects/GatherContactRef';
import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { getIsSecuritySensitive } from '@src/domain.operations/gather/mail/transformers/getIsSecuritySensitive';
import { getMailContentVisible } from '@src/domain.operations/gather/mail/transformers/getMailContentVisible';

import { getAttachmentNamesFromParsed } from './getAttachmentNamesFromParsed';
import { getBodyFromParsed } from './getBodyFromParsed';
import { getDeliveredAtFromParsed } from './getDeliveredAtFromParsed';
import { getSenderAddressFromParsed } from './getSenderAddressFromParsed';
import { getSnippetFromBody } from './getSnippetFromBody';

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
