import {
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getError, given, then, useBeforeAll, when } from 'test-fns';

import { getAllMailFromSes } from './getAllMailFromSes';

const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const RAW_MAIL = [
  'From: alice@example.com',
  'To: jelly@one.nheuron.com',
  'Subject: hello',
  'Date: Mon, 01 Sep 2026 12:00:00 +0000',
  '',
  'body text',
].join('\r\n');

/**
 * .what = a fake s3 that lists three fixed keys and records which bodies were asked for
 * .why = the whole claim under test is about a call that must NOT happen, and a call that
 *   does not happen leaves no trace in a return value. so the fake records the GetObject
 *   keys, which is the only place the skip is observable.
 */
const getFakeS3 = (): { s3: S3Client; keysRead: string[] } => {
  const keysRead: string[] = [];

  const s3 = {
    send: async (command: unknown) => {
      if (command instanceof ListObjectsV2Command)
        return {
          Contents: [
            { Key: 'inbound/mail-a', LastModified: new Date('2026-09-01') },
            { Key: 'inbound/mail-b', LastModified: new Date('2026-09-02') },
            { Key: 'inbound/mail-c', LastModified: new Date('2026-09-03') },
          ],
          IsTruncated: false,
        };

      if (command instanceof GetObjectCommand) {
        keysRead.push(command.input.Key as string);
        return {
          Body: { transformToString: async () => RAW_MAIL },
        };
      }

      throw new Error('fake s3 received an unexpected command');
    },
  } as unknown as S3Client;

  return { s3, keysRead };
};

/**
 * .what = a fake s3 whose prefix holds `pageQuant` pages of one key each
 * .why = the cap's whole claim is about a walk that must STOP, and a walk that stops
 *   leaves no trace in a return value when the bucket is small. so the fake pages a
 *   fixed number of times and records how many list calls it served, which is the only
 *   place the stop is observable.
 */
const getFakePagedS3 = (input: {
  pageQuant: number;
}): { s3: S3Client; listQuant: () => number } => {
  let listsServed = 0;

  const s3 = {
    send: async (command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        listsServed += 1;
        return {
          Contents: [
            {
              Key: `inbound/mail-${listsServed}`,
              LastModified: new Date('2026-09-01'),
            },
          ],
          IsTruncated: listsServed < input.pageQuant,
          NextContinuationToken:
            listsServed < input.pageQuant ? `token-${listsServed}` : undefined,
        };
      }

      if (command instanceof GetObjectCommand)
        return { Body: { transformToString: async () => RAW_MAIL } };

      throw new Error('fake s3 received an unexpected command');
    },
  } as unknown as S3Client;

  return { s3, listQuant: () => listsServed };
};

/**
 * .what = clamps that a key the caller already holds costs NO GetObject
 * .why = every run once re-read every object under the inbound prefix, even ones already in
 *   the cache. the prefix accumulates forever, so that waste was O(mailbox) per run and rose
 *   without bound — and it only shows up once a mailbox is busy, which is the worst moment
 *   to find it (`rule.forbid.behavior-hazards`).
 *
 * .note = the two-phase shape is what makes this possible: ListObjectsV2 names every key for
 *   one request, so a held key costs approximately none to name and a whole body read to
 *   fetch. these cases clamp that the skip lands BETWEEN the phases.
 */
describe('getAllMailFromSes', () => {
  given('[case1] three mails in the bucket, none held', () => {
    const scene = useBeforeAll(async () => {
      const fake = getFakeS3();
      const result = await getAllMailFromSes(
        {
          bucket: 'b',
          prefix: 'inbound/',
          s3: fake.s3,
          keysKnown: [],
        },
        { log },
      );
      return { keysRead: fake.keysRead, mailQuant: result.mails.length };
    });

    when('[t0] read with an empty known-set', () => {
      then('every body is read — an empty set never means skip all', () => {
        expect(scene.keysRead).toHaveLength(3);
      });

      then('every mail comes back parsed', () => {
        expect(scene.mailQuant).toEqual(3);
      });
    });
  });

  given('[case2] two of the three already held', () => {
    const scene = useBeforeAll(async () => {
      const fake = getFakeS3();
      const result = await getAllMailFromSes(
        {
          bucket: 'b',
          prefix: 'inbound/',
          s3: fake.s3,
          keysKnown: ['inbound/mail-a', 'inbound/mail-c'],
        },
        { log },
      );
      return { keysRead: fake.keysRead, mailQuant: result.mails.length };
    });

    when('[t0] read', () => {
      then('ONLY the unheld key is fetched', () => {
        // ⚠️ the teeth. drop the filter and this reads 3 — a defect that costs real money
        // and real latency, and that no return value would ever expose
        expect(scene.keysRead).toEqual(['inbound/mail-b']);
      });

      then('the result holds only what was newly read', () => {
        // the held mails are absent HERE by design; the orchestrator unions them back in
        // from the cache, which is what keeps the skip free of output cost
        expect(scene.mailQuant).toEqual(1);
      });
    });
  });

  given('[case3] every key already held', () => {
    const scene = useBeforeAll(async () => {
      const fake = getFakeS3();
      const result = await getAllMailFromSes(
        {
          bucket: 'b',
          prefix: 'inbound/',
          s3: fake.s3,
          keysKnown: ['inbound/mail-a', 'inbound/mail-b', 'inbound/mail-c'],
        },
        { log },
      );
      return { keysRead: fake.keysRead, mailQuant: result.mails.length };
    });

    when('[t0] read', () => {
      then('not one body is fetched', () => {
        expect(scene.keysRead).toEqual([]);
      });

      then('it returns an empty set rather than throw', () => {
        // a fully-cached mailbox is the STEADY state, not an error — this is what every
        // re-run looks like once the mailbox stops growth
        expect(scene.mailQuant).toEqual(0);
      });
    });
  });

  given('[case4] a held key that is not in the bucket', () => {
    const scene = useBeforeAll(async () => {
      const fake = getFakeS3();
      await getAllMailFromSes(
        {
          bucket: 'b',
          prefix: 'inbound/',
          s3: fake.s3,
          keysKnown: ['inbound/mail-gone'],
        },
        { log },
      );
      return { keysRead: fake.keysRead };
    });

    when('[t0] read', () => {
      then('it changes what is fetched not at all', () => {
        // the known-set is a SUBTRACTION, never a selection — a stale entry in the cache
        // must not suppress or summon any key the bucket actually holds
        expect(scene.keysRead).toHaveLength(3);
      });
    });
  });

  /**
   * .what = clamps that the page walk REFUSES past its cap rather than truncates
   * .why = ⚠️ s3 has no server-side date filter, so `--since` cannot narrow this walk the
   *   way gmail's `after:` narrows its own. an uncapped walk lists, reads, and parses every
   *   object under the prefix — and the prefix accumulates forever, so the cost is
   *   unbounded in time, memory, and s3 spend on a mailbox nobody prunes.
   *
   * .note = the pair is one claim, so both halves are pinned. a cap that refuses but also
   *   swallows, or one that stops but returns the partial set, would each satisfy half of
   *   this and fail the guarantee (`rule.forbid.failhide`).
   */
  given('[case5] a mailbox that pages right up to the cap', () => {
    const scene = useBeforeAll(async () => {
      const fake = getFakePagedS3({ pageQuant: 200 });
      const result = await getAllMailFromSes(
        { bucket: 'b', prefix: 'inbound/', s3: fake.s3, keysKnown: [] },
        { log },
      );
      return { mailQuant: result.mails.length, listQuant: fake.listQuant() };
    });

    when('[t0] read', () => {
      then('the walk completes — the cap is a max, never a min', () => {
        expect(scene.listQuant).toEqual(200);
      });

      then('every mail on every page comes back', () => {
        expect(scene.mailQuant).toEqual(200);
      });
    });
  });

  given('[case6] a mailbox that pages ONE past the cap', () => {
    const scene = useBeforeAll(async () => {
      const fake = getFakePagedS3({ pageQuant: 201 });
      const error = await getError(() =>
        getAllMailFromSes(
          { bucket: 'b', prefix: 'inbound/', s3: fake.s3, keysKnown: [] },
          { log },
        ),
      );
      return { message: error.message, listQuant: fake.listQuant() };
    });

    when('[t0] read', () => {
      then('it throws rather than return a partial mailbox', () => {
        // ⚠️ the teeth. drop the cap and this resolves with 201 mails and no error —
        // which is exactly the shape of a silent truncation on a mailbox 100× larger
        expect(scene.message).toContain('exceeds the page walk limit');
      });

      then(
        'it refuses BEFORE the page past the cap, never spends on it',
        () => {
          // exactly 200 lists reach s3; the 201st refuses before the request goes out.
          // ⚠️ this is the half that makes the cap a real bound rather than a late
          // complaint — a check placed after the send would have spent the call first
          expect(scene.listQuant).toEqual(200);
        },
      );
    });
  });
});
