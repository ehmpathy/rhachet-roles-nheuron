import { BadRequestError } from 'helpful-errors';
import { getError, given, then, useBeforeAll, when } from 'test-fns';

import {
  GMAIL_MAX_PAGE_QUANT,
  getAllGatheredMailFromGmail,
} from './getAllGatheredMailFromGmail';
import type { getAllMailFromGmail } from './getAllMailFromGmail';
import type { GmailMessage } from './getGatheredMailFromGmail';

const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * .what = factory for a minimal valid GmailMessage
 */
const asGmailMessage = (input: { id: string }): GmailMessage => ({
  id: input.id,
  threadId: `thread_${input.id}`,
  labelIds: ['INBOX'],
  snippet: 'hello',
  internalDate: '1705320000000',
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'Subject', value: 'hello' },
      { name: 'From', value: 'sender@example.com' },
    ],
    body: { data: Buffer.from('hello').toString('base64'), size: 5 },
  },
});

/**
 * .what = a fake page read that serves a fixed list of pages and records each cursor asked for
 * .why = the cap claim is about a request that must NOT be sent; only a record of the
 *   cursors asked for makes that observable
 */
const getFakePageRead = (input: {
  pages: Array<{ ids: string[]; nextPageToken: string | null }>;
}): { read: typeof getAllMailFromGmail; tokensRead: Array<string | null> } => {
  const tokensRead: Array<string | null> = [];
  const read: typeof getAllMailFromGmail = async (request) => {
    tokensRead.push(request.pageToken);
    const page = input.pages[tokensRead.length - 1];
    if (!page) throw new Error('fake page read asked past its last page');
    return {
      mails: page.ids.map((id) => asGmailMessage({ id })),
      nextPageToken: page.nextPageToken,
    };
  };
  return { read, tokensRead };
};

/**
 * .what = a fake page read that never ends — every page names a next one
 */
const getEndlessPageRead = (): {
  read: typeof getAllMailFromGmail;
  tokensRead: Array<string | null>;
} => {
  const tokensRead: Array<string | null> = [];
  const read: typeof getAllMailFromGmail = async (request) => {
    tokensRead.push(request.pageToken);
    return { mails: [], nextPageToken: `page_${tokensRead.length}` };
  };
  return { read, tokensRead };
};

const INPUT = {
  accessToken: 'token',
  query: null,
  limit: 500,
  ceiverAddress: 'me@gmail.com',
};

describe('getAllGatheredMailFromGmail', () => {
  given('[case1] a query that spans two pages', () => {
    when('[t0] the walk runs', () => {
      const fake = getFakePageRead({
        pages: [
          { ids: ['a', 'b'], nextPageToken: 'page_2' },
          { ids: ['c'], nextPageToken: null },
        ],
      });
      // wrapped in an object: useBeforeAll's deferred proxy does not forward array methods
      const result = useBeforeAll(async () => ({
        mails: await getAllGatheredMailFromGmail(INPUT, {
          log,
          getAllMailFromGmail: fake.read,
        }),
      }));

      then('it returns every mail from every page, in page order', () => {
        expect(result.mails.map((mail) => mail.exid)).toEqual(['a', 'b', 'c']);
      });

      then('it follows the cursor, then stops at the last page', () => {
        expect(fake.tokensRead).toEqual([null, 'page_2']);
      });
    });
  });

  given('[case2] a query whose pages never end', () => {
    when('[t0] the walk runs', () => {
      const fake = getEndlessPageRead();
      // wrapped in an object: useBeforeAll's deferred proxy would hide the error's class
      const result = useBeforeAll(async () => ({
        error: await getError(
          getAllGatheredMailFromGmail(INPUT, {
            log,
            getAllMailFromGmail: fake.read,
          }),
        ),
      }));

      then('it refuses with a caller-must-fix error (exit 2)', () => {
        expect(result.error).toBeInstanceOf(BadRequestError);
        expect(result.error.message).toContain(
          'gmail fetch exceeded its page cap',
        );
      });

      then('the refusal names the fix', () => {
        expect(result.error.message).toContain(
          'narrow the range: gather.mail --since <a more recent date>',
        );
      });

      then('it reads exactly the cap, and never a page past it', () => {
        expect(fake.tokensRead.length).toBe(GMAIL_MAX_PAGE_QUANT);
      });

      then('the refusal text is stable', () => {
        expect(result.error.message).toMatchSnapshot();
      });
    });
  });
});
