import { given, then, useBeforeAll, when } from 'test-fns';

import { asSesMailDnsRecords } from './asSesMailDnsRecords';

describe('asSesMailDnsRecords', () => {
  given('[case1] a mail domain with its 3 easy-dkim tokens', () => {
    const scene = useBeforeAll(async () => ({
      records: asSesMailDnsRecords({
        domain: 'one.nheuron.com',
        region: 'us-east-1',
        dkimTokens: ['tokenalpha', 'tokenbravo', 'tokencharlie'],
      }),
    }));

    when('[t0] the owed records are derived', () => {
      then('yields exactly 6 — mx + spf + 3 dkim + dmarc', () => {
        expect(scene.records).toHaveLength(6);
      });

      then('routes inbound via an mx at the region ses inbound host', () => {
        const mx = scene.records.filter((record) => record.type === 'MX');
        expect(mx).toHaveLength(1);
        expect(mx.map((record) => record.name)).toEqual(['one.nheuron.com']);
        expect(mx.map((record) => record.value)).toEqual([
          '10 inbound-smtp.us-east-1.amazonaws.com',
        ]);
      });

      then('authorizes ses to send via spf on the mail domain', () => {
        const spf = scene.records.find(
          (record) =>
            record.type === 'TXT' && record.name === 'one.nheuron.com',
        );
        expect(spf?.value).toEqual('v=spf1 include:amazonses.com ~all');
      });

      then('declares one dkim cname per token', () => {
        const dkim = scene.records.filter((record) => record.type === 'CNAME');
        expect(dkim).toHaveLength(3);
        expect(dkim.map((record) => record.name)).toEqual([
          'tokenalpha._domainkey.one.nheuron.com',
          'tokenbravo._domainkey.one.nheuron.com',
          'tokencharlie._domainkey.one.nheuron.com',
        ]);
        expect(dkim.map((record) => record.value)).toEqual([
          'tokenalpha.dkim.amazonses.com',
          'tokenbravo.dkim.amazonses.com',
          'tokencharlie.dkim.amazonses.com',
        ]);
      });

      then('declares dmarc in monitor mode, so it enforces no policy', () => {
        const dmarc = scene.records.find((record) =>
          record.name.startsWith('_dmarc.'),
        );
        expect(dmarc?.name).toEqual('_dmarc.one.nheuron.com');
        expect(dmarc?.value).toEqual('v=DMARC1; p=none');
      });

      then(
        'omits the v1 _amazonses ownership txt, absent under v2 easy dkim',
        () => {
          const amazonses = scene.records.filter((record) =>
            record.name.startsWith('_amazonses'),
          );
          expect(amazonses).toEqual([]);
        },
      );

      then('names only the subdomain, so the apex mx stays untouched', () => {
        for (const record of scene.records)
          expect(record.name.endsWith('one.nheuron.com')).toBe(true);
      });
    });
  });

  given('[case2] a different ses inbound region', () => {
    when('[t0] the owed records are derived', () => {
      then('points the mx at that region host', () => {
        const records = asSesMailDnsRecords({
          domain: 'one.nheuron.com',
          region: 'eu-west-1',
          dkimTokens: [],
        });
        const mx = records.find((record) => record.type === 'MX');
        expect(mx?.value).toEqual('10 inbound-smtp.eu-west-1.amazonaws.com');
      });
    });
  });

  given('[case3] an identity whose dkim tokens are not yet emitted', () => {
    const scene = useBeforeAll(async () => ({
      records: asSesMailDnsRecords({
        domain: 'one.nheuron.com',
        region: 'us-east-1',
        dkimTokens: [],
      }),
    }));

    when('[t0] the owed records are derived', () => {
      then('still yields the static mx + spf + dmarc', () => {
        expect(scene.records).toHaveLength(3);
      });

      then('carries no dkim cname to declare', () => {
        expect(
          scene.records.filter((record) => record.type === 'CNAME'),
        ).toEqual([]);
      });
    });
  });
});
