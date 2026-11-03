/**
 * .what = strip CR/LF from a header value
 * .why = a newline in a header value would inject additional headers into the
 *        message — the mail equivalent of an injection attack. so any caller
 *        input that lands in a header is flattened first.
 */
export const asSafeHeaderValue = (input: { value: string }): string =>
  input.value.replace(/[\r\n]+/g, ' ').trim();
