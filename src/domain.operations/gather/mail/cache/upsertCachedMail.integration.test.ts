import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { given, then, when } from 'test-fns';

import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getAllCachedMails } from './getAllCachedMails';
import { upsertCachedMail } from './upsertCachedMail';

describe('upsertCachedMail', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-cache-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] a mail to cache', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'test@gmail.com',
    });

    const mail = new GatheredMail({
      exid: 'msg_12345',
      ceiver: repo,
      sender: new GatheredMailRepo({
        mechanism: 'gmail',
        address: 'sender@gmail.com',
      }),
      subject: 'Test Subject',
      snippet: 'Test snippet',
      body: 'Full body',
      deliveredAt: new Date('2024-01-15T12:00:00Z'),
      labels: ['INBOX'],
      attachments: [],
      isObfuscated: false,
    });

    when('[t0] upsertCachedMail is called', () => {
      then('creates cache file', async () => {
        await upsertCachedMail({ mail, repo, cwd: testDir });

        const mails = await getAllCachedMails({ repo, cwd: testDir });
        expect(mails).toHaveLength(1);
        expect(mails[0]!.exid).toBe('msg_12345');
      });
    });
  });

  given('[case2] a mail whose exid carries a path separator', () => {
    // teeth: the ses adapter keys each mail by its s3 object key, and that key is
    // `<prefix>/<messageId>` — so every ses exid holds a `/`. an exid pasted straight
    // into a filename makes `path.join` build a NESTED path, whose parent the writer
    // never creates (ENOENT) and whose file a flat `readdir` never finds.
    // gmail exids hold no separator, so case1 above stays green either way.
    const repo = new GatheredMailRepo({
      mechanism: 'ses',
      address: 'jelly@one.nheuron.com',
    });

    const mail = new GatheredMail({
      exid: 'inbound/n2q8k4vd1p7r3m6s9t0u',
      ceiver: repo,
      sender: new GatheredMailRepo({
        mechanism: 'ses',
        address: 'alice@example.com',
      }),
      subject: 'Test Subject',
      snippet: 'Test snippet',
      body: 'Full body',
      deliveredAt: new Date('2026-09-01T12:00:00Z'),
      labels: [],
      attachments: [],
      isObfuscated: false,
    });

    when('[t0] upsertCachedMail is called', () => {
      then('the mail is written and read back whole', async () => {
        await upsertCachedMail({ mail, repo, cwd: testDir });

        const mails = await getAllCachedMails({ repo, cwd: testDir });
        expect(mails).toHaveLength(1);
        expect(mails[0]!.exid).toBe('inbound/n2q8k4vd1p7r3m6s9t0u');
      });
    });
  });
});
