import { STSClient } from '@aws-sdk/client-sts';
import { BadRequestError } from 'helpful-errors';

import type { GatherAuthAdapter } from '@src/domain.objects/GatherAuthAdapter';
import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import { genOncePerCall } from '../../../genOncePerCall';
import { getSesConfigOrNull } from '../getSesConfigOrNull';
import {
  getOneSesCallerIdentity,
  type SesCallerIdentity,
} from './getOneSesCallerIdentity';

/**
 * .what = the token the mail adapter receives for the ses mechanism
 * .why = the GatherMailAdapter contract demands an accessToken, but ses auth is
 *        plain iam — the aws sdk reads AWS_PROFILE from the env itself, so there
 *        is no token to pass. this sentinel makes that explicit rather than an
 *        empty string that reads as "absent".
 */
export const SES_ACCESS_TOKEN_IAM = 'iam://aws-profile';

/**
 * .what = ses auth adapter for the GatherAuthAdapter interface
 * .why = enables gather.auth --from ses via polymorphic dispatch
 *
 * .note = ses auth has no oauth flow, no token cache, and no expiry. the identity
 *         is the AWS_PROFILE keyrack placed in the env, and its validity is proven
 *         by an sts:GetCallerIdentity call rather than a stored token.
 *
 * .note = takes no cwd, unlike its gmail peer. gmail's auth adapter needs one to
 *         locate its oauth token cache dir; ses caches no token, so there is no
 *         path for a cwd to anchor.
 */
export const getSesAuthAdapter = (): GatherAuthAdapter => {
  /**
   * .what = the ONE caller-identity probe this adapter instance will make
   * .why = `genAuthReady` calls `getAuthStatus` and then `getAccessToken` on every
   *   `gather.mail` run, and each independently built an `STSClient` and spent a live
   *   `sts:GetCallerIdentity` round-trip — two network calls to prove one fact that
   *   cannot change mid-invocation. the second bought no information the first lacked.
   *
   * .note = the memo lives inside a single adapter instance, which lives for a single cli
   *   invocation, so it CANNOT go stale across runs the way a module-level cache would.
   *   `genOncePerCall` holds the mutation and states why it is safe; `[case4]` of its test
   *   clamps exactly this — two wrappers never share a memo.
   *
   * .note = the probe stays lazy rather than eager, because `getAuthStatus` must be able
   *   to report `anonymous` on an absent config without a network call at all.
   */
  const getOneIdentityOnce = genOncePerCall(
    async (input: {
      region: string;
      adapterContext: { log: GatherLogMethods };
    }): Promise<SesCallerIdentity | null> =>
      getOneSesCallerIdentity(
        { sts: new STSClient({ region: input.region }) },
        input.adapterContext,
      ),
  );

  return {
    mechanism: 'ses',

    /**
     * .what = check whether the aws profile currently authenticates
     * .why = sts:GetCallerIdentity is the cheapest proof that credentials load
     */
    getAuthStatus: async (
      _input: { repo: GatheredMailRepo | null },
      adapterContext: { log: GatherLogMethods },
    ): Promise<GatherAuthStatus> => {
      // an absent config means we cannot even reach aws — that reads as anonymous rather
      // than an error, since `gather.auth` exists precisely to report a not-yet-set-up state
      const config = getSesConfigOrNull();
      if (!config) return 'anonymous';

      const identity = await getOneIdentityOnce({
        region: config.region,
        adapterContext,
      });

      return identity ? 'authenticated' : 'anonymous';
    },

    /**
     * .what = there is no auth flow to run for ses
     * .why = iam credentials come from keyrack, not from an interactive grant. so
     *        the fix is an unlock, not a browser dance.
     */
    genAuth: async (
      _input: Record<string, never>,
      _adapterContext: { log: GatherLogMethods },
    ) => {
      BadRequestError.throw('ses needs no auth flow', {
        hint: 'ses authenticates via AWS_PROFILE from keyrack. run: rhx keyrack unlock --owner ehmpath --env prep',
      });
    },

    /**
     * .what = there is no token to refresh for ses
     * .why = iam credentials do not expire the way an oauth token does; a stale
     *        profile is re-unlocked via keyrack, never refreshed here
     */
    genAuthRefresh: async (
      _input: { repo: GatheredMailRepo },
      _adapterContext: { log: GatherLogMethods },
    ) => {
      BadRequestError.throw('ses tokens do not refresh', {
        hint: 'ses authenticates via AWS_PROFILE from keyrack, which has no refresh flow. run: rhx keyrack unlock --owner ehmpath --env prep',
      });
    },

    /**
     * .what = hand the mail adapter its (unused) access token
     * .why = the contract demands one; ses reads AWS_PROFILE from the env instead,
     *        so this returns a sentinel when the profile authenticates and null
     *        when it does not — which keeps the caller's authenticated-or-not
     *        branch identical to gmail's
     */
    getAccessToken: async (
      _input: { repo: GatheredMailRepo },
      adapterContext: { log: GatherLogMethods },
    ): Promise<string | null> => {
      // an absent config yields null, the same answer gmail gives — never a throw, so a
      // caller that skips the status check sees one contract on both mechanisms
      const config = getSesConfigOrNull();
      if (!config) return null;

      // ⚠️ this still ASKS for the identity rather than assume `getAuthStatus` proved it.
      // the memo makes the ask free within one invocation, but the call stays because the
      // `GatherAuthAdapter` contract does not promise an order — to drop it would make
      // this method correct only when a caller happens to check status first
      // (`rule.forbid.order-dependence`). gmail's adapter carries the same note: both
      // reads consult the same source, and they must stay in step.
      const identity = await getOneIdentityOnce({
        region: config.region,
        adapterContext,
      });

      return identity ? SES_ACCESS_TOKEN_IAM : null;
    },
  };
};
