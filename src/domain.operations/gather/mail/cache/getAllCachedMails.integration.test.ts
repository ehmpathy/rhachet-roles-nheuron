import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getError, given, then, when } from 'test-fns';

import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getAllCachedMails } from './getAllCachedMails';
import { getCacheDir } from './getCacheDir';
import { upsertCachedMail } from './upsertCachedMail';

describe('getAllCachedMails', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-cache-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] no cache exists', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'empty@gmail.com',
    });

    when('[t0] getAllCachedMails is called', () => {
      then('returns empty array', async () => {
        const mails = await getAllCachedMails({ repo, cwd: testDir });
        expect(mails).toEqual([]);
      });
    });
  });

  given('[case2] mails are cached', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'cached@gmail.com',
    });

    beforeAll(async () => {
      const mail1 = new GatheredMail({
        exid: 'msg_1',
        ceiver: repo,
        sender: new GatheredMailRepo({
          mechanism: 'gmail',
          address: 'a@gmail.com',
        }),
        subject: 'First',
        snippet: 'First snippet',
        body: null,
        deliveredAt: new Date('2024-01-01T10:00:00Z'),
        labels: [],
        attachments: [],
        isObfuscated: false,
      });
      const mail2 = new GatheredMail({
        exid: 'msg_2',
        ceiver: repo,
        sender: new GatheredMailRepo({
          mechanism: 'gmail',
          address: 'b@gmail.com',
        }),
        subject: 'Second',
        snippet: 'Second snippet',
        body: 'Body content',
        deliveredAt: new Date('2024-01-02T10:00:00Z'),
        labels: ['INBOX'],
        attachments: ['file.pdf'],
        isObfuscated: true,
      });

      await upsertCachedMail({ mail: mail1, repo, cwd: testDir });
      await upsertCachedMail({ mail: mail2, repo, cwd: testDir });
    });

    when('[t0] getAllCachedMails is called', () => {
      then('returns all cached mails', async () => {
        const mails = await getAllCachedMails({ repo, cwd: testDir });

        expect(mails).toHaveLength(2);
        expect(mails.map((m) => m.exid).sort()).toEqual(['msg_1', 'msg_2']);
      });

      then('reconstructs domain objects correctly', async () => {
        const mails = await getAllCachedMails({ repo, cwd: testDir });
        const mail2 = mails.find((m) => m.exid === 'msg_2')!;

        expect(mail2.subject).toBe('Second');
        expect(mail2.body).toBe('Body content');
        expect(mail2.labels).toEqual(['INBOX']);
        expect(mail2.attachments).toEqual(['file.pdf']);
        expect(mail2.isObfuscated).toBe(true);
        expect(mail2.deliveredAt).toEqual(new Date('2024-01-02T10:00:00Z'));
      });
    });
  });

  /**
   * .what = clamps that a cache file with an unreadable delivery time FAILS LOUD
   * .why = ⚠️ every other field in the cache degrades to `undefined`, which a human sees at
   *   once as an empty subject or an absent sender. `deliveredAt` does not: an absent or
   *   non-string value makes `new Date(...)` an Invalid Date, which throws NOT AT ALL — it
   *   sorts unpredictably and compares false against every `--since` bound, so the mail
   *   vanishes from every range query with no error to point at
   *   (`rule.forbid.failhide`).
   *
   *   the same value is guarded at both of its producers (`getGatheredMailFromGmail`'s
   *   `internalDate` check, `getGatheredMailFromSes`'s `parsed.date ?? receivedAt`). the
   *   cache is the third boundary it crosses, and the one read on EVERY bare run.
   *
   * .note = a file this cannot read reaches disk by schema drift, never by a torn write —
   *   a truncated write yields invalid json, which `JSON.parse` already throws on. so the
   *   probe writes VALID json with the field absent, which is what an older or newer
   *   format version actually looks like.
   */
  given('[case3] a cached file whose deliveredAt is absent', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'corrupt@gmail.com',
    });

    beforeAll(async () => {
      const mailsDir = path.join(getCacheDir({ repo, cwd: testDir }), 'mails');
      await fs.mkdir(mailsDir, { recursive: true });
      await fs.writeFile(
        path.join(mailsDir, 'mail.exid=msg_drift.json'),
        JSON.stringify({
          exid: 'msg_drift',
          ceiver: { mechanism: 'gmail', address: repo.address },
          sender: { mechanism: 'gmail', address: 'a@gmail.com' },
          subject: 'from a prior format',
          snippet: 'n',
          body: null,
          // deliveredAt absent — the drift this guards
          labels: [],
          attachments: [],
          isObfuscated: false,
        }),
        'utf-8',
      );
    });

    when('[t0] getAllCachedMails is called', () => {
      then('it throws rather than return an Invalid Date', async () => {
        // ⚠️ the teeth. drop the guard and this RESOLVES with one mail whose deliveredAt is
        // an Invalid Date — which then silently fails every range comparison downstream
        const error = await getError(() =>
          getAllCachedMails({ repo, cwd: testDir }),
        );
        expect(error.message).toContain('unreadable deliveredAt');
      });

      then('the error names the file, so the fix is actionable', async () => {
        const error = await getError(() =>
          getAllCachedMails({ repo, cwd: testDir }),
        );
        // an error that says "the cache is corrupt" with no path leaves a human to grep
        // their own home directory (`rule.require.errors-name-the-fix`)
        expect(error.message).toContain('msg_drift');
      });
    });
  });

  /**
   * .what = clamps that a TRUNCATED cache file fails with a fix, not a raw `SyntaxError`
   * .why = a crash or a full disk mid-write leaves a half-written json file behind, and the
   *   next bare run reads it. `JSON.parse` does throw there, so the failure was never
   *   silent — but what surfaced was v8's own
   *   `Unexpected end of JSON input`, which names no file, no cause, and no remedy. a human
   *   who hit it had a stack trace and a cache directory to search by hand
   *   (`rule.require.errors-name-the-fix`).
   *
   * ⚠️ .note = this is a DIFFERENT boundary than [case3] above, which is why both cases
   *   exist. [case3] writes VALID json whose shape drifted; this writes json that does not
   *   parse at all. the first is a schema fault, the second a torn write — they arrive by
   *   different accidents and the guard for one does not cover the other.
   */
  /**
   * .what = clamps that a cache file with an UNKNOWN mechanism fails loud
   * .why = ⚠️ the `mechanism` decides which adapter handles a mail. a cache file from an older
   *   or renamed format can carry a mechanism this build no longer knows — a bare cast would
   *   push that non-domain term into a GatheredMail, where no adapter routes it and no error
   *   points at the file. the peer token reader (`getOneGatherAccessToken`) guards its own
   *   `mechanism` for exactly this reason (`rule.require.failloud`).
   *
   * .note = like [case3], this writes VALID json whose shape drifted — an unknown mechanism
   *   is a schema fault, not a torn write. so `JSON.parse` succeeds and the mechanism guard,
   *   not the json guard, is what must fire.
   */
  given('[case5] a cached file with an unknown mechanism', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'drifted-mechanism@gmail.com',
    });

    beforeAll(async () => {
      const mailsDir = path.join(getCacheDir({ repo, cwd: testDir }), 'mails');
      await fs.mkdir(mailsDir, { recursive: true });
      await fs.writeFile(
        path.join(mailsDir, 'mail.exid=msg_badmech.json'),
        JSON.stringify({
          exid: 'msg_badmech',
          ceiver: { mechanism: 'gmail', address: repo.address },
          // sender carries a mechanism no adapter knows — the drift this guards
          sender: { mechanism: 'telepathy', address: 'a@nowhere.com' },
          subject: 'from a renamed mechanism',
          snippet: 'n',
          body: null,
          deliveredAt: '2024-01-01T10:00:00.000Z',
          labels: [],
          attachments: [],
          isObfuscated: false,
        }),
        'utf-8',
      );
    });

    when('[t0] getAllCachedMails is called', () => {
      then('it throws rather than carry a non-domain mechanism', async () => {
        // ⚠️ the teeth. revert the guard to a bare `as GatheredMailMechanism` and this
        // RESOLVES with one mail whose sender.mechanism is the literal 'telepathy'
        const error = await getError(() =>
          getAllCachedMails({ repo, cwd: testDir }),
        );
        expect(error.message).toContain('unknown sender mechanism');
      });

      then('the error names the file, so the fix is actionable', async () => {
        const error = await getError(() =>
          getAllCachedMails({ repo, cwd: testDir }),
        );
        expect(error.message).toContain('msg_badmech');
      });
    });
  });

  given('[case4] a cached file truncated by a crash mid-write', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'torn@gmail.com',
    });

    beforeAll(async () => {
      const mailsDir = path.join(getCacheDir({ repo, cwd: testDir }), 'mails');
      await fs.mkdir(mailsDir, { recursive: true });
      // a write cut off partway — the exact shape a crash leaves on disk
      await fs.writeFile(
        path.join(mailsDir, 'mail.exid=msg_torn.json'),
        '{"exid":"msg_torn","subject":"cut off here',
        'utf-8',
      );
    });

    when('[t0] getAllCachedMails is called', () => {
      then('it throws an error a human can act on', async () => {
        // ⚠️ the teeth. drop the guard and this rejects with v8's bare
        // `Unexpected end of JSON input` — a message with no file and no fix
        const error = await getError(() =>
          getAllCachedMails({ repo, cwd: testDir }),
        );
        expect(error.message).toContain('not valid json');
      });

      then('the error names the file and the remedy', async () => {
        const error = await getError(() =>
          getAllCachedMails({ repo, cwd: testDir }),
        );
        expect(error.message).toContain('msg_torn');
        expect(error.message).toContain('re-gather');
      });
    });
  });
});
