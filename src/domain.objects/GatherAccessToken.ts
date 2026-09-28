import { DomainLiteral } from 'domain-objects';

import type { GatheredMailMechanism } from './GatheredMailMechanism';

/**
 * .what = stored oauth tokens for a mechanism + address
 * .why = enables token persistence across sessions
 *
 * ⚠️ .note = `mechanism` is the NARROW union, not a bare `string`. its peers
 *   `GatherContactRef` and `GatheredMailRepo` both already declared it that way, and this
 *   one did not — so the token cache was the single place in the domain where a mechanism
 *   could hold any text at all. the read-back (`getOneGatherAccessToken`) then trusted
 *   whatever the file said, in the very file that refuses to trust the expiry two lines
 *   below (`rule.require.shapefit`).
 */
export interface GatherAccessToken {
  mechanism: GatheredMailMechanism;
  address: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class GatherAccessToken
  extends DomainLiteral<GatherAccessToken>
  implements GatherAccessToken {}
