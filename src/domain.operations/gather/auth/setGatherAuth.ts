import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import { getAuthAdapterForMechanism } from '@src/domain.operations/gather/adapters/getAuthAdapterForMechanism';

import { genAuthIfAnonymous } from './genAuthIfAnonymous';
import { setGatherAuthOutput } from './setGatherAuthOutput';

/**
 * .what = root dispatcher for gather.auth skill
 * .why = orchestrates adapter select + status check + auth flow + output
 *
 * narrative steps:
 *   1. getAuthAdapterForMechanism → select adapter for mechanism
 *   2. adapter.getAuthStatus → check current auth state
 *   3. genAuthIfAnonymous → if anonymous and no address: ask the mechanism for auth
 *   4. setGatherAuthOutput → show status
 *
 * note: when address is provided, only checks status (no auth flow asked).
 */
export const setGatherAuth = async (
  input: {
    mechanism: GatheredMailMechanism;
    address: string | null;
  },
  context: {
    log: GatherLogMethods;
    setStdout: (content: string) => void;
  },
): Promise<void> => {
  // select adapter for mechanism
  const authAdapter = getAuthAdapterForMechanism({
    mechanism: input.mechanism,
  });

  // build repo if address provided
  const repo: GatheredMailRepo | null = input.address
    ? { mechanism: input.mechanism, address: input.address }
    : null;

  // check current auth state
  const statusBefore = await authAdapter.getAuthStatus(
    { repo },
    { log: context.log },
  );

  // when address is provided, only check status (no auth flow asked)
  if (input.address) {
    setGatherAuthOutput(
      {
        status: statusBefore,
        mechanism: input.mechanism,
        address: input.address,
      },
      { setStdout: context.setStdout },
    );
    return;
  }

  // run auth flow if anonymous (only when no address provided)
  const result = await genAuthIfAnonymous(
    { status: statusBefore, authAdapter },
    { log: context.log },
  );

  // emit status
  setGatherAuthOutput(
    {
      status: result.status,
      mechanism: input.mechanism,
      address: result.address,
    },
    { setStdout: context.setStdout },
  );
};
