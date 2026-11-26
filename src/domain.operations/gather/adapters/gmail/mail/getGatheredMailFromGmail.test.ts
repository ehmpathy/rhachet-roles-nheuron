import { given, then, when } from 'test-fns';

import { GatheredMail } from '@src/domain.objects/GatheredMail';

import {
  type GmailMessage,
  getGatheredMailFromGmail,
} from './getGatheredMailFromGmail';

/**
 * .what = factory for minimal valid GmailMessage
 */
const createGmailMessage = (
  overrides: Partial<GmailMessage> = {},
): GmailMessage => ({
  id: 'msg_123',
  threadId: 'thread_456',
  labelIds: ['INBOX'],
  snippet: 'Hello, this is a test email...',
  internalDate: '1705320000000', // 2024-01-15T12:00:00Z
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'Subject', value: 'Test Subject' },
      { name: 'From', value: 'sender@example.com' },
    ],
    body: {
      data: Buffer.from('Hello, this is the body text').toString('base64'),
      size: 28,
    },
  },
  ...overrides,
});

describe('getGatheredMailFromGmail', () => {
  given('[case1] plain text email', () => {
    const gmailMessage = createGmailMessage();

    when('[t0] converted to domain object', () => {
      then('extracts exid from message id', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.exid).toBe('msg_123');
      });

      then('extracts subject from headers', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.subject).toBe('Test Subject');
      });

      then('extracts sender from From header', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.sender.address).toBe('sender@example.com');
        expect(mail.sender.mechanism).toBe('gmail');
      });

      then('sets ceiver from input address', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.ceiver.address).toBe('me@gmail.com');
        expect(mail.ceiver.mechanism).toBe('gmail');
      });

      then('decodes base64 body', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.body).toBe('Hello, this is the body text');
      });

      then('parses internalDate as Date', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.deliveredAt).toEqual(new Date('2024-01-15T12:00:00.000Z'));
      });

      then('copies labels', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.labels).toEqual(['INBOX']);
      });

      then('is not obfuscated', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.isObfuscated).toBe(false);
      });

      then('returns GatheredMail instance', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail).toBeInstanceOf(GatheredMail);
      });
    });
  });

  given('[case2] email with Name <email> format sender', () => {
    const gmailMessage = createGmailMessage({
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'Subject', value: 'Test' },
          { name: 'From', value: 'John Doe <john@example.com>' },
        ],
        body: { data: Buffer.from('body').toString('base64'), size: 4 },
      },
    });

    when('[t0] converted', () => {
      then('extracts email from angle brackets', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.sender.address).toBe('john@example.com');
      });
    });
  });

  given('[case3] multipart email with text/plain part', () => {
    const gmailMessage = createGmailMessage({
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'Subject', value: 'Multipart Test' },
          { name: 'From', value: 'sender@example.com' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              data: Buffer.from('Plain text body').toString('base64'),
              size: 15,
            },
          },
          {
            mimeType: 'text/html',
            body: {
              data: Buffer.from('<p>HTML body</p>').toString('base64'),
              size: 16,
            },
          },
        ],
      },
    });

    when('[t0] converted', () => {
      then('prefers text/plain over text/html', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.body).toBe('Plain text body');
      });
    });
  });

  given('[case4] multipart email with only text/html', () => {
    const gmailMessage = createGmailMessage({
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'Subject', value: 'HTML Only' },
          { name: 'From', value: 'sender@example.com' },
        ],
        parts: [
          {
            mimeType: 'text/html',
            body: {
              data: Buffer.from('<p>HTML body</p>').toString('base64'),
              size: 16,
            },
          },
        ],
      },
    });

    when('[t0] converted', () => {
      then('falls back to text/html', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.body).toBe('<p>HTML body</p>');
      });
    });
  });

  given('[case5] email with attachments', () => {
    const gmailMessage = createGmailMessage({
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'Subject', value: 'With Attachments' },
          { name: 'From', value: 'sender@example.com' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              data: Buffer.from('Email body').toString('base64'),
              size: 10,
            },
          },
          {
            mimeType: 'application/pdf',
            filename: 'report.pdf',
            body: { size: 12345 },
          },
          {
            mimeType: 'image/png',
            filename: 'screenshot.png',
            body: { size: 54321 },
          },
        ],
      },
    });

    when('[t0] converted', () => {
      then('extracts attachment filenames', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.attachments).toEqual(['report.pdf', 'screenshot.png']);
      });
    });
  });

  given('[case6] security sensitive email (password reset)', () => {
    const gmailMessage = createGmailMessage({
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'Subject', value: 'Password Reset Request' },
          { name: 'From', value: 'noreply@google.com' },
        ],
        body: {
          data: Buffer.from('Click here to reset your password').toString(
            'base64',
          ),
          size: 33,
        },
      },
      snippet: 'Click here to reset your password',
    });

    when('[t0] converted', () => {
      then('obfuscates subject', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.subject).toBe('[security-sensitive content obfuscated]');
      });

      then('obfuscates snippet', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.snippet).toBe('[security-sensitive content obfuscated]');
      });

      then('obfuscates body', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.body).toBe('[security-sensitive content obfuscated]');
      });

      then('sets isObfuscated to true', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.isObfuscated).toBe(true);
      });
    });
  });

  given('[case7] email with no body', () => {
    const gmailMessage = createGmailMessage({
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'Subject', value: 'No Body' },
          { name: 'From', value: 'sender@example.com' },
        ],
      },
    });

    when('[t0] converted', () => {
      then('body is null', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.body).toBeNull();
      });
    });
  });

  given('[case8] email with no labels', () => {
    const gmailMessage = createGmailMessage({
      labelIds: [],
    });

    when('[t0] converted', () => {
      then('labels is empty array', () => {
        const mail = getGatheredMailFromGmail({
          gmailMessage,
          ceiverAddress: 'me@gmail.com',
        });
        expect(mail.labels).toEqual([]);
      });
    });
  });
});
