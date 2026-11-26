import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { upsertCachedMail } from './upsertCachedMail';

/**
 * .what = write multiple mails to cache (idempotent)
 * .why = persist mails for fast local access; batch operation
 *
 * .note = the writes are SEQUENTIAL on purpose, not by oversight.
 *
 *   the ses read right beside this one caps its s3 fan-out deliberately, and an unexplained
 *   serial loop next to a justified concurrency cap reads as an omission — a reader cannot
 *   tell a decision from a gap. so: these are local `fs.writeFile` calls into one directory.
 *   a parallel fan-out here would trade a bounded local-disk cost for an unbounded open-file
 *   count, which is the hazard the s3 cap exists to avoid rather than a win over it.
 *
 *   the volume is bounded by the fetch page (`--limit`, default 500), so the serial cost is
 *   bounded too. revisit only if a page grows past what one directory write can absorb.
 */
export const upsertCachedMails = async (input: {
  mails: GatheredMail[];
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<void> => {
  for (const mail of input.mails) {
    await upsertCachedMail({ mail, repo: input.repo, cwd: input.cwd });
  }
};
