import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';

import type { GatherAuthAdapter } from '@src/domain.objects/GatherAuthAdapter';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import { getOneGatherAccessToken } from '@src/domain.operations/gather/auth/token/getOneGatherAccessToken';
import { getOneGatherAuthStatus } from '@src/domain.operations/gather/auth/token/getOneGatherAuthStatus';
import { upsertGatherAccessToken } from '@src/domain.operations/gather/auth/token/upsertGatherAccessToken';
import { getAuthFixHintForMechanism } from '@src/domain.operations/gather/auth/transformers/getAuthFixHintForMechanism';

import { fetchWithTimeout } from '../fetchWithTimeout';
import { asGoogleTokenResponse } from './asGoogleTokenResponse';
import { asServiceAccountCredentials } from './asServiceAccountCredentials';
import { getExpiresAtFromTokenResponse } from './getExpiresAtFromTokenResponse';
import { getGmailServiceAccountCredentials } from './getGmailServiceAccountCredentials';
import { getServiceAccountAccessToken } from './getServiceAccountAccessToken';

/**
 * .what = pure factory: returns gmail auth adapter instance
 * .why = enables polymorphic dispatch via getAuthAdapterForMechanism
 *
 * .note = gmail has TWO auth mechanisms and this adapter owns both. a service account
 *   (ci/automation) takes precedence; absent one, the interactive oauth token cache is
 *   read. BOTH `getAuthStatus` and `getAccessToken` consult the service account, and they
 *   must stay in step — a status that reports `anonymous` while `getAccessToken` mints a
 *   real token would make `gather.auth` and `gather.mail` disagree about the same env.
 */
export const getGmailAuthAdapter = (context: {
  cwd: string | null;
}): GatherAuthAdapter => {
  return {
    mechanism: 'gmail',

    /**
     * .what = check current auth state for gmail address
     */
    getAuthStatus: async (
      input: { repo: GatheredMailRepo | null },
      _adapterContext: { log: GatherLogMethods },
    ) => {
      // a service account authenticates on its own — it needs no repo and no cached token,
      // so it is answered before both. it never expires from our side either: each call
      // mints a fresh jwt, so `authenticated` is the only honest status here.
      //
      // ⚠️ THE CREDENTIAL IS VALIDATED, never merely counted. this once returned
      //   `authenticated` on bare PRESENCE of the two env keys — so a human who filled them
      //   with a wrong value (a truncated paste, an oauth client json) was told
      //   `status: authenticated`, and the very next `gather.mail` threw
      //   `service account json parse failed` at the mint. two commands, one env, two
      //   answers — and the one the human asked first was the one that lied
      //   (`rule.forbid.failhide`).
      //
      //   it runs the SAME `asServiceAccountCredentials` the mint runs, so the two cannot
      //   drift. a malformed credential now throws HERE, at the moment the human asked the
      //   question, with the fix named rather than a false green.
      const serviceAccount = getGmailServiceAccountCredentials();
      if (serviceAccount) {
        asServiceAccountCredentials({
          json: serviceAccount.serviceAccountJson,
        });
        return 'authenticated';
      }

      // if no repo provided, cannot check status
      if (!input.repo) return 'anonymous';

      return getOneGatherAuthStatus({
        repo: input.repo,
        cwd: context.cwd,
      });
    },

    /**
     * .what = there is no interactive auth flow to run for gmail
     * .why = the service account IS the auth path here. it is the only one this codebase
     *   can complete on its own: the oauth token cache is written by `genAuthRefresh`
     *   alone, and that needs a token already present, so no code path seeds it. an
     *   interactive grant would have to land a first token from a browser redirect, and
     *   this repo runs no server to receive one.
     *
     * .note = this once threw "oauth flow not yet implemented — this will be implemented
     *   in genGmailAuth orchestrator". that named a FIX THE HUMAN COULD NOT TAKE and a
     *   file that does not exist, while a fix that works today went unmentioned. an error
     *   that misdirects is worse than one with no hint, because the human spends real time
     *   on the wrong repair (`rule.require.errors-name-the-fix`).
     */
    genAuth: async (
      _input: Record<string, never>,
      _adapterContext: { log: GatherLogMethods },
    ) => {
      BadRequestError.throw('gmail has no interactive auth flow', {
        why: 'gmail authenticates here via a google service account with domain-wide delegation, never a browser grant',
        expected: [
          'GMAIL_SERVICE_ACCOUNT_JSON',
          'GMAIL_SERVICE_ACCOUNT_SUBJECT',
        ],
        hint: 'fill both, then unlock: rhx keyrack fill --owner ehmpath --env test && rhx keyrack unlock --owner ehmpath --env test (setup guide: howto.create-gmail-service-account)',
      });
    },

    /**
     * .what = refresh expired gmail token
     * .note = uses google oauth token refresh endpoint
     */
    genAuthRefresh: async (
      input: { repo: GatheredMailRepo },
      adapterContext: { log: GatherLogMethods },
    ) => {
      // fetch stored refresh token
      const token = await getOneGatherAccessToken({
        repo: input.repo,
        cwd: context.cwd,
      });

      // ⚠️ the hint comes from the SHARED source, never a hand-typed line. both throws in
      //   this operation once read `run gather.auth to re-authenticate` — a command that
      //   cannot re-authenticate anyone here, because `genAuth` twenty lines above throws
      //   `gmail has no interactive auth flow`. the file contradicted itself, and the human
      //   who followed the hint was bounced through that refusal before they could reach
      //   the fix that works (`rule.require.errors-name-the-fix`).
      //
      //   ⚠️ this is the SAME defect `getAuthFixHintForMechanism` was written to close, in
      //   two call sites the fix did not reach. that is the durable lesson: to correct one
      //   copy of a duplicated string leaves every other copy exactly as wrong as it was,
      //   and the extraction only pays once every caller actually delegates to it.
      if (!token?.refreshToken) {
        throw BadRequestError.throw('no refresh token found', {
          address: input.repo.address,
          hint: getAuthFixHintForMechanism({ mechanism: 'gmail' }),
        });
      }

      // guard: fail-fast if credentials not configured.
      // these read from `process.env` only because keyrack put them there — both are
      // declared under `env.test` in `.agent/keyrack.yml`, so the hint names the unlock
      // rather than a hand-export. a hint that says "set these env vars" would teach the
      // one habit `rule.require.credentials-from-keyrack` forbids.
      const clientId = process.env.GATHER_GMAIL_CLIENT_ID;
      const clientSecret = process.env.GATHER_GMAIL_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw BadRequestError.throw('gmail oauth credentials not configured', {
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret,
          expected: ['GATHER_GMAIL_CLIENT_ID', 'GATHER_GMAIL_CLIENT_SECRET'],
          hint: 'run: rhx keyrack unlock --owner ehmpath --env test (fill them first via `rhx keyrack fill --owner ehmpath --env test`)',
        });
      }

      // call google token refresh endpoint
      adapterContext.log.debug('gmail token refresh', {
        address: input.repo.address,
      });

      const response = await fetchWithTimeout({
        url: 'https://oauth2.googleapis.com/token',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        },
        what: 'gmail token refresh',
      });

      if (!response.ok) {
        const error = await response.text();
        throw BadRequestError.throw('token refresh failed', {
          address: input.repo.address,
          status: response.status,
          error,
          hint: getAuthFixHintForMechanism({ mechanism: 'gmail' }),
        });
      }

      // parse response via transformer (handles validation at external boundary)
      const json = await (async () => {
        try {
          return await response.json();
        } catch (error: any) {
          throw new UnexpectedCodePathError(
            'token refresh response parse failed',
            {
              cause: error,
              address: input.repo.address,
              status: response.status,
              hint: 'response body was not valid json',
            },
          );
        }
      })();

      const data = asGoogleTokenResponse({
        json,
        address: input.repo.address,
        status: response.status,
      });

      const expiresAt = getExpiresAtFromTokenResponse({
        expiresIn: data.expires_in,
      });

      // persist the new access token, and the refresh token IF google rotated it.
      //
      // ⚠️ google may return a fresh `refresh_token` on a refresh — it is not guaranteed
      // to, so the prior one is the fallback rather than the assumption. to keep the old
      // one unconditionally would brick the address the first time a rotation happens:
      // every later refresh would present a revoked token, fail, and leave no path back
      // but a manual cache delete (rule.forbid.behavior-hazards)
      const refreshToken = data.refresh_token ?? token.refreshToken;
      if (data.refresh_token && data.refresh_token !== token.refreshToken)
        adapterContext.log.debug('gmail rotated the refresh token', {
          address: input.repo.address,
        });

      await upsertGatherAccessToken({
        repo: input.repo,
        accessToken: data.access_token,
        refreshToken,
        expiresAt,
        cwd: context.cwd,
      });

      return {
        accessToken: data.access_token,
        expiresAt,
      };
    },

    /**
     * .what = get current access token
     * .why = mail adapter needs token via injection to avoid scope leak
     */
    getAccessToken: async (
      input: { repo: GatheredMailRepo },
      adapterContext: { log: GatherLogMethods },
    ) => {
      // a service account takes precedence over the oauth cache (ci/automation)
      const serviceAccount = getGmailServiceAccountCredentials();
      if (serviceAccount) {
        adapterContext.log.debug('use service account auth', {
          subject: serviceAccount.subject,
        });

        const minted = await getServiceAccountAccessToken({
          serviceAccountJson: serviceAccount.serviceAccountJson,
          subject: serviceAccount.subject,
        });
        return minted.accessToken;
      }

      // name the branch taken. without this line the fall-through is invisible: a human who
      // filled the service account keys but mistyped one would see the oauth path's error
      // and have no clue the service account was skipped
      adapterContext.log.debug('no service account credentials, use oauth', {
        address: input.repo.address,
        expected: [
          'GMAIL_SERVICE_ACCOUNT_JSON',
          'GMAIL_SERVICE_ACCOUNT_SUBJECT',
        ],
      });

      const token = await getOneGatherAccessToken({
        repo: input.repo,
        cwd: context.cwd,
      });
      return token?.accessToken ?? null;
    },
  };
};
