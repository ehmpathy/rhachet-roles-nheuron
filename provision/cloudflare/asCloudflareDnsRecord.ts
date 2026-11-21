import {
  DeclaredCloudflareDomainDnsRecord,
  type DeclaredCloudflareDomainZone,
} from 'declastruct-cloudflare';
import type { RefByUnique } from 'domain-objects';
import { BadRequestError } from 'helpful-errors';

import type { SesMailDnsRecord } from './asSesMailDnsRecords';

/**
 * .what = casts ONE ses-owed dns record into a declared cloudflare dns record in the mail zone
 * .why = cloudflare models an MX with the priority as its own field, while ses states it as a
 *   `'PRIORITY HOST'` value — so the split happens here rather than at each call site
 *
 * .note = every record is dns-only (`proxied: false`). cloudflare must NOT proxy mail records —
 *   a proxied mx or txt breaks mail outright, and the break is silent: the apply succeeds, the
 *   records read as present in the ui, and inbound mail simply never arrives. that makes this
 *   flag the one line in the file whose flip costs a debug session, so it is clamped in the
 *   test rather than trusted to review.
 *
 * .note = `ttl: 1` is cloudflare's sentinel for automatic, not a one-second ttl.
 *
 * .note = it lives in its own file rather than inline in `resources.mail.dns.ts` for the same
 *   reason `asSesMailDnsRecords` does: the wish module sources keyrack at load, so a test that
 *   imports it reads the filesystem. extracted, this stays pure and unit-testable.
 */
export const asCloudflareDnsRecord = (input: {
  record: SesMailDnsRecord;
  zoneRef: RefByUnique<typeof DeclaredCloudflareDomainZone>;
}): DeclaredCloudflareDomainDnsRecord => {
  const { record, zoneRef } = input;

  // an mx value is 'PRIORITY HOST' — cloudflare wants the priority as its own field
  const isMx = record.type === 'MX';
  const [mxPriorityRaw, ...mxHostParts] = record.value.split(' ');
  const priority = isMx ? Number(mxPriorityRaw) : undefined;
  const content = isMx ? mxHostParts.join(' ') : record.value;

  // a malformed mx would declare `priority: NaN` or an empty host, and cloudflare would hold
  // a record that routes no mail — refuse it here instead
  if (isMx && (!Number.isInteger(priority) || content.length === 0))
    BadRequestError.throw('mx record value is not "PRIORITY HOST"', {
      name: record.name,
      value: record.value,
      hint: "an mx value must read like '10 inbound-smtp.us-east-1.amazonaws.com'",
    });

  return new DeclaredCloudflareDomainDnsRecord({
    zone: zoneRef,
    name: record.name,
    type: record.type,
    content,
    ttl: 1, // cloudflare automatic
    proxied: false, // mail records are dns-only (grey-cloud), never proxied
    priority,
  });
};
