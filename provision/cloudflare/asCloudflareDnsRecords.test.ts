import type { DeclaredCloudflareDomainZone } from 'declastruct-cloudflare';
import { RefByUnique } from 'domain-objects';
import { given, then, when } from 'test-fns';

import { asCloudflareDnsRecords } from './asCloudflareDnsRecords';
import { asSesMailDnsRecords } from './asSesMailDnsRecords';

/**
 * .what = clamps the plural cast — the surface the dns wish actually calls
 * .why = the singular's own test pins the per-record claims. what this one owes is the
 *   claims the SET carries: that every owed record survives the cast (a silent drop would
 *   leave the identity unverified with no error), that order holds, and that one zoneRef
 *   reaches all of them.
 */
const ZONE_REF = RefByUnique.as<typeof DeclaredCloudflareDomainZone>({
  name: 'nheuron.com',
});

describe('asCloudflareDnsRecords', () => {
  given('[case1] the full set a mail identity owes', () => {
    const owed = asSesMailDnsRecords({
      domain: 'one.nheuron.com',
      region: 'us-east-1',
      dkimTokens: ['tokenalpha', 'tokenbravo', 'tokencharlie'],
    });
    const records = asCloudflareDnsRecords({
      records: owed,
      zoneRef: ZONE_REF,
    });

    when('[t0] the set is cast', () => {
      then('every owed record survives — none is dropped', () => {
        // a drop here is silent: the apply succeeds with a partial record set, and the ses
        // identity then sits `unresolved` forever with no error to point at
        expect(records).toHaveLength(owed.length);
        expect(records).toHaveLength(6);
      });

      then('order is preserved, so a plan diff stays readable', () => {
        expect(records.map((record) => record.name)).toEqual(
          owed.map((record) => record.name),
        );
      });

      then('every record lands in the one zone it was given', () => {
        for (const record of records) expect(record.zone).toEqual(ZONE_REF);
      });
    });
  });

  given('[case2] an identity whose dkim tokens are not yet emitted', () => {
    when('[t0] the shorter set is cast', () => {
      then('it casts what it was given, without invention', () => {
        // the wish throws on empty DKIM_TOKENS before it reaches here; this asserts the
        // cast itself adds no record of its own, so that throw stays the only guard needed
        const owed = asSesMailDnsRecords({
          domain: 'one.nheuron.com',
          region: 'us-east-1',
          dkimTokens: [],
        });
        expect(
          asCloudflareDnsRecords({ records: owed, zoneRef: ZONE_REF }),
        ).toHaveLength(3);
      });
    });
  });
});
