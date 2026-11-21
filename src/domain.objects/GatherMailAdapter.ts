import type { PaginationInput } from 'pagination-fns';

import type { GatheredMail } from './GatheredMail';
import type { GatheredMailMechanism } from './GatheredMailMechanism';
import type { GatheredMailRepo } from './GatheredMailRepo';
import type { GatheredMailSyncStats } from './GatheredMailSyncStats';
import type { GatherLogMethods } from './GatherLogMethods';

/**
 * .what = adapter contract for mechanism-specific mail operations
 * .why = enables future slack/phone adapters via same dispatcher
 */
/**
 * .what = a filter a caller asked for — a mechanism-native search plus a label scope
 * .why = named once, since two adapter members take the same shape
 */
export interface GatherMailFilter {
  /** a mechanism-native search expression, if the human gave one */
  query: string | null;
  /** the labels parsed from an `address/labels=a,b` scope; empty when unscoped */
  labels: string[];
}

export interface GatherMailAdapter {
  mechanism: GatheredMailMechanism;

  /**
   * .what = why this mechanism cannot honor the given filter, or null when it can
   * .why = a filter a mechanism cannot serve is a CALLER error, and it is true no matter
   *   what credentials are present. so the refusal must be answerable BEFORE the auth
   *   check — otherwise an unauthenticated human who typed an unservable flag is told
   *   "not authenticated: run keyrack unlock", and goes and fixes a credential that was
   *   never the problem. that is an error which names a fix that cannot fix it, which is
   *   worse than an error with no hint (`rule.require.errors-name-the-fix`).
   *
   * .note = PURE, by contract. it reads no env, opens no client, and makes no call — which
   *   is what lets the orchestrator consult it before it has authenticated a caller.
   */
  getFilterRefusal: (input: { filter: GatherMailFilter }) => {
    what: string;
    why: string;
    hint: string;
  } | null;

  /**
   * .what = fetch the mail in a repo, narrowed by the page range and the caller's filter
   *
   * .note = `filter` is NOT optional, and every adapter must either HONOR it or REFUSE it
   *   loudly. it was once parsed at the cli and then dropped on the floor: a human who ran
   *   `gather.mail --query "from:boss@co.com"` got exit 0 and their whole mailbox back, with
   *   the filter silently ignored — a success that lied (`rule.forbid.surprises`). so the
   *   filter rides the contract, where an adapter cannot quietly forget it.
   */
  getAllMail: (
    input: {
      in: {
        repo: GatheredMailRepo;
        filter: GatherMailFilter;
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
       * .note = a HINT, never a contract about the result. an adapter may ignore it (gmail
       *   does — its api returns whole messages, so there is no per-mail read to skip), and
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
