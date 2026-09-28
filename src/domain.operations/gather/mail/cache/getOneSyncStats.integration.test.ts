import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { given, then, when } from 'test-fns';

import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { getOneSyncStats } from './getOneSyncStats';
import { upsertSyncStats } from './upsertSyncStats';

describe('getOneSyncStats', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-sync-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] no sync stats exist', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'nosync@gmail.com',
    });

    when('[t0] getOneSyncStats is called', () => {
      then('returns default stats', async () => {
        const stats = await getOneSyncStats({ repo, cwd: testDir });

        expect(stats.mailFoundUptil).toBeNull();
        expect(stats.mailFoundQuant).toBe(0);
        expect(stats.mailSyncedQuant).toBe(0);
      });
    });
  });

  given('[case2] sync stats are cached', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'synced@gmail.com',
    });

    beforeAll(async () => {
      const stats = new GatheredMailSyncStats({
        mailFoundUptil: new Date('2024-01-15T12:00:00Z'),
        mailFoundQuant: 42,
        mailSyncedQuant: 10,
      });
      await upsertSyncStats({ stats, repo, cwd: testDir });
    });

    when('[t0] getOneSyncStats is called', () => {
      then('returns cached stats', async () => {
        const stats = await getOneSyncStats({ repo, cwd: testDir });

        expect(stats.mailFoundUptil).toEqual(new Date('2024-01-15T12:00:00Z'));
        expect(stats.mailFoundQuant).toBe(42);
        expect(stats.mailSyncedQuant).toBe(10);
      });
    });
  });
});
