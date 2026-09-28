import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';

import { getAuthFixHintForMechanism } from './getAuthFixHintForMechanism';

/**
 * .what = get mascot header for auth status
 */
const getMascotHeader = (input: { status: GatherAuthStatus }): string[] => {
  if (input.status === 'authenticated') return ['boop! auth ready', ''];
  if (input.status === 'expired') return ['boop! auth expired', ''];
  return ['boop! auth needed', ''];
};

/**
 * .what = get hint for next action based on auth status
 *
 * ⚠️ .note = the anonymous hint is NOT written here. it comes from
 *   `getAuthFixHintForMechanism`, the one place that answers "how does a human authenticate
 *   this mechanism". this file once carried its own copy of that answer, and the copy had
 *   drifted from the peer copy in `getAuthenticatedOrThrow` — so `gather.auth --from ses`
 *   and a refused `gather.mail --from ses` told the same human two different things about
 *   the same fix (`rule.require.ubiqlang`).
 */
const getStatusHint = (input: {
  status: GatherAuthStatus;
  mechanism: GatheredMailMechanism;
}): string[] => {
  if (input.status === 'anonymous')
    return ['', getAuthFixHintForMechanism({ mechanism: input.mechanism })];
  if (input.status === 'expired')
    return ['', 'token will refresh on next gather.mail'];
  return [];
};

/**
 * .what = format auth status for cli output
 * .why = treestruct format with nheuron mascot vibes
 */
export const getAuthStatusDisplay = (input: {
  status: GatherAuthStatus;
  mechanism: GatheredMailMechanism;
  address: string | null;
}): string => {
  // build lines via immutable concat
  const lines = [
    ...getMascotHeader({ status: input.status }),
    `gather.auth --from ${input.mechanism}`,
    `   status: ${input.status}`,
    ...(input.address ? [`   address: ${input.address}`] : []),
    ...getStatusHint({ status: input.status, mechanism: input.mechanism }),
  ];

  return lines.join('\n');
};
