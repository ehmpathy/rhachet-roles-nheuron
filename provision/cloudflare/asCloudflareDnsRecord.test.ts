import type { DeclaredCloudflareDomainZone } from 'declastruct-cloudflare';
import { RefByUnique } from 'domain-objects';
import { given, then, when } from 'test-fns';

import { asCloudflareDnsRecord } from './asCloudflareDnsRecord';
import { asSesMailDnsRecords } from './asSesMailDnsRecords';

/**
 * .what = clamps the cast from a ses-owed dns record to a declared cloudflare one
 * .why = two claims live in this cast and neither is visible at a call site: that mail
 *   records are never proxied, and that an mx priority is split off into its own field.
 *   both fail SILENTLY in production — a proxied record reads as present while mail never
 *   arrives, and an unsplit mx puts `10 inbound-smtp…` in the content where cloudflare
 *   expects a bare host.
 */
const ZONE_REF = RefByUnique.as<typeof DeclaredCloudflareDomainZone>({
  name: 'nheuron.com',
});

describe('asCloudflareDnsRecord', () => {
  given('[case1] the mx record ses owes for inbound mail', () => {
    const record = asCloudflareDnsRecord({
      record: {
        type: 'MX',
        name: 'one.nheuron.com',
        value: '10 inbound-smtp.us-east-1.amazonaws.com',
      },
      zoneRef: ZONE_REF,
    });

    when('[t0] it is cast', () => {
      then('the priority is split off into its own field', () => {
        expect(record.priority).toEqual(10);
      });

      then('the content holds the bare host, free of the priority', () => {
        // cloudflare rejects a priority inside an mx content; the whole reason this cast
        // exists is that ses states the two as one string and cloudflare wants them apart
        expect(record.content).toEqual('inbound-smtp.us-east-1.amazonaws.com');
        expect(record.content).not.toContain('10 ');
      });
    });
  });

  given('[case2] a record that carries no priority', () => {
    const record = asCloudflareDnsRecord({
      record: {
        type: 'TXT',
        name: 'one.nheuron.com',
        value: 'v=spf1 include:amazonses.com ~all',
      },
      zoneRef: ZONE_REF,
    });

    when('[t0] it is cast', () => {
      then('the value passes through whole, spaces and all', () => {
        // the mx split must not fire here — an spf value is full of spaces, and a split
        // would silently truncate it to `include:amazonses.com ~all`
        expect(record.content).toEqual('v=spf1 include:amazonses.com ~all');
      });

      then('no priority is claimed', () => {
        expect(record.priority).toBeUndefined();
      });
    });
  });

  given('[case3] every record the mail identity owes', () => {
    // teeth: this is the wall the cast is CHOSEN for. a proxied mx or txt breaks mail
    // outright, and breaks it silently — the apply succeeds and the records read as
    // present. flip `proxied` to true in the cast and this case goes red.
    const records = asSesMailDnsRecords({
      domain: 'one.nheuron.com',
      region: 'us-east-1',
      dkimTokens: ['tokenalpha', 'tokenbravo', 'tokencharlie'],
    }).map((record) => asCloudflareDnsRecord({ record, zoneRef: ZONE_REF }));

    when('[t0] each is cast', () => {
      then('not one is proxied — mail records are dns-only', () => {
        expect(records).toHaveLength(6);
        for (const record of records) expect(record.proxied).toBe(false);
      });

      then('each names the mail zone, never a second one', () => {
        for (const record of records) expect(record.zone).toEqual(ZONE_REF);
      });

      then('each takes cloudflare automatic ttl', () => {
        // `1` is cloudflare's sentinel for automatic, NOT a one-second ttl — a reader who
        // reads it as seconds would "fix" it to 300 and pin the records to a fixed ttl
        for (const record of records) expect(record.ttl).toEqual(1);
      });
    });
  });

  given('[case4] an mx value that is not "PRIORITY HOST"', () => {
    when('[t0] the value is a bare host, with no priority', () => {
      then('it refuses, rather than declare priority NaN', () => {
        expect(() =>
          asCloudflareDnsRecord({
            record: {
              name: 'one.nheuron.com',
              type: 'MX',
              value: 'inbound-smtp.us-east-1.amazonaws.com',
            },
            zoneRef: ZONE_REF,
          }),
        ).toThrow('mx record value is not "PRIORITY HOST"');
      });
    });

    when('[t1] the value is a priority with no host', () => {
      then('it refuses, rather than declare an empty host', () => {
        expect(() =>
          asCloudflareDnsRecord({
            record: { name: 'one.nheuron.com', type: 'MX', value: '10' },
            zoneRef: ZONE_REF,
          }),
        ).toThrow('mx record value is not "PRIORITY HOST"');
      });
    });
  });
});
