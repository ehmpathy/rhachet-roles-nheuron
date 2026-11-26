import { DomainLiteral } from 'domain-objects';

import type { GatheredMailMechanism } from './GatheredMailMechanism';

/**
 * .what = reference to a contact (sender or ceiver) in a gather mechanism
 * .why = distinct from GatheredMailRepo which represents the mailbox we gather from
 *
 * for gmail: both sender and ceiver are email addresses
 * for slack: sender = user id, ceiver = channel id
 * for phone: sender/ceiver = phone numbers
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
