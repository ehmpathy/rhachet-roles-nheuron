import type { ParsedMail } from 'mailparser';

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
