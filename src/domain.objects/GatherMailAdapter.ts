import type { PaginationInput } from 'pagination-fns';

import type { GatheredMail } from './GatheredMail';
import type { GatheredMailMechanism } from './GatheredMailMechanism';
import type { GatheredMailRepo } from './GatheredMailRepo';
import type { GatheredMailSyncStats } from './GatheredMailSyncStats';
import type { GatherLogMethods } from './GatherLogMethods';

/**
 * .what = adapter contract for mechanism-specific mail operations
 * .why = one dispatcher routes `--from` to the adapter that owns that mechanism
 */
export interface GatherMailAdapter {
  mechanism: GatheredMailMechanism;

  /**
   * .what = fetch the mail in a repo, narrowed by the page range
   */
  getAllMail: (
    input: {
      in: {
        repo: GatheredMailRepo;
      };
      page: PaginationInput<{ deliveredAt: Date }>;
      /**
       * the exids the caller already holds, so a mechanism whose fetch is per-mail may
       * skip what it has.
       *
       * .why = ses lists s3 keys first and reads each body second, so a key already in the
       *   cache costs a whole GetObject for a mail already on disk. the inbound prefix
       *   accumulates forever, so that waste is O(mailbox) on EVERY run and only shows up
       *   once the mailbox is busy — the load-dependent shape that hides until the worst
       *   moment (`rule.forbid.behavior-hazards`).
       *
       * .note = a HINT, never a contract about the result. an adapter may ignore it, and
       *   one that honors it still returns the same mails it would have. it narrows what is
       *   FETCHED, never what is REPORTED — the caller merges with its own cache after.
       */
      exidsKnown: string[];
    },
    context: { log: GatherLogMethods; accessToken: string },
  ) => Promise<{
    mails: GatheredMail[];
    stats: GatheredMailSyncStats;
    page: PaginationInput<{ deliveredAt: Date }> | null;
  }>;
}
