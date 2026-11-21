import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { given, then, when } from 'test-fns';

import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getOneGatherAccessToken } from './getOneGatherAccessToken';
import { upsertGatherAccessToken } from './upsertGatherAccessToken';

describe('upsertGatherAccessToken', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-token-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] a token to store', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'test@gmail.com',
    });

    const expiresAt = new Date('2024-01-15T12:00:00Z');

    when('[t0] upsertGatherAccessToken is called', () => {
      then('creates token file', async () => {
        await upsertGatherAccessToken({
          repo,
          accessToken: 'access_123',
          refreshToken: 'refresh_456',
          expiresAt,
          cwd: testDir,
        });

        const token = await getOneGatherAccessToken({ repo, cwd: testDir });
        expect(token).not.toBeNull();
        expect(token!.accessToken).toBe('access_123');
        expect(token!.refreshToken).toBe('refresh_456');
        expect(token!.expiresAt).toEqual(expiresAt);
      });
    });

    when('[t1] upsertGatherAccessToken is called again (idempotent)', () => {
      then('overwrites with new token', async () => {
        const newExpiresAt = new Date('2024-01-20T12:00:00Z');

        await upsertGatherAccessToken({
          repo,
          accessToken: 'access_789',
          refreshToken: 'refresh_012',
          expiresAt: newExpiresAt,
          cwd: testDir,
        });

        const token = await getOneGatherAccessToken({ repo, cwd: testDir });
        expect(token!.accessToken).toBe('access_789');
        expect(token!.refreshToken).toBe('refresh_012');
        expect(token!.expiresAt).toEqual(newExpiresAt);
      });
    });
  });
});
