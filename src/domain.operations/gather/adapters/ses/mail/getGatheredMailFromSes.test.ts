import type { ParsedMail } from 'mailparser';
import { simpleParser } from 'mailparser';
import type { PaginationInput } from 'pagination-fns';
import { given, then, useBeforeAll, when } from 'test-fns';

import { getMailsWithinRange } from '@src/domain.operations/gather/mail/transformers/getMailsWithinRange';

import {
  getDeliveredAtFromParsed,
  getGatheredMailFromSes,
  getSnippetFromBody,
} from './getGatheredMailFromSes';

/**
 * .what = build a raw rfc822 message for a test
 * .why = the transformer takes a ParsedMail, so a test must produce real parsed
 *        mail rather than a hand-shaped stub — mailparser is the real dependency
 */
const asRawMail = (input: {
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}): string =>
  [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Date: ${input.date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    input.body,
  ].join('\r\n');

/**
 * .what = the time ses wrote the object into s3, for a test
 * .why = the transformer falls back to this when a mail carries no Date header,
 *        so a test must supply a receipt time distinct from both the epoch and
 *        any Date header, to prove which of the two was used
 */
const RECEIVED_AT = new Date('2026-09-02T08:30:00.000Z');

describe('getSnippetFromBody', () => {
  given('[case1] an absent body', () => {
    when('[t0] a snippet is derived', () => {
      then('yields an empty string', () => {
        expect(getSnippetFromBody({ body: null })).toEqual('');
      });
    });
  });

  given('[case2] a short body with ragged whitespace', () => {
    when('[t0] a snippet is derived', () => {
      then('collapses the whitespace into prose', () => {
        expect(
          getSnippetFromBody({ body: 'hello\r\n\r\n  there\tfriend' }),
        ).toEqual('hello there friend');
      });
    });
  });

  given('[case3] a body longer than the snippet limit', () => {
    when('[t0] a snippet is derived', () => {
      then('truncates and marks the elision', () => {
        const snippet = getSnippetFromBody({ body: 'a'.repeat(500) });
        expect(snippet.length).toBeLessThan(500);
        expect(snippet.endsWith('…')).toBe(true);
      });
    });
  });
});

describe('getDeliveredAtFromParsed', () => {
  given('[case1] a valid Date header', () => {
    when('[t0] the delivered time is picked', () => {
      then('uses the sender-claimed date', () => {
        const claimed = new Date('2026-09-01T12:00:00.000Z');
        const picked = getDeliveredAtFromParsed({
          parsed: { date: claimed } as ParsedMail,
          receivedAt: RECEIVED_AT,
        });
        expect(picked).toEqual(claimed);
      });
    });
  });

  given('[case2] an absent Date header', () => {
    when('[t0] the delivered time is picked', () => {
      then('falls back to the s3 receipt time', () => {
        const picked = getDeliveredAtFromParsed({
          parsed: { date: undefined } as ParsedMail,
          receivedAt: RECEIVED_AT,
        });
        expect(picked).toEqual(RECEIVED_AT);
      });
    });
  });

  given('[case3] a present-but-Invalid Date OBJECT', () => {
    // this is the exact hazard the reviewer named: mailparser (or any upstream)
    // can hand back an Invalid Date OBJECT, not null, for an unparseable header.
    // `parsed.date ?? receivedAt` does NOT fall back on it — only null/undefined.
    when('[t0] the delivered time is picked', () => {
      then('falls back to the s3 receipt time, never a NaN date', () => {
        // teeth: revert the `Number.isNaN(...)` guard to a bare `?? receivedAt`
        // and this goes red — the Invalid Date passes through and getTime() is NaN
        const invalid = new Date('not-a-real-date');
        expect(Number.isNaN(invalid.getTime())).toBe(true); // the hazard, confirmed
        const picked = getDeliveredAtFromParsed({
          parsed: { date: invalid } as ParsedMail,
          receivedAt: RECEIVED_AT,
        });
        expect(picked).toEqual(RECEIVED_AT);
        expect(Number.isNaN(picked.getTime())).toBe(false);
      });
    });
  });
});

describe('getGatheredMailFromSes', () => {
  given('[case1] an ordinary mail', () => {
    const scene = useBeforeAll(async () => {
      const parsed = await simpleParser(
        asRawMail({
          from: 'Alice Example <alice@example.com>',
          to: 'jelly@one.nheuron.com',
          subject: 'surfs up',
          date: 'Mon, 01 Sep 2026 12:00:00 +0000',
          body: 'the waves are good today',
        }),
      );
      return {
        mail: getGatheredMailFromSes({
          parsed,
          receivedAt: RECEIVED_AT,
          exid: 'inbound/abc123',
          ceiverAddress: 'jelly@one.nheuron.com',
        }),
      };
    });

    when('[t0] cast into the domain', () => {
      then('uses the s3 key as the exid', () => {
        expect(scene.mail.exid).toEqual('inbound/abc123');
      });

      then('records the ceiver as the ses mailbox', () => {
        expect(scene.mail.ceiver.mechanism).toEqual('ses');
        expect(scene.mail.ceiver.address).toEqual('jelly@one.nheuron.com');
      });

      then('extracts the bare sender address, without the display name', () => {
        expect(scene.mail.sender.mechanism).toEqual('ses');
        expect(scene.mail.sender.address).toEqual('alice@example.com');
      });

      then('carries the subject', () => {
        expect(scene.mail.subject).toEqual('surfs up');
      });

      then('carries the body', () => {
        expect(scene.mail.body).toContain('the waves are good today');
      });

      then('derives a snippet from the body', () => {
        expect(scene.mail.snippet).toContain('the waves are good today');
      });

      then('reads the delivery time from the Date header', () => {
        expect(scene.mail.deliveredAt.getTime()).toEqual(
          Date.parse('2026-09-01T12:00:00.000Z'),
        );
      });

      then('carries no labels, since rfc822 has no such concept', () => {
        expect(scene.mail.labels).toEqual([]);
      });

      then('is not obfuscated', () => {
        expect(scene.mail.isObfuscated).toBe(false);
      });
    });
  });

  given('[case2] a security-sensitive mail (an mfa code)', () => {
    const scene = useBeforeAll(async () => {
      const parsed = await simpleParser(
        asRawMail({
          from: 'security@bank.com',
          to: 'jelly@one.nheuron.com',
          subject: 'Your verification code',
          date: 'Mon, 01 Sep 2026 12:00:00 +0000',
          body: 'Your two-factor authentication code is 123456',
        }),
      );
      return {
        mail: getGatheredMailFromSes({
          parsed,
          receivedAt: RECEIVED_AT,
          exid: 'inbound/sensitive',
          ceiverAddress: 'jelly@one.nheuron.com',
        }),
      };
    });

    when('[t0] cast into the domain', () => {
      then('is marked obfuscated', () => {
        expect(scene.mail.isObfuscated).toBe(true);
      });

      then('does not surface the code in the body', () => {
        expect(scene.mail.body).not.toContain('123456');
      });

      then('does not surface the code in the snippet', () => {
        expect(scene.mail.snippet).not.toContain('123456');
      });

      then('still reports that the mail exists', () => {
        expect(scene.mail.exid).toEqual('inbound/sensitive');
        expect(scene.mail.sender.address).toEqual('security@bank.com');
      });
    });
  });

  given('[case3] a mail with no Date header', () => {
    const scene = useBeforeAll(async () => {
      const parsed = await simpleParser(
        [
          'From: alice@example.com',
          'To: jelly@one.nheuron.com',
          'Subject: undated',
          '',
          'no date header here',
        ].join('\r\n'),
      );
      return {
        mail: getGatheredMailFromSes({
          parsed,
          receivedAt: RECEIVED_AT,
          exid: 'inbound/undated',
          ceiverAddress: 'jelly@one.nheuron.com',
        }),
      };
    });

    when('[t0] cast into the domain', () => {
      then('falls back to a valid date rather than an invalid one', () => {
        expect(scene.mail.deliveredAt.getTime()).not.toBeNaN();
      });

      then('falls back to the s3 receipt time, never the epoch', () => {
        // teeth: an epoch fallback also satisfies `not.toBeNaN`, so that check
        // alone guards no defect. this one goes red under it.
        expect(scene.mail.deliveredAt).toEqual(RECEIVED_AT);
        expect(scene.mail.deliveredAt.getTime()).toBeGreaterThan(0);
      });

      then('stays inside a --since range that follows the receipt', () => {
        // the defect this clamps: at the epoch, an undated mail sorts to 1970 and
        // every --since bound silently excludes it — no log, no count
        const kept = getMailsWithinRange({
          mails: [scene.mail],
          page: {
            range: { since: { deliveredAt: new Date('2026-09-01T00:00:00Z') } },
          } as PaginationInput<{ deliveredAt: Date }>,
        });
        expect(kept).toHaveLength(1);
      });
    });
  });

  given('[case4] a mail with an attachment', () => {
    const scene = useBeforeAll(async () => {
      const boundary = 'boundary123';
      const raw = [
        'From: alice@example.com',
        'To: jelly@one.nheuron.com',
        'Subject: with attachment',
        'Date: Mon, 01 Sep 2026 12:00:00 +0000',
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        'see attached',
        '',
        `--${boundary}`,
        'Content-Type: text/plain; name="notes.txt"',
        'Content-Disposition: attachment; filename="notes.txt"',
        '',
        'attached content',
        '',
        `--${boundary}--`,
      ].join('\r\n');

      const parsed = await simpleParser(raw);
      return {
        mail: getGatheredMailFromSes({
          parsed,
          receivedAt: RECEIVED_AT,
          exid: 'inbound/attached',
          ceiverAddress: 'jelly@one.nheuron.com',
        }),
      };
    });

    when('[t0] cast into the domain', () => {
      then('lists the attachment filename', () => {
        expect(scene.mail.attachments).toContain('notes.txt');
      });

      then('still carries the text body', () => {
        expect(scene.mail.body).toContain('see attached');
      });
    });
  });
});
