import type { GatherAuthStatus } from './GatherAuthStatus';
import type { GatheredMailMechanism } from './GatheredMailMechanism';
import type { GatheredMailRepo } from './GatheredMailRepo';
import type { GatherLogMethods } from './GatherLogMethods';

/**
 * .what = adapter contract for mechanism-specific auth operations
 * .why = enables future slack/phone adapters via same dispatcher
 */
export interface GatherAuthAdapter {
  mechanism: GatheredMailMechanism;

  getAuthStatus: (
    input: { repo: GatheredMailRepo | null },
    context: { log: GatherLogMethods },
  ) => Promise<GatherAuthStatus>;

  genAuth: (
    input: Record<string, never>,
    context: { log: GatherLogMethods },
  ) => Promise<{ repo: GatheredMailRepo; status: 'authenticated' }>;

  genAuthRefresh: (
    input: { repo: GatheredMailRepo },
    context: { log: GatherLogMethods },
  ) => Promise<{ accessToken: string; expiresAt: Date }>;

  getAccessToken: (
    input: { repo: GatheredMailRepo },
    context: { log: GatherLogMethods },
  ) => Promise<string | null>;
}
