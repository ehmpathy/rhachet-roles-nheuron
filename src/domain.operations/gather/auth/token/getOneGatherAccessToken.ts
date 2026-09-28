import * as fs from 'fs/promises';
import { BadRequestError } from 'helpful-errors';
import * as path from 'path';

import { GatherAccessToken } from '@src/domain.objects/GatherAccessToken';
import {
  isGatheredMailMechanism,
  VALID_MECHANISMS,
} from '@src/domain.objects/GatheredMailMechanism';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getTokenCacheDir } from './getTokenCacheDir';

/**
 * .what = fetch stored token from cache
 * .why = retrieve persisted oauth tokens for mechanism + address
 */
export const getOneGatherAccessToken = async (input: {
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<GatherAccessToken | null> => {
  const tokenDir = getTokenCacheDir({ cwd: input.cwd });
  const tokenPath = path.join(
    tokenDir,
    `mechanism=${input.repo.mechanism}`,
    `address=${input.repo.address}.json`,
  );

  // read and parse token (catch ENOENT directly to avoid TOCTOU race)
  const content = await (async () => {
    try {
      return await fs.readFile(tokenPath, 'utf-8');
    } catch (error: any) {
      // only handle ENOENT (file not found); rethrow real errors
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  })();
  if (content === null) return null;

  // parse the cache. a torn write (a crash mid-`writeFile`) leaves a truncated file, so
  // the parse is a real boundary rather than a formality — and a raw SyntaxError names
  // no fix (rule.require.errors-name-the-fix)
  const parsed = (() => {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return BadRequestError.throw('token cache is not valid json', {
        tokenPath,
        why: 'a crash mid-write leaves a truncated file',
        hint: `delete it and re-run: gather.auth --from ${input.repo.mechanism}`,
      });
    }
  })();

  // ⚠️ THE EXPIRY IS THE LOAD-BEARING FIELD, so it is checked rather than trusted.
  // `new Date(undefined)` and `new Date('garbage')` both yield an Invalid Date, whose
  // getTime() is NaN — and EVERY comparison against NaN is false, so `getIsTokenExpired`
  // would have answered "not expired" and the status would have read `authenticated`.
  // the caller then walks into the gmail api with a dead token and gets a 401 it has no
  // hint for, instead of the re-auth line it needed (rule.forbid.failhide)
  const expiresAt = new Date(String(parsed.expiresAt));
  if (Number.isNaN(expiresAt.getTime()))
    BadRequestError.throw('token cache has an unreadable expiry', {
      tokenPath,
      expiresAt: parsed.expiresAt,
      why: 'an unreadable expiry compares false against every time, so the token would read as valid forever',
      hint: `delete it and re-run: gather.auth --from ${input.repo.mechanism}`,
    });

  // ⚠️ THE MECHANISM IS CHECKED FOR THE SAME REASON THE EXPIRY IS — it decides which api
  // this token is then carried to. a `String(parsed.mechanism)` cast would have let any text
  // in the file become a domain term, so a hand-edited or half-written cache could hand
  // gmail's adapter a token minted for ses. the cache is a plain file on disk; it is a
  // boundary, and every field a caller acts on gets checked at it (`rule.require.shapefit`)
  const mechanism = String(parsed.mechanism);
  if (!isGatheredMailMechanism(mechanism))
    BadRequestError.throw('token cache names an unknown mechanism', {
      tokenPath,
      mechanism: parsed.mechanism,
      validMechanisms: VALID_MECHANISMS,
      why: 'a token minted for one mechanism must never be carried to another',
      hint: `delete it and re-run: gather.auth --from ${input.repo.mechanism}`,
    });

  // ⚠️ THE FIELDS A CALLER ACTS ON ARE CHECKED, never taken on faith via `String(...)`.
  // a `String(parsed.accessToken)` on an ABSENT field yields the literal text `'undefined'`,
  // which the gmail adapter then presents as a bearer token — and gets a 401 the file's own
  // guards exist to prevent. this is the exact failhide the expiry + mechanism checks above
  // close; the three fields the caller carries to the api were the ones left un-checked. a
  // half-written flush that salvaged mechanism + expiry but not the token is a real torn-write
  // shape, not an exotic one (`rule.forbid.failhide`).
  for (const field of ['address', 'accessToken', 'refreshToken'] as const)
    if (typeof parsed[field] !== 'string' || parsed[field] === '')
      BadRequestError.throw(`token cache lacks ${field}`, {
        tokenPath,
        field,
        value: parsed[field] ?? null,
        why: 'an absent field would become the literal string "undefined" and fail at the api',
        hint: `delete it and re-run: gather.auth --from ${input.repo.mechanism}`,
      });

  return new GatherAccessToken({
    mechanism,
    address: String(parsed.address),
    accessToken: String(parsed.accessToken),
    refreshToken: String(parsed.refreshToken),
    expiresAt,
  });
};
