import type {
  DeclaredCloudflareDomainDnsRecord,
  DeclaredCloudflareDomainZone,
} from 'declastruct-cloudflare';
import type { RefByUnique } from 'domain-objects';

import { asCloudflareDnsRecord } from './asCloudflareDnsRecord';
import type { SesMailDnsRecord } from './asSesMailDnsRecords';

/**
 * .what = casts EVERY ses-owed dns record into its declared cloudflare counterpart, in one zone
 * .why = the wish's `getResources` is an orchestrator, so it should name what happens rather
 *   than carry the map and its closure over `zoneRef` inline
 *   (`rule.forbid.inline-decode-friction`).
 *
 * .note = the singular `asCloudflareDnsRecord` stays its own operation, and keeps its own
 *   clamps: the per-record claims (never proxied, the mx priority split) are what a future
 *   edit is most likely to break, and they are asserted where they live.
 */
export const asCloudflareDnsRecords = (input: {
  records: SesMailDnsRecord[];
  zoneRef: RefByUnique<typeof DeclaredCloudflareDomainZone>;
}): DeclaredCloudflareDomainDnsRecord[] =>
  input.records.map((record) =>
    asCloudflareDnsRecord({ record, zoneRef: input.zoneRef }),
  );
