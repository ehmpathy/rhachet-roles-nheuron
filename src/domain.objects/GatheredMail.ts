import { DomainEntity } from 'domain-objects';

import type { GatherContactRef } from './GatherContactRef';
import { GatheredMailRepo } from './GatheredMailRepo';

/**
 * .what = cached mail domain entity
 * .why = represents a mail fetched and cached from any mechanism
 */
export interface GatheredMail {
  /**
   * external identifier — the immutable message id from source (e.g., gmail message id).
   *
   * .note = it identifies a mail WITHIN its mailbox, never across mailboxes — it is issued
   *   by the source, so two mechanisms (or two mailboxes on one mechanism) may hand out the
   *   same string. so it is half of the natural key; `ceiver` is the other half.
   */
  exid: string;

  /**
   * who received — the mailbox we gather from
   */
  ceiver: GatheredMailRepo;

  /**
   * who sent — the sender contact reference
   */
  sender: GatherContactRef;

  /**
   * subject line
   */
  subject: string;

  /**
   * preview text
   */
  snippet: string;

  /**
   * full body text (null if not fetched)
   */
  body: string | null;

  /**
   * timestamp mail was delivered
   */
  deliveredAt: Date;

  /**
   * mechanism-specific labels (e.g., gmail labels)
   */
  labels: string[];

  /**
   * attachment file names
   */
  attachments: string[];

  /**
   * true if content was obfuscated due to security sensitivity
   */
  isObfuscated: boolean;
}

export class GatheredMail
  extends DomainEntity<GatheredMail>
  implements GatheredMail
{
  /**
   * .note = the key is (ceiver, exid), NEVER exid alone. an exid is issued by the source, so
   *   it identifies a mail only within its own mailbox; alone it asserts that two mailboxes
   *   can never mint the same string, which no source guarantees. the cache layout already
   *   keys on mechanism + address + exid, so the entity now states the invariant the paths
   *   held by convention (`rule.require.domain-driven-design`).
   *
   * .note = there is no `primary`. domain-objects reserves that slot for a single ARTIFICIAL
   *   key (`readonly [string]`), and a gathered mail has none — no store mints it an id; it
   *   arrives already identified by its source. so the natural key is the only key, which is
   *   exactly what `unique` is for (`rule.require.immutable-refs` — both halves are immutable).
   */
  public static unique = ['ceiver', 'exid'] as const;
  public static nested = { ceiver: GatheredMailRepo };
}
