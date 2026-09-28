import { BadRequestError } from 'helpful-errors';
import type { PaginationInput } from 'pagination-fns';

import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import type {
  GatherMailAdapter,
  GatherMailFilter,
} from '@src/domain.objects/GatherMailAdapter';
import { getSyncStatsFromMails } from '@src/domain.operations/gather/mail/transformers/getSyncStatsFromMails';

import { asGmailQuery } from './asGmailQuery';
import { getAllMailFromGmail } from './getAllMailFromGmail';
import { getGatheredMailFromGmail } from './getGatheredMailFromGmail';

/**
 * .what = how many gmail pages one fetch may walk before it refuses
 * .why = a cursor walk over a mailbox has no natural end, so it needs one. at the
 *        default limit of 500 per page this covers 100k mails — far past any real
 *        `--since` window, so a run that reaches it has asked for the whole mailbox
 *        rather than a range, and should be told so rather than left to spin.
 */
const GMAIL_MAX_PAGE_QUANT = 200;

/**
 * .what = gmail adapter for GatherMailAdapter interface
 * .why = enables gather.mail --from gmail via adapter pattern
 */
export const getGmailMailAdapter = (_context: {
  cwd: string | null;
}): GatherMailAdapter => {
  return {
    mechanism: 'gmail',

    // gmail HONORS both halves — `asGmailQuery` composes the `--query` and the `/labels=`
    // scope into the one `q` expression gmail's search takes, so there is naught to refuse
    getFilterRefusal: () => null,

    getAllMail: async (
      input: {
        in: {
          repo: GatheredMailRepo;
          filter: GatherMailFilter;
        };
        page: PaginationInput<{ deliveredAt: Date }>;
        /**
         * ⚠️ gmail IGNORES this, deliberately. the skip it offers is per-mail, and gmail
         * has no per-mail read to skip: `users.messages.list` + `get` returns whole
         * messages for the query, so a known id costs the same whether it is asked for or
         * not. ses is the mechanism it pays off for, since ses reads each body from s3
         * with its own request.
         *
         * .note = it is taken and unused rather than absent, because the contract declares
         *   it a hint every adapter may decline — see `GatherMailAdapter`.
         */
        exidsKnown: string[];
      },
      adapterContext: { log: GatherLogMethods; accessToken: string },
    ): Promise<{
      mails: GatheredMail[];
      stats: GatheredMailSyncStats;
      page: PaginationInput<{ deliveredAt: Date }> | null;
    }> => {
      const { repo, filter } = input.in;
      const { log, accessToken } = adapterContext;

      // build query from the page date range AND the caller's filter
      const query = asGmailQuery({ page: input.page, filter });

      // gmail uses cursor-based pagination; walk every page, since our
      // PaginationInput date-range does not map to a gmail pageToken.
      //
      // the walk threads its cursor and its accumulator through the recursion rather
      // than a `let` + `push`. a mutable accumulator in an awaited loop is shared state
      // that a concurrent or retried call can observe half-built, and the order it
      // yields is implicit (`rule.require.immutable-vars`). its ses peer
      // `getAllMailKeysFromSes` walks s3 pages in exactly this shape.
      const collectFrom = async (input2: {
        token: string | null;
        found: GatheredMail[];
        pageQuant: number;
      }): Promise<GatheredMail[]> => {
        // ⚠️ the walk is BOUNDED. a cursor loop over a whole mailbox has no natural end,
        // so an over-broad `--since` on a large mailbox would fetch forever with no
        // signal but a terminal that never returns. the cap refuses LOUDLY rather than
        // truncate — a silent partial result would be the worse failure, since the
        // caller could not tell a short mailbox from a capped one
        // (rule.forbid.behavior-hazards, rule.forbid.failhide)
        if (input2.pageQuant >= GMAIL_MAX_PAGE_QUANT)
          BadRequestError.throw('gmail fetch exceeded its page cap', {
            pageQuant: input2.pageQuant,
            pageCap: GMAIL_MAX_PAGE_QUANT,
            mailFoundQuant: input2.found.length,
            why: 'the requested range spans more mail than one fetch should walk in a single pass',
            hint: 'narrow the range: gather.mail --since <a more recent date>',
          });

        const result = await getAllMailFromGmail(
          {
            accessToken,
            query,
            pageToken: input2.token,
            maxResults: input.page.limit,
          },
          { log },
        );

        const mails = result.mails.map((gmailMessage) =>
          getGatheredMailFromGmail({
            gmailMessage,
            ceiverAddress: repo.address,
          }),
        );

        const found = [...input2.found, ...mails];

        if (!result.nextPageToken) return found;

        // log progress for large fetches
        log.debug('fetch next gmail page', { fetchedSoFar: found.length });

        return collectFrom({
          token: result.nextPageToken,
          found,
          pageQuant: input2.pageQuant + 1,
        });
      };

      const allMails = await collectFrom({
        token: null,
        found: [],
        pageQuant: 0,
      });

      // compute stats from all mails
      const stats = getSyncStatsFromMails({ mails: allMails });

      // no next page: all mails within date range were fetched
      return { mails: allMails, stats, page: null };
    },
  };
};
