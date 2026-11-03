import { DomainLiteral } from 'domain-objects';

/**
 * .what = parsed address with optional scope filters
 * .why = separates base address from mechanism-specific filters
 *
 * examples:
 *   'vlad@gmail.com' → { address: { given: 'vlad@gmail.com', formed: 'vlad@gmail.com' }, scope: null }
 *   'vlad@gmail.com/labels=work,urgent' → { address: { given: 'vlad@gmail.com/labels=work,urgent', formed: 'vlad@gmail.com' }, scope: { labels: ['work', 'urgent'] } }
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
