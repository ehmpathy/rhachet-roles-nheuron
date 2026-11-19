import { DomainLiteral } from 'domain-objects';

import type { GatheredMailMechanism } from './GatheredMailMechanism';

/**
 * .what = reference to a contact (sender or ceiver) in a gather mechanism
 * .why = distinct from GatheredMailRepo which represents the mailbox we gather from
 *
 * for ses: both sender and ceiver are email addresses
 */
export interface GatherContactRef {
  /**
   * which mechanism this contact is from
   */
  mechanism: GatheredMailMechanism;

  /**
   * the address or identifier within the mechanism
   */
  address: string;
}

export class GatherContactRef
  extends DomainLiteral<GatherContactRef>
  implements GatherContactRef {}
