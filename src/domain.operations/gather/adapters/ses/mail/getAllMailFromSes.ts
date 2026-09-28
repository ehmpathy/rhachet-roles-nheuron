import {
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';
import { type ParsedMail, simpleParser } from 'mailparser';

import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import { getAllInBoundedBatches } from '@src/domain.operations/gather/mail/getAllInBoundedBatches';

import { getIsNoSuchBucketError } from './getIsNoSuchBucketError';

/**
 * .what = how many s3 GetObject calls may be in flight at once
 * .why = the inbound prefix grows without bound, so the read must NOT fan out one call
 *        per mail. 16 keeps the sdk's default connection pool (50) comfortably clear
 *        while it still reads a 1000-mail mailbox in ~63 batches rather than 1000 waits.
 */
const SES_MAIL_READ_CONCURRENCY = 16;

/**
 * .what = how many s3 list pages one walk may take before it refuses
 * .why = ⚠️ s3 offers NO server-side date filter, so `--since` cannot narrow this walk
 *   the way gmail's `after:` narrows its own (`asGmailQuery`). a cold sync of a large
 *   mailbox would otherwise list, read, and parse every object under the prefix with no
 *   ceiling on time, memory, or s3 request spend.
 *
 *   200 pages × 1000 keys = 200k mails, which is far past any clone's mailbox and still
 *   a bound. its gmail peer `GMAIL_MAX_PAGE_QUANT` holds the same number for the same
 *   reason, so the two mechanisms fail at the same scale rather than at two surprises.
 *
 * .note = the cap REFUSES rather than truncates. a silent partial result would report an
 *   incomplete mailbox as a complete one — the failure class this adapter exists to
 *   avoid (`rule.forbid.failhide`).
 */
const SES_MAX_PAGE_QUANT = 200;

/**
 * .what = one raw mail object read out of the inbound bucket
 * .why = pairs the parsed content with its s3 key, which is the mail's exid
 */
export interface SesMailObject {
  /**
   * the s3 object key — ses names each object by its message id, so this is a
   * stable, unique identifier for the mail
   */
  key: string;

  /**
   * when ses wrote the object into the bucket — our own record of receipt
   */
  receivedAt: Date;

  /**
   * the parsed rfc822 content
   */
  parsed: ParsedMail;
}

/**
 * .what = one mail object's key paired with the time ses wrote it
 * .why = the s3 write time is the only delivery time we can vouch for; the mail's
 *        own Date header is the sender's claim, and may be absent or forged
 */
export interface SesMailKey {
  key: string;
  receivedAt: Date;
}

/**
 * .what = list every mail object under a prefix, with its s3 write time
 * .why = s3 pages at 1000 keys; this walks every page so a caller sees them all.
 *        ListObjectsV2 already returns LastModified per object, so the receipt
 *        time rides along at no extra request.
 */
export const getAllMailKeysFromSes = async (
  input: { bucket: string; prefix: string; s3: S3Client },
  context: { log: GatherLogMethods },
): Promise<SesMailKey[]> => {
  const collectFrom = async (input2: {
    token: string | undefined;
    found: SesMailKey[];
    pageQuant: number;
  }): Promise<SesMailKey[]> => {
    // refuse past the cap, rather than return a partial mailbox as if it were whole
    if (input2.pageQuant > SES_MAX_PAGE_QUANT)
      BadRequestError.throw('ses mailbox exceeds the page walk limit', {
        bucket: input.bucket,
        prefix: input.prefix,
        pageQuant: input2.pageQuant,
        pageQuantMax: SES_MAX_PAGE_QUANT,
        keyQuantFound: input2.found.length,
        why: 's3 has no server-side date filter, so --since cannot narrow this walk; an uncapped walk would read and parse the whole prefix',
        hint: 'archive or prune the inbound prefix so the mailbox fits under the limit',
      });

    const response = await input.s3.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        ContinuationToken: input2.token,
      }),
    );

    // ses writes a zero-byte placeholder for the prefix itself; skip it, since it
    // is a directory marker rather than a mail. an object with no LastModified is
    // skipped too — without a receipt time we could not place it on the timeline,
    // and a guessed time would silently mis-sort it (rule.forbid.failhide)
    const keys = (response.Contents ?? [])
      .map((object) => ({ key: object.Key, receivedAt: object.LastModified }))
      .filter(
        (candidate): candidate is SesMailKey =>
          !!candidate.key &&
          !candidate.key.endsWith('/') &&
          !!candidate.receivedAt,
      );

    const found = [...input2.found, ...keys];

    context.log.debug('ses.getAllMailKeys: page', {
      pageQuant: input2.pageQuant,
      pageKeyQuant: keys.length,
      foundKeyQuant: found.length,
      truncated: response.IsTruncated ?? false,
    });

    if (!response.IsTruncated || !response.NextContinuationToken) return found;

    return collectFrom({
      token: response.NextContinuationToken,
      found,
      pageQuant: input2.pageQuant + 1,
    });
  };

  // an absent bucket means the mail wish was never applied — the one s3 fault whose
  // fix is an apply rather than a credential. the raw sdk error names only the bucket,
  // so it is re-thrown with the wish path a human must run. the catch allowlists ONLY
  // that code and rethrows every other error (rule.forbid.failhide)
  try {
    return await collectFrom({ token: undefined, found: [], pageQuant: 1 });
  } catch (error) {
    if (!getIsNoSuchBucketError({ error })) throw error;
    return BadRequestError.throw('ses inbound bucket does not exist', {
      bucket: input.bucket,
      prefix: input.prefix,
      hint: "the mail infra is not applied yet. run: npx declastruct apply --wish 'provision/aws.mail/account=prep/resources.mail.ts'",
    });
  }
};

/**
 * .what = read + parse one mail object from the inbound bucket
 * .why = ses stores raw rfc822 bytes; mailparser turns them into structured mail
 */
export const getOneMailFromSes = async (input: {
  bucket: string;
  key: string;
  receivedAt: Date;
  s3: S3Client;
}): Promise<SesMailObject> => {
  const response = await input.s3.send(
    new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
  );

  if (!response.Body)
    throw new UnexpectedCodePathError('s3 object has no body', {
      bucket: input.bucket,
      key: input.key,
      hint: 'the receipt rule should have written raw rfc822 bytes here',
    });

  const raw = await response.Body.transformToString('utf-8');
  const parsed = await simpleParser(raw);

  return { key: input.key, receivedAt: input.receivedAt, parsed };
};

/**
 * .what = read every mail object under a prefix in the inbound bucket, except those the
 *   caller already holds
 * .why = communicator handles raw s3 i/o; the adapter casts into the domain
 *
 * .note = the two-phase shape — list keys, then read bodies — is what makes the skip
 *   possible at all. ListObjectsV2 returns every key for one request regardless, so a key
 *   already held costs approximately none to name and a whole GetObject to read. the skip
 *   lands between the phases, where what it spares is the entire body read.
 */
export const getAllMailFromSes = async (
  input: {
    bucket: string;
    prefix: string;
    s3: S3Client;
    /**
     * s3 keys whose mail the caller already holds, so their bodies need no re-read.
     *
     * .note = an empty array means read every key — which is exactly a first run, or a run
     *   after a cleared cache. it is never a signal to skip the list.
     */
    keysKnown: string[];
  },
  context: { log: GatherLogMethods },
): Promise<{ mails: SesMailObject[] }> => {
  const { log } = context;

  log.debug('ses.getAllMail: list keys', {
    bucket: input.bucket,
    prefix: input.prefix,
  });

  const keysAll = await getAllMailKeysFromSes(input, context);

  // drop the keys we already hold, BEFORE any body is read. membership is checked through a
  // Set rather than `.includes` so the cost stays linear — an `.includes` per key would be
  // O(mailbox²), which is the very load-dependent shape this skip exists to remove
  const keysHeld = new Set(input.keysKnown);
  const keys = keysAll.filter((found) => !keysHeld.has(found.key));

  log.debug('ses.getAllMail: listed keys', {
    keyQuant: keysAll.length,
    keySkipQuant: keysAll.length - keys.length,
    keyReadQuant: keys.length,
  });

  // read each object in BOUNDED batches. s3 GetObject is per-key, so the reads fan out —
  // but not without a cap: the inbound prefix accumulates every mail the mailbox has ever
  // received, so one unbounded `Promise.all` over it would open thousands of simultaneous
  // GetObject calls after a few months of real traffic. that exhausts the sdk's connection
  // pool and trips the s3 request-rate limit, and the fault is load-dependent, so it
  // appears only once the mailbox is busy — the worst time to find it
  // (rule.forbid.behavior-hazards).
  //
  // the walk is shared with the cache body read, which guards the same shape over a local
  // fd rather than a connection — see `getAllInBoundedBatches` for the bound's own clamp.
  // order is preserved, which `getSortedMails` downstream leans on for a stable tie-break.
  const mails = await getAllInBoundedBatches({
    queued: keys,
    bound: SES_MAIL_READ_CONCURRENCY,
    read: (found) =>
      getOneMailFromSes({
        bucket: input.bucket,
        key: found.key,
        receivedAt: found.receivedAt,
        s3: input.s3,
      }),
  });

  log.debug('ses.getAllMail: complete', { mailQuant: mails.length });

  return { mails };
};
