import { given, then, when } from 'test-fns';

import {
  asEncodedHeaderValue,
  asRawMimeMessage,
  asSafeHeaderValue,
} from './asRawMimeMessage';

/**
 * .what = read the decoded body back out of a raw mime message
 * .why = the body is base64 + line-wrapped, so a test must undo both to assert
 */
const getDecodedBody = (input: { raw: string }): string => {
  const [, body] = input.raw.split('\r\n\r\n');
  return Buffer.from((body ?? '').replace(/\r\n/g, ''), 'base64').toString(
    'utf-8',
  );
};

describe('asSafeHeaderValue', () => {
  given('[case1] a value with no newlines', () => {
    when('[t0] made safe', () => {
      then('passes through unchanged', () => {
        expect(asSafeHeaderValue({ value: 'hello there' })).toEqual(
          'hello there',
        );
      });
    });
  });

  given('[case2] a value with an embedded newline (header injection)', () => {
    when('[t0] made safe', () => {
      then('flattens the newline so no header can be injected', () => {
        const result = asSafeHeaderValue({
          value: 'subject\r\nBcc: attacker@evil.com',
        });
        expect(result).toEqual('subject Bcc: attacker@evil.com');
        expect(result).not.toContain('\r');
        expect(result).not.toContain('\n');
      });
    });
  });
});

describe('asEncodedHeaderValue', () => {
  given('[case1] an ascii value', () => {
    when('[t0] encoded', () => {
      then('passes through unencoded', () => {
        expect(asEncodedHeaderValue({ value: 'plain subject' })).toEqual(
          'plain subject',
        );
      });
    });
  });

  given('[case2] a non-ascii value', () => {
    when('[t0] encoded', () => {
      then('wraps it in rfc2047 base64 form', () => {
        const result = asEncodedHeaderValue({ value: 'héllo 🪼' });
        expect(result).toContain('=?UTF-8?B?');
        expect(result).toContain('?=');
      });

      then('round-trips back to the original', () => {
        const result = asEncodedHeaderValue({ value: 'héllo 🪼' });
        const encoded = result.replace('=?UTF-8?B?', '').replace('?=', '');
        expect(Buffer.from(encoded, 'base64').toString('utf-8')).toEqual(
          'héllo 🪼',
        );
      });
    });
  });
});

describe('asRawMimeMessage', () => {
  given('[case1] a reply that answers no prior mail', () => {
    const raw = asRawMimeMessage({
      from: 'jelly@one.nheuron.com',
      to: 'alice@example.com',
      subject: 'hello',
      body: 'hi there',
      inReplyTo: null,
    });

    when('[t0] built', () => {
      then('carries the from + to headers', () => {
        expect(raw).toContain('From: jelly@one.nheuron.com');
        expect(raw).toContain('To: alice@example.com');
      });

      then('carries the subject', () => {
        expect(raw).toContain('Subject: hello');
      });

      then('declares utf-8 plain text, base64 encoded', () => {
        expect(raw).toContain('MIME-Version: 1.0');
        expect(raw).toContain('Content-Type: text/plain; charset=UTF-8');
        expect(raw).toContain('Content-Transfer-Encoding: base64');
      });

      then('omits the thread headers', () => {
        expect(raw).not.toContain('In-Reply-To:');
        expect(raw).not.toContain('References:');
      });

      then('carries the body, recoverable', () => {
        expect(getDecodedBody({ raw })).toEqual('hi there');
      });
    });
  });

  given('[case2] a reply that answers a prior mail', () => {
    const raw = asRawMimeMessage({
      from: 'jelly@one.nheuron.com',
      to: 'alice@example.com',
      subject: 're: hello',
      body: 'here is my answer',
      inReplyTo: '<abc123@example.com>',
    });

    when('[t0] built', () => {
      then('threads via In-Reply-To', () => {
        expect(raw).toContain('In-Reply-To: <abc123@example.com>');
      });

      then('threads via References', () => {
        expect(raw).toContain('References: <abc123@example.com>');
      });
    });
  });

  given('[case3] a body with non-ascii content', () => {
    const raw = asRawMimeMessage({
      from: 'jelly@one.nheuron.com',
      to: 'alice@example.com',
      subject: 'unicode',
      body: 'jellyfish 🪼 drift with the currents',
      inReplyTo: null,
    });

    when('[t0] built', () => {
      then('the body survives the round trip intact', () => {
        expect(getDecodedBody({ raw })).toEqual(
          'jellyfish 🪼 drift with the currents',
        );
      });
    });
  });

  given('[case4] a long body that exceeds one base64 line', () => {
    const body = 'a'.repeat(500);
    const raw = asRawMimeMessage({
      from: 'jelly@one.nheuron.com',
      to: 'alice@example.com',
      subject: 'long',
      body,
      inReplyTo: null,
    });

    when('[t0] built', () => {
      then('wraps the base64 body at 76 chars per rfc2045', () => {
        const [, encoded] = raw.split('\r\n\r\n');
        const lines = (encoded ?? '').split('\r\n');
        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
      });

      then('the body still round-trips intact', () => {
        expect(getDecodedBody({ raw })).toEqual(body);
      });
    });
  });

  given('[case5] a subject that attempts header injection', () => {
    const raw = asRawMimeMessage({
      from: 'jelly@one.nheuron.com',
      to: 'alice@example.com',
      subject: 'innocent\r\nBcc: attacker@evil.com',
      body: 'hi',
      inReplyTo: null,
    });

    when('[t0] built', () => {
      then('does not inject the smuggled header', () => {
        expect(raw).not.toContain('\r\nBcc:');
      });
    });
  });
});
