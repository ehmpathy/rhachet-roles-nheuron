import * as fs from 'fs/promises';
import { BadRequestError } from 'helpful-errors';
import * as path from 'path';

import { GatherContactRef } from '@src/domain.objects/GatherContactRef';
import { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import { isGatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getAllInBoundedBatches } from '../getAllInBoundedBatches';
import { getAllCachedMailFilenames } from './getAllCachedMailFilenames';
import { getCacheDir } from './getCacheDir';

/**
 * .what = how many cached mail bodies may be read at once
 * .why = ⚠️ this is the read mirror of `upsertCachedMails`, whose own note forbids exactly
 *   the unbounded shape this once had: "a parallel fan-out here would trade a bounded
 *   local-disk cost for an unbounded open-file count." the write was guarded and the read
 *   was not, which made the two halves of one cache disagree about the same hazard.
 *
 *   the cost is not hypothetical. every BARE run reads the whole cache back to report its
 *   range (`setMailsFromAdapter`), so an unbounded `Promise.all` opens one file handle per
 *   mail the mailbox has EVER held — and the cache accumulates forever. that exhausts the
 *   process's file-descriptor limit (`EMFILE`), and it does so only once a mailbox is busy,
 *   which is the worst moment to find it (`rule.forbid.behavior-hazards`).
 *
 * .note = 16 matches `SES_MAIL_READ_CONCURRENCY` deliberately. the two are unrelated
 *   resources — one is a local fd, one is an s3 connection — but a reader who meets both
 *   should not have to work out whether the difference carries a meaning. it does not.
 */
const CACHED_MAIL_READ_CONCURRENCY = 16;

/**
 * .what = read all cached mails for a repo
 * .why = fast local access to prior mail
 *
 * .note = this is the one cache reader that parses BODIES; its two neighbors
 *   (`getAllCachedMailExids`, `getCachedMailQuant`) answer from filenames alone. reach for
 *   one of those when the question does not need a body — they cost one directory read.
 */
export const getAllCachedMails = async (input: {
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<GatheredMail[]> => {
  const cacheDir = getCacheDir({ repo: input.repo, cwd: input.cwd });
  const mailsDir = path.join(cacheDir, 'mails');

  const mailFiles = await getAllCachedMailFilenames({ cacheDir });

  // read each body in BOUNDED batches — the same walk the ses body read uses, and for the
  // same reason (see `CACHED_MAIL_READ_CONCURRENCY`)
  return getAllInBoundedBatches({
    queued: mailFiles,
    bound: CACHED_MAIL_READ_CONCURRENCY,
    read: (file) => getOneCachedMail({ mailsDir, file }),
  });
};

/**
 * .what = read + parse one cached mail file back into its domain object
 * .why = the per-file read, lifted out of the batch walk so the walk reads as the loop it is
 */
const getOneCachedMail = async (input: {
  mailsDir: string;
  file: string;
}): Promise<GatheredMail> => {
  const filePath = path.join(input.mailsDir, input.file);
  const content = await fs.readFile(filePath, 'utf-8');

  // ⚠️ the parse is a real boundary, not a formality. `upsertCachedMail` writes with a bare
  // `fs.writeFile`, so a crash mid-write leaves a TRUNCATED file — and a bare `JSON.parse`
  // then throws a raw `SyntaxError: Unexpected end of JSON input` that names neither the
  // corrupt file nor the fix, so a human must hunt it among thousands by hand. the peer
  // token reader (`getOneGatherAccessToken`) already guards exactly this, in a comment that
  // says a raw SyntaxError names no fix; the same class sat unguarded here, in the one cache
  // every bare run reads (`rule.require.errors-name-the-fix`).
  //
  // .note = the as-cast below stays for the plain-scalar fields. the SHAPE is still trusted —
  //   this codebase wrote it — but the fields whose corruption is silent rather than loud are
  //   checked by name: `deliveredAt` (an invalid date drops the mail), and the `mechanism` of
  //   each repo (a drifted mechanism routes to no adapter), as the token reader guards its own
  //   `mechanism`. what is no longer trusted is that the bytes parse at all.
  const data = (() => {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      return BadRequestError.throw('a cached mail is not valid json', {
        cause: error instanceof Error ? error : undefined,
        file: input.file,
        why: 'a crash mid-write leaves a truncated cache file',
        hint: `delete the cache file and re-gather: ${filePath}`,
      });
    }
  })();

  // ⚠️ the delivery time is checked, never trusted — the one field whose corruption is
  // SILENT. every other cast here degrades to `undefined`, which surfaces as an empty
  // subject or an absent sender a human notices at once. but an absent or non-string
  // `deliveredAt` makes `new Date(...)` an Invalid Date, which does NOT throw: it sorts
  // unpredictably and compares false against every `--since` bound, so the mail vanishes
  // from every range query with no error to point at.
  //
  // this is the same guard its two producers already carry —
  // `getGatheredMailFromGmail`'s `internalDate` check and `getGatheredMailFromSes`'s
  // `parsed.date ?? receivedAt` fallback. the cache is the third boundary the same value
  // crosses, and it feeds `getMailsWithinRange` on EVERY bare run
  // (`rule.forbid.behavior-hazards`).
  //
  // it THROWS rather than drop the mail. its filename-level peer `getAllCachedMailExids`
  // drops an undecodable name, because a name we cannot read names no mail we hold — but a
  // body we cannot read IS a mail we hold, so to drop it would remove a real mail from the
  // listing silently, which is the failhide this exists to prevent.
  const deliveredAt = new Date(data.deliveredAt as string);
  if (Number.isNaN(deliveredAt.getTime()))
    BadRequestError.throw('a cached mail has an unreadable deliveredAt', {
      file: input.file,
      deliveredAt: data.deliveredAt ?? null,
      why: 'an invalid delivery time mis-sorts the mail and drops it from every --since range',
      hint: `delete the cache file and re-gather: ${filePath}`,
    });

  // ⚠️ the mechanism is checked, never cast. a bare `as GatheredMailMechanism` on a drifted
  // cache file would carry a non-domain term (say a renamed or removed mechanism) into a
  // GatheredMail, where no adapter routes it and no error points at the file. the peer token
  // reader (`getOneGatherAccessToken`) guards its own `mechanism` for the same reason — a
  // value read from a file decides which adapter handles it, so an unknown one must refuse
  // LOUDLY and name the file to re-gather (`rule.require.failloud`).
  const getCachedMechanism = (repo: {
    raw: unknown;
    field: 'ceiver' | 'sender';
  }): GatheredMailMechanism => {
    const mechanism = (repo.raw as { mechanism?: unknown } | null)?.mechanism;
    if (typeof mechanism !== 'string' || !isGatheredMailMechanism(mechanism))
      return BadRequestError.throw(
        `a cached mail has an unknown ${repo.field} mechanism`,
        {
          file: input.file,
          mechanism: mechanism ?? null,
          why: 'a drifted cache file names a mechanism no adapter can route',
          hint: `delete the cache file and re-gather: ${filePath}`,
        },
      );
    return mechanism;
  };

  // reconstruct domain objects (plain-scalar casts are safe per note above; the
  // mechanism of each repo is validated, not cast)
  return new GatheredMail({
    exid: data.exid as string,
    ceiver: new GatheredMailRepo({
      mechanism: getCachedMechanism({ raw: data.ceiver, field: 'ceiver' }),
      address: (data.ceiver as { address: string }).address,
    }),
    sender: new GatherContactRef({
      mechanism: getCachedMechanism({ raw: data.sender, field: 'sender' }),
      address: (data.sender as { address: string }).address,
    }),
    subject: data.subject as string,
    snippet: data.snippet as string,
    body: data.body as string | null,
    deliveredAt,
    labels: data.labels as string[],
    attachments: data.attachments as string[],
    isObfuscated: data.isObfuscated as boolean,
  });
};
