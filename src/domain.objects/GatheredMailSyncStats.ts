import { DomainLiteral } from 'domain-objects';

/**
 * .what = sync progress and statistics
 * .why = tracks position in mailbox for incremental sync
 */
export interface GatheredMailSyncStats {
  /**
   * the whole-mailbox high-water mark: every mail up to here has been seen.
   *
   * ⚠️ only a bare run may set this. a filtered run saw every mail up to T *that matched*,
   * which is not the mailbox's high-water mark — see `getIsScopeWholeMailbox`.
   */
  mailFoundUptil: Date | null;

  /**
   * CUMULATIVE — how many mails the cache holds for this address, in total.
   *
   * read fresh from the cache on each run rather than accumulated, so a re-run over the
   * same range converges instead of double-counts.
   */
  mailFoundQuant: number;

  /**
   * PER-RUN — how many mails THIS invocation fetched.
   *
   * a delta, never a total. it is the one field here that does not describe the cache.
   */
  mailSyncedQuant: number;
}

export class GatheredMailSyncStats
  extends DomainLiteral<GatheredMailSyncStats>
  implements GatheredMailSyncStats {}
