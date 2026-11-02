import { BadRequestError } from 'helpful-errors';

import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import type { getAllMailFromGmail } from './getAllMailFromGmail';
import { getGatheredMailFromGmail } from './getGatheredMailFromGmail';

/**
 * .what = how many gmail pages one fetch may walk before it refuses
 * .why = a cursor walk over a mailbox has no natural end, so it needs one. at the
 *        default limit of 500 per page this covers 100k mails — far past any real
 *        `--since` window, so a run that reaches it has asked for the whole mailbox
 *        rather than a range, and should be told so rather than left to spin.
 */
export const GMAIL_MAX_PAGE_QUANT = 200;

/**
 * .what = walk every gmail page of one query, cast each message into the domain
 * .why = gmail paginates by cursor, not by date, so one fetch must walk the cursor to
 *        its end; the adapter then reads as fetch → narrow → stats
 *
 * .note = the page read arrives via context, so the walk and its cap are testable
 *         with no network (see getAllGatheredMailFromGmail.test.ts)
 */
export const getAllGatheredMailFromGmail = async (
  input: {
    accessToken: string;
    query: string | null;
    limit: number;
    ceiverAddress: string;
  },
  context: {
    log: GatherLogMethods;
    getAllMailFromGmail: typeof getAllMailFromGmail;
  },
): Promise<GatheredMail[]> => {
  // the walk threads its cursor and its accumulator through the recursion rather
  // than a `let` + `push`, so no half-built state is shared (rule.require.immutable-vars).
  // its ses peer `getAllMailKeysFromSes` walks s3 pages in exactly this shape.
  const collectFrom = async (walk: {
    token: string | null;
    found: GatheredMail[];
    pageQuant: number;
  }): Promise<GatheredMail[]> => {
    // ⚠️ the walk is BOUNDED, and refuses LOUDLY rather than truncate — a silent partial
    // result would read as a short mailbox (rule.forbid.failhide). the check runs
    // BEFORE the request, so no page past the cap is ever spent
    if (walk.pageQuant >= GMAIL_MAX_PAGE_QUANT)
      BadRequestError.throw('gmail fetch exceeded its page cap', {
        pageQuant: walk.pageQuant,
        pageCap: GMAIL_MAX_PAGE_QUANT,
        mailFoundQuant: walk.found.length,
        why: 'the requested range spans more mail than one fetch should walk in a single pass',
        hint: 'narrow the range: gather.mail --since <a more recent date>',
      });

    // read one page
    const result = await context.getAllMailFromGmail(
      {
        accessToken: input.accessToken,
        query: input.query,
        pageToken: walk.token,
        maxResults: input.limit,
      },
      { log: context.log },
    );

    // cast the page into the domain
    const mails = result.mails.map((gmailMessage) =>
      getGatheredMailFromGmail({
        gmailMessage,
        ceiverAddress: input.ceiverAddress,
      }),
    );
    const found = [...walk.found, ...mails];

    // stop at the last page
    if (!result.nextPageToken) return found;

    // continue to the next page
    context.log.debug('fetch next gmail page', { fetchedSoFar: found.length });
    return collectFrom({
      token: result.nextPageToken,
      found,
      pageQuant: walk.pageQuant + 1,
    });
  };

  return collectFrom({ token: null, found: [], pageQuant: 0 });
};
