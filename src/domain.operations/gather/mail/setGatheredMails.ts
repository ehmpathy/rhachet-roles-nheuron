import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import { getAuthAdapterForMechanism } from '@src/domain.operations/gather/adapters/getAuthAdapterForMechanism';
import { getMailAdapterForMechanism } from '@src/domain.operations/gather/adapters/getMailAdapterForMechanism';

import { genAuthReady } from './genAuthReady';
import { setGatheredMailOutput } from './setGatheredMailOutput';
import { setMailsFromAdapter } from './setMailsFromAdapter';
import { asAddressOrThrow } from './transformers/asAddressOrThrow';
import { asSinceDateOrThrow } from './transformers/asSinceDateOrThrow';

/**
 * .what = root dispatcher for gather.mail skill
 * .why = orchestrates address check + auth + fetch + output
 *
 * narrative steps:
 *   1. asAddressOrThrow → check the address shape
 *   2. getAuthAdapterForMechanism → select auth adapter
 *   3. getMailAdapterForMechanism → select mail adapter
 *   4. genAuthReady → guard: fail-fast if not authenticated
 *   5. setMailsFromAdapter → fetch mails (uses adapter + cache under the hood)
 *   6. setGatheredMailOutput → format and emit with stats
 */
export const setGatheredMails = async (
  input: {
    mechanism: GatheredMailMechanism;
    address: string;
    since: string | null;
    format: 'tree' | 'json';
  },
  context: {
    log: GatherLogMethods;
    setStdout: (content: string) => void;
    cwd: string | null;
  },
): Promise<void> => {
  // refuse a malformed address or an unreadable --since BEFORE the auth check: no
  // credential makes either readable, so a human must not be sent to fix a credential.
  // the range itself is still built downstream
  const address = asAddressOrThrow({ address: input.address });
  if (input.since) asSinceDateOrThrow({ since: input.since });

  // build repo from mechanism + address
  const repo: GatheredMailRepo = { mechanism: input.mechanism, address };

  // select adapters
  const authAdapter = getAuthAdapterForMechanism({
    mechanism: input.mechanism,
  });
  const mailAdapter = getMailAdapterForMechanism({
    mechanism: input.mechanism,
  });

  // guard: fail-fast if not authenticated; get token for downstream
  const { accessToken } = await genAuthReady(
    { repo, authAdapter },
    { log: context.log },
  );

  // fetch mails. the RANGE is built downstream, where the prior run's cursor is in hand —
  // an absent `--since` falls back to it, which is what makes a bare re-run incremental
  const result = await setMailsFromAdapter(
    { in: { repo }, since: input.since, limit: 500 },
    { mailAdapter, log: context.log, accessToken, cwd: context.cwd },
  );

  // format and emit
  setGatheredMailOutput(
    {
      mails: result.mails,
      stats: result.stats,
      mechanism: input.mechanism,
      address,
      format: input.format,
    },
    { setStdout: context.setStdout },
  );
};
