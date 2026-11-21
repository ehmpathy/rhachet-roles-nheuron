import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { given, then, when } from 'test-fns';

import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { getOneSyncStats } from './getOneSyncStats';
import { upsertSyncStats } from './upsertSyncStats';

describe('upsertSyncStats', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-setsync-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] sync stats to write', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'write@gmail.com',
    });

    const stats = new GatheredMailSyncStats({
      mailFoundUptil: new Date('2024-01-15T12:00:00Z'),
      mailFoundQuant: 100,
      mailSyncedQuant: 25,
    });

    when('[t0] upsertSyncStats is called', () => {
      then('creates sync file', async () => {
        await upsertSyncStats({ stats, repo, cwd: testDir });

        const readStats = await getOneSyncStats({ repo, cwd: testDir });
        expect(readStats.mailFoundQuant).toBe(100);
        expect(readStats.mailSyncedQuant).toBe(25);
      });
    });

    when('[t1] upsertSyncStats is called again (idempotent)', () => {
      then('overwrites with new stats', async () => {
        const newStats = new GatheredMailSyncStats({
          mailFoundUptil: new Date('2024-01-20T12:00:00Z'),
          mailFoundQuant: 150,
          mailSyncedQuant: 50,
        });

        await upsertSyncStats({ stats: newStats, repo, cwd: testDir });

        const readStats = await getOneSyncStats({ repo, cwd: testDir });
        expect(readStats.mailFoundQuant).toBe(150);
        expect(readStats.mailSyncedQuant).toBe(50);
      });
    });
  });
});
