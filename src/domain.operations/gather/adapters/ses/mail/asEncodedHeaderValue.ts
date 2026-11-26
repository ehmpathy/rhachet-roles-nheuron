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
