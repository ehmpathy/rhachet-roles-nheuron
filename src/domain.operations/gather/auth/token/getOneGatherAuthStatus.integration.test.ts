import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { given, then, when } from 'test-fns';

import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getOneGatherAuthStatus } from './getOneGatherAuthStatus';
import { upsertGatherAccessToken } from './upsertGatherAccessToken';

describe('getOneGatherAuthStatus', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-auth-status-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] no token exists', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'anon@gmail.com',
    });

    when('[t0] getOneGatherAuthStatus is called', () => {
      then('returns anonymous', async () => {
        const status = await getOneGatherAuthStatus({ repo, cwd: testDir });
        expect(status).toBe('anonymous');
      });
    });
  });

  given('[case2] valid non-expired token exists', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'valid@gmail.com',
    });

    // set expiry far in the future
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    beforeAll(async () => {
      await upsertGatherAccessToken({
        repo,
        accessToken: 'valid_access',
        refreshToken: 'valid_refresh',
        expiresAt: futureExpiry,
        cwd: testDir,
      });
    });

    when('[t0] getOneGatherAuthStatus is called', () => {
      then('returns authenticated', async () => {
        const status = await getOneGatherAuthStatus({ repo, cwd: testDir });
        expect(status).toBe('authenticated');
      });
    });
  });

  given('[case3] expired token exists', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'expired@gmail.com',
    });

    // set expiry in the past
    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    beforeAll(async () => {
      await upsertGatherAccessToken({
        repo,
        accessToken: 'expired_access',
        refreshToken: 'expired_refresh',
        expiresAt: pastExpiry,
        cwd: testDir,
      });
    });

    when('[t0] getOneGatherAuthStatus is called', () => {
      then('returns expired', async () => {
        const status = await getOneGatherAuthStatus({ repo, cwd: testDir });
        expect(status).toBe('expired');
      });
    });
  });
});
