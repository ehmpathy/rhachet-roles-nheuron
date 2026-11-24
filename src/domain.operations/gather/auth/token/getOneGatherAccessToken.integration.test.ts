import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getError, given, then, useThen, when } from 'test-fns';

import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getOneGatherAccessToken } from './getOneGatherAccessToken';
import { getTokenCacheDir } from './getTokenCacheDir';
import { upsertGatherAccessToken } from './upsertGatherAccessToken';

/**
 * .what = an error's message plus its metadata, as one searchable text
 * .why = the fix hint rides in the error's metadata, not its message
 */
const asErrorText = (input: { error: Error }): string =>
  `${input.error.message} ${JSON.stringify((input.error as { metadata?: unknown }).metadata ?? null)}`;

describe('getOneGatherAccessToken', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-token-get-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] no token exists', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'notoken@gmail.com',
    });

    when('[t0] getOneGatherAccessToken is called', () => {
      then('returns null', async () => {
        const token = await getOneGatherAccessToken({ repo, cwd: testDir });
        expect(token).toBeNull();
      });
    });
  });

  given('[case2] token is stored', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'hastoken@gmail.com',
    });

    const expiresAt = new Date('2024-01-15T12:00:00Z');

    beforeAll(async () => {
      await upsertGatherAccessToken({
        repo,
        accessToken: 'stored_access',
        refreshToken: 'stored_refresh',
        expiresAt,
        cwd: testDir,
      });
    });

    when('[t0] getOneGatherAccessToken is called', () => {
      // one disk read, shared below; held under a key, since a null read proxies as `{}`
      const scene = useThen('the read succeeds', async () => ({
        token: await getOneGatherAccessToken({ repo, cwd: testDir }),
      }));

      then('returns stored token', () => {
        expect(scene.token).not.toBeNull();
        expect(scene.token!.mechanism).toBe('gmail');
        expect(scene.token!.address).toBe('hastoken@gmail.com');
        expect(scene.token!.accessToken).toBe('stored_access');
        expect(scene.token!.refreshToken).toBe('stored_refresh');
      });

      then('reconstructs expiresAt as Date', () => {
        expect(scene.token!.expiresAt).toEqual(expiresAt);
        expect(scene.token!.expiresAt).toBeInstanceOf(Date);
      });
    });
  });

  /**
   * .what = the cache names a mechanism the domain does not know
   * .why = ⚠️ the mechanism decides WHICH API this token is then carried to, so it carries as
   *   much weight as the expiry beside it — and it was the one field the read-back took on
   *   trust, via a bare `String(parsed.mechanism)`. the cache is a plain file on disk; a
   *   hand-edit, a half-written flush, or a token minted by a future mechanism could all put
   *   text there that no adapter answers to. the value then flowed on as a domain term and
   *   surfaced far from here (`rule.require.shapefit`, `rule.forbid.failhide`).
   */
  given('[case3] the token cache names an unknown mechanism', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'badmechanism@gmail.com',
    });

    beforeAll(async () => {
      // write a token the normal path could not produce — the exact state a hand-edit or a
      // downgrade leaves behind
      // the location comes from the production transformer, never a re-typed path — a hand
      // written copy would drift and leave this clamp silently toothless, since a file the
      // reader never opens yields `null`, and a `null` refuses no one
      const tokenPath = path.join(
        getTokenCacheDir({ cwd: testDir }),
        'mechanism=gmail',
        'address=badmechanism@gmail.com.json',
      );
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(
        tokenPath,
        JSON.stringify({
          mechanism: 'carrierpigeon',
          address: 'badmechanism@gmail.com',
          accessToken: 'a',
          refreshToken: 'b',
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
        'utf-8',
      );
    });

    when('[t0] the token is read back', () => {
      // one disk read, shared below; held under a key, since a proxied Error drops its fields
      const scene = useThen('the read is refused', async () => ({
        error: await getError(getOneGatherAccessToken({ repo, cwd: testDir })),
      }));

      then('it REFUSES, rather than hands on an unknown term', () => {
        expect(scene.error.message).toContain(
          'token cache names an unknown mechanism',
        );
      });

      then('the refusal names the fix', () => {
        // a human who meets this needs the delete + re-auth line, not a bare rejection
        // (`rule.require.errors-name-the-fix`)
        expect(asErrorText({ error: scene.error })).toContain(
          'gather.auth --from gmail',
        );
      });
    });
  });

  /**
   * .what = the cache carries a valid mechanism + expiry but NO access token
   * .why = ⚠️ the read-back guarded `expiresAt` and `mechanism`, then took the three fields a
   *   caller ACTS on — address, accessToken, refreshToken — on faith via `String(...)`. an
   *   absent `accessToken` becomes the literal text `'undefined'`, which the gmail adapter
   *   presents as a bearer token and gets a 401 for — the exact failhide the two guards above
   *   close, on the field the caller actually spends. a half-written flush that salvaged the
   *   first two fields but not the token is a real torn-write shape (`rule.forbid.failhide`).
   */
  given('[case4] the token cache is valid but lacks an access token', () => {
    const repo = new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'notoken-field@gmail.com',
    });

    beforeAll(async () => {
      // the location comes from the production transformer, never a re-typed path — a hand
      // written copy would drift and leave this clamp toothless (the reader would find no file
      // and return null, and a null refuses no one)
      const tokenPath = path.join(
        getTokenCacheDir({ cwd: testDir }),
        'mechanism=gmail',
        'address=notoken-field@gmail.com.json',
      );
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(
        tokenPath,
        JSON.stringify({
          mechanism: 'gmail',
          address: 'notoken-field@gmail.com',
          // accessToken absent — the salvaged-first-two-fields shape
          refreshToken: 'b',
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
        'utf-8',
      );
    });

    when('[t0] the token is read back', () => {
      // one disk read, shared below; held under a key, since a proxied Error drops its fields
      const scene = useThen('the read is refused', async () => ({
        error: await getError(getOneGatherAccessToken({ repo, cwd: testDir })),
      }));

      then('it REFUSES rather than hand on the text "undefined"', () => {
        // ⚠️ the teeth: under the bare `String(parsed.accessToken)` this RESOLVED with a token
        // whose accessToken was the literal 'undefined'
        expect(scene.error.message).toContain('token cache lacks accessToken');
      });

      then('the refusal names the fix', () => {
        expect(asErrorText({ error: scene.error })).toContain(
          'gather.auth --from gmail',
        );
      });
    });
  });
});
