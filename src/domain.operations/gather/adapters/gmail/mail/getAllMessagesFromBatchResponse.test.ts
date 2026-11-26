import { given, then, when } from 'test-fns';

import { getAllMessagesFromBatchResponse } from './getAllMessagesFromBatchResponse';

const LOG = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * .what = one gmail multipart/mixed batch body, built from the message payloads given
 * .why = the real shape matters here — the boundary, the blank line before the json, and
 *   the final `--` marker are each load-bearing to the split under test
 */
const asBatchResponse = (input: {
  payloads: Record<string, unknown>[];
}): string => {
  const boundary = '--batch_abc123';
  const parts = input.payloads.map(
    (payload) =>
      `${boundary}\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n`,
  );
  return `${parts.join('')}${boundary}--\r\n`;
};

const asMessage = (input: { id: string; subject: string }) => ({
  id: input.id,
  threadId: `thread_${input.id}`,
  internalDate: '1754006400000',
  snippet: 'a snippet',
  labelIds: [],
  payload: {
    headers: [
      { name: 'Subject', value: input.subject },
      { name: 'From', value: 'sender@gmail.com' },
      { name: 'To', value: 'me@gmail.com' },
    ],
  },
});

describe('getAllMessagesFromBatchResponse', () => {
  given('[case1] an ordinary batch of two mails', () => {
    when('[t0] the response is split', () => {
      then('both mails come back', () => {
        const messages = getAllMessagesFromBatchResponse({
          responseText: asBatchResponse({
            payloads: [
              asMessage({ id: 'msg_1', subject: 'hello' }),
              asMessage({ id: 'msg_2', subject: 'goodbye' }),
            ],
          }),
          log: LOG,
        });

        expect(messages.map((message) => message.id)).toEqual([
          'msg_1',
          'msg_2',
        ]);
      });
    });
  });

  /**
   * .what = the clamp on silent, input-dependent mail loss
   * .why = ⚠️ the split once discarded any part whose text held `--` ANYWHERE, via
   *   `!p.includes('--')`. that predicate was meant for the final delimiter alone, but a
   *   mail's own json carries those two characters readily — a subject like `draft -- v2`, a
   *   nested MIME boundary, a signature rule. such a mail was dropped BEFORE the parse, so it
   *   vanished with no error, no log, and exit 0 (`rule.forbid.failhide`).
   *
   *   the loss was **input-dependent**, which is what makes it the worst class: it struck
   *   only some mails, only sometimes, and the run reported success either way. a human would
   *   catch it only by a noticed ABSENCE — which is the one thing humans reliably fail at.
   */
  given('[case2] a mail whose own subject contains a double hyphen', () => {
    when('[t0] the response is split', () => {
      then('it is NOT dropped — every mail survives', () => {
        const messages = getAllMessagesFromBatchResponse({
          responseText: asBatchResponse({
            payloads: [
              asMessage({ id: 'msg_clean', subject: 'hello' }),
              asMessage({ id: 'msg_hyphens', subject: 'draft -- v2' }),
            ],
          }),
          log: LOG,
        });

        // ⚠️ the teeth: under `!p.includes('--')` this returned ONE mail and reported success
        expect(messages).toHaveLength(2);
        expect(messages.map((message) => message.id)).toContain('msg_hyphens');
      });
    });
  });

  given('[case3] the final delimiter itself', () => {
    when('[t0] the response is split', () => {
      then('it is discarded — it is not a mail', () => {
        const messages = getAllMessagesFromBatchResponse({
          responseText: asBatchResponse({
            payloads: [asMessage({ id: 'msg_only', subject: 'hello' })],
          }),
          log: LOG,
        });

        // the delimiter must still go; the fix narrowed the filter, never removed it
        expect(messages).toHaveLength(1);
      });
    });
  });

  given('[case4] a per-item 404 — a mail deleted mid-fetch', () => {
    when('[t0] the response is split', () => {
      then('that item is dropped, and its peers still come back', () => {
        const messages = getAllMessagesFromBatchResponse({
          responseText: asBatchResponse({
            payloads: [
              asMessage({ id: 'msg_alive', subject: 'hello' }),
              { error: { code: 404, message: 'Not Found' } },
            ],
          }),
          log: LOG,
        });

        // a 404 here is a real race — the mail was deleted between the list and the get —
        // so it is expected, not a defect. every OTHER per-item error throws
        expect(messages.map((message) => message.id)).toEqual(['msg_alive']);
      });
    });
  });

  given('[case5] a per-item error that is NOT a 404', () => {
    when('[t0] the response is split', () => {
      then('it throws rather than quietly returns fewer mails', () => {
        expect(() =>
          getAllMessagesFromBatchResponse({
            responseText: asBatchResponse({
              payloads: [
                asMessage({ id: 'msg_alive', subject: 'hello' }),
                { error: { code: 500, message: 'Backend Error' } },
              ],
            }),
            log: LOG,
          }),
        ).toThrow('gmail batch item error');
      });
    });
  });
});
