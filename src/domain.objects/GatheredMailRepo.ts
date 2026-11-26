import { DomainLiteral } from 'domain-objects';

import type { GatheredMailMechanism } from './GatheredMailMechanism';

/**
 * .what = mailbox identity (mechanism + address)
 * .why = uniquely identifies a mailbox across mechanisms
 */
export interface GatheredMailRepo {
  mechanism: GatheredMailMechanism;
  address: string;
}
export class GatheredMailRepo
  extends DomainLiteral<GatheredMailRepo>
  implements GatheredMailRepo {}
