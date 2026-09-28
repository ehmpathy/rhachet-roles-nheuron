import { GetCallerIdentityCommand, type STSClient } from '@aws-sdk/client-sts';

import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

/**
 * .what = the aws identity behind the current AWS_PROFILE
 * .why = proves which account + principal the ses mechanism acts as
 */
export interface SesCallerIdentity {
  account: string;
  arn: string;
}

/**
 * .what = read the caller identity of the current aws credentials
 * .why = the ses auth-status check — the iam counterpart of gmail's token probe.
 *        returns null when credentials are absent or rejected, so the caller can
 *        report 'anonymous' rather than crash.
 *
 * .note = an absent/invalid credential is an EXPECTED state here (it maps to
 *         'anonymous'), so it is caught. every other failure rethrows, per
 *         rule.forbid.failhide — a network fault must not read as 'anonymous'.
 */
export const getOneSesCallerIdentity = async (
  input: { sts: STSClient },
  context: { log: GatherLogMethods },
): Promise<SesCallerIdentity | null> => {
  const response = await (async () => {
    try {
      return await input.sts.send(new GetCallerIdentityCommand({}));
    } catch (error: any) {
      // the aws sdk raises these when credentials are absent, malformed, or
      // rejected — all of which mean "not authenticated", not "broken"
      const isCredentialFault =
        error?.name === 'CredentialsProviderError' ||
        error?.name === 'InvalidClientTokenId' ||
        error?.name === 'ExpiredToken' ||
        error?.name === 'UnrecognizedClientException';

      if (!isCredentialFault) throw error;

      context.log.debug('ses.getCallerIdentity: not authenticated', {
        error: error?.name,
        hint: 'run: rhx keyrack unlock --owner ehmpath --env prep',
      });
      return null;
    }
  })();

  if (!response?.Account || !response.Arn) return null;

  return { account: response.Account, arn: response.Arn };
};
