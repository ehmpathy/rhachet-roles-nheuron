import type { GatherAuthStatus } from '@src/domain.objects/GatherAuthStatus';

/**
 * .what = check if auth status indicates auth is needed
 * .why = extracted decision logic for genAuthIfAnonymous orchestrator
 */
export const getStatusIsAnonymous = (input: {
  status: GatherAuthStatus;
}): boolean => {
  return input.status === 'anonymous';
};
