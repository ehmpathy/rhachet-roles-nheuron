import { UnexpectedCodePathError } from 'helpful-errors';

import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import type { GmailMessage } from './getGatheredMailFromGmail';

/**
 * .what = extract json body from a batch response part
 * .why = pure transformer for batch part parse
 */
const getJsonFromBatchPart = (input: {
  part: string;
}): {
  json: GmailMessage | { error: { code: number; message: string } };
} | null => {
  const jsonMatch = input.part.match(/\r?\n\r?\n(\{[\s\S]*\})/);
  if (!jsonMatch?.[1]) return null;

  // note: as-cast at external boundary (gmail batch api response)
  // gmail messages.get returns GmailMessage or error object per api docs
  const json = (() => {
    try {
      return JSON.parse(jsonMatch[1]) as
        | GmailMessage
        | { error: { code: number; message: string } };
    } catch (error: any) {
      throw new UnexpectedCodePathError('gmail batch part parse failed', {
        cause: error,
        partSnippet: jsonMatch[1].slice(0, 200),
        hint: 'json in batch response part was malformed',
      });
    }
  })();

  return { json };
};

/**
 * .what = every mail carried by one gmail multipart/mixed batch response
 * .why = gmail answers a batch fetch as one `multipart/mixed` document rather than as json,
 *   so the mails must be split out of it before any of them exists as a domain value. this
 *   split is where a mail can be LOST, which is why it lives in its own module rather than
 *   inside the fetch that calls it.
 *
 * ⚠️ .why here = the invariant is "no legitimate part is dropped", and that is observable
 *   only against a response body — which no unit test can obtain from a real gmail without
 *   a mock of a remote boundary. inline in the fetch, the defect below was unreachable by
 *   any test; extracted, it is a plain string-in / mails-out function and its clamp is
 *   trivial. same trade as `genOncePerCall` and `getAllInBoundedBatches`: extracted on
 *   TESTABILITY at one caller, against `rule.prefer.wet-over-dry`'s usual count, and the
 *   cardinality is stated here rather than hidden.
 *
 * .note = a per-item 404 is DROPPED on purpose — gmail returns it when a message was deleted
 *   between the list and the get, which is a real and expected race, not a defect. every
 *   other per-item error throws.
 */
export const getAllMessagesFromBatchResponse = (input: {
  responseText: string;
  log: GatherLogMethods;
}): GmailMessage[] => {
  const { responseText, log } = input;

  // extract boundary from response
  const boundaryMatch = responseText.match(/--batch_[^\r\n]+/);
  if (!boundaryMatch) {
    throw new UnexpectedCodePathError('batch response has no boundary', {
      preview: responseText.slice(0, 200),
    });
  }

  const boundary = boundaryMatch[0];

  // ⚠️ THE TERMINAL DELIMITER IS MATCHED EXACTLY, never by a search for `--` anywhere.
  //   this once read `!p.includes('--')`, meant to discard the `--` that trails the final
  //   boundary. but it discarded ANY part whose text held those two characters at all — and
  //   a mail's own json carries them readily: a subject like `draft -- v2`, a nested MIME
  //   boundary, a signature rule, a header with a double hyphen. such a mail was dropped
  //   BEFORE it was ever parsed, so it vanished from the fetch with no error and no log, and
  //   the run exited 0 to report a mailbox it had silently truncated. that is
  //   input-dependent, intermittent data loss — the worst class, because the mails it eats
  //   are exactly the ones nobody thinks to look for (`rule.forbid.failhide`).
  const parts = responseText
    .split(boundary)
    .filter((part) => part.trim().length > 0 && part.trim() !== '--');

  // parse parts via flatMap (immutable accumulation)
  return parts.flatMap((part): GmailMessage[] => {
    const parsed = getJsonFromBatchPart({ part });
    if (!parsed) return [];

    const { json } = parsed;

    // handle gmail api errors per item
    if ('error' in json) {
      // 404 = message deleted between list and get; expected, log and skip
      if (json.error.code === 404) {
        log.debug('gmail batch item: message not found (deleted?)', {
          error: json.error,
        });
        return [];
      }

      // other errors are unexpected; failloud
      throw new UnexpectedCodePathError('gmail batch item error', {
        errorCode: json.error.code,
        errorMessage: json.error.message,
        hint: 'non-404 error from gmail api in batch fetch',
      });
    }

    return [json];
  });
};
