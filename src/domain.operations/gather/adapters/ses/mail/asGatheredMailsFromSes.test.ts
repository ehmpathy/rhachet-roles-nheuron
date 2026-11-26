import { simpleParser } from 'mailparser';
import { given, then, useBeforeAll, when } from 'test-fns';

import { asGatheredMailsFromSes } from './asGatheredMailsFromSes';

/**
 * .what = a raw rfc822 message, parsed by the real mailparser
 * .why = the transformer takes ParsedMail; a hand-shaped stub would test the stub
 */
const asParsedMail = async (input: { subject: string }) =>
  simpleParser(
    [
      'From: sender@example.com',
      'To: jelly@one.example.com',
      `Subject: ${input.subject}`,
      'Date: Tue, 24 Nov 2026 06:00:00 +0000',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'hello',
    ].join('\r\n'),
  );

describe('asGatheredMailsFromSes', () => {
  given('[case1] two objects read from the inbound prefix', () => {
    // held under a key: the shared value is a proxy, and a proxied array has no `.map`
    const scene = useBeforeAll(async () => ({
      objects: [
        {
          key: 'inbound/aaa',
          receivedAt: new Date('2026-11-24T06:00:01.000Z'),
          parsed: await asParsedMail({ subject: 'first' }),
        },
        {
          key: 'inbound/bbb',
          receivedAt: new Date('2026-11-24T06:00:02.000Z'),
          parsed: await asParsedMail({ subject: 'second' }),
        },
      ],
    }));

    when('[t0] they are cast into the domain', () => {
      then('one mail per object, in order', () => {
        const mails = asGatheredMailsFromSes({
          objects: scene.objects,
          ceiverAddress: 'jelly@one.example.com',
        });
        expect(mails.map((mail) => mail.subject)).toEqual(['first', 'second']);
      });

      then('each exid IS its s3 object key', () => {
        // a re-run names keys by cached exid, so the two must be one identity
        const mails = asGatheredMailsFromSes({
          objects: scene.objects,
          ceiverAddress: 'jelly@one.example.com',
        });
        expect(mails.map((mail) => mail.exid)).toEqual([
          'inbound/aaa',
          'inbound/bbb',
        ]);
      });

      then('each is addressed to the ceiver it was read for', () => {
        const mails = asGatheredMailsFromSes({
          objects: scene.objects,
          ceiverAddress: 'jelly@one.example.com',
        });
        mails.forEach((mail) =>
          expect(mail.ceiver.address).toEqual('jelly@one.example.com'),
        );
      });
    });
  });

  given('[case2] no objects', () => {
    when('[t0] they are cast into the domain', () => {
      then('it yields no mails', () => {
        expect(
          asGatheredMailsFromSes({
            objects: [],
            ceiverAddress: 'jelly@one.example.com',
          }),
        ).toEqual([]);
      });
    });
  });
});
