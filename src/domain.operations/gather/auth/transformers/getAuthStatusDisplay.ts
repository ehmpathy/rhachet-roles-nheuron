import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';
import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';

import { getAuthFixHintForMechanism } from './getAuthFixHintForMechanism';

/**
 * .what = get mascot header for auth status
 * .why = the same jellyfish mascot `gather.mail` opens with, so one tool speaks one visual
 *   language across its commands
 */
const getMascotHeader = (input: { status: GatherAuthStatus }): string[] => {
  const mascot = '\u{1FABC}'; // jellyfish emoji
  if (input.status === 'authenticated')
    return [`${mascot} boop! auth ready`, ''];
  if (input.status === 'expired') return [`${mascot} boop! auth expired`, ''];
  return [`${mascot} boop! auth needed`, ''];
};

/**
 * .what = draw a list of leaves as treestruct branches under one command line
 * .why = every leaf but the last takes `├─`; the last takes `└─`, so the trunk closes
 */
const asTreeBranches = (input: { leaves: string[] }): string[] =>
  input.leaves.map(
    (leaf, index) =>
      `   ${index === input.leaves.length - 1 ? '└─' : '├─'} ${leaf}`,
  );

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
    return [
      `hint: ${getAuthFixHintForMechanism({ mechanism: input.mechanism })}`,
    ];
  if (input.status === 'expired')
    return ['hint: token will refresh on next gather.mail'];
  return [];
};

/**
 * .what = format auth status for cli output
 * .why = treestruct format with nheuron mascot vibes — mascot line, command line, then one
 *   branch per fact, the hint as the last leaf (the shape `gather.mail` uses)
 */
export const getAuthStatusDisplay = (input: {
  status: GatherAuthStatus;
  mechanism: GatheredMailMechanism;
  address: string | null;
}): string => {
  // the facts, in read order; the hint (if any) closes the trunk
  const leaves = [
    `status: ${input.status}`,
    ...(input.address ? [`address: ${input.address}`] : []),
    ...getStatusHint({ status: input.status, mechanism: input.mechanism }),
  ];

  // build lines via immutable concat
  const lines = [
    ...getMascotHeader({ status: input.status }),
    `\u{1F511} gather.auth --from ${input.mechanism}`, // key emoji
    ...asTreeBranches({ leaves }),
  ];

  return lines.join('\n');
};
