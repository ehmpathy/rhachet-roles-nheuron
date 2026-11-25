import { DomainLiteral } from 'domain-objects';

/**
 * .what = parsed address with optional scope filters
 * .why = separates base address from mechanism-specific filters
 *
 * examples:
 *   'vlad@example.com' → { address: { given: 'vlad@example.com', formed: 'vlad@example.com' }, scope: null }
 *   'vlad@example.com/labels=work,urgent' → { address: { given: 'vlad@example.com/labels=work,urgent', formed: 'vlad@example.com' }, scope: { labels: ['work', 'urgent'] } }
 */
export interface GatherAddressScope {
  address: {
    given: string; // raw input
    formed: string; // parsed base address
  };
  scope: Record<string, string[]> | null; // mechanism-specific filters
}

export class GatherAddressScope
  extends DomainLiteral<GatherAddressScope>
  implements GatherAddressScope {}
