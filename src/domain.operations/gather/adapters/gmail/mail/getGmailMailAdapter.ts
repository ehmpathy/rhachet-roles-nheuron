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
import { getAllGatheredMailFromGmail } from './getAllGatheredMailFromGmail';
import { getAllMailFromGmail } from './getAllMailFromGmail';

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

      // walk every gmail page of the query, since gmail pages by cursor, not by date
      const mails = await getAllGatheredMailFromGmail(
        {
          accessToken,
          query,
          limit: input.page.limit,
          ceiverAddress: repo.address,
        },
        { log, getAllMailFromGmail },
      );

      // compute stats from all mails
      const stats = getSyncStatsFromMails({ mails });

      // no next page: all mails within date range were fetched
      return { mails, stats, page: null };
    },
  };
};
