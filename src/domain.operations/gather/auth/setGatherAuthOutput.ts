import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';

import { getAuthStatusDisplay } from './transformers/getAuthStatusDisplay';

/**
 * .what = format and emit auth status
 * .why = orchestrator composes format + emit
 *
 * narrative steps:
 *   1. getAuthStatusDisplay → format status for output
 *   2. setStdout → write to stdout
 */
export const setGatherAuthOutput = (
  input: {
    status: GatherAuthStatus;
    mechanism: GatheredMailMechanism;
    address: string | null;
  },
  context: {
    setStdout: (content: string) => void;
  },
): void => {
  // format status for output
  const output = getAuthStatusDisplay({
    status: input.status,
    mechanism: input.mechanism,
    address: input.address,
  });

  // emit to stdout, newline-terminated so the shell prompt starts on its own line
  context.setStdout(`${output}\n`);
};
