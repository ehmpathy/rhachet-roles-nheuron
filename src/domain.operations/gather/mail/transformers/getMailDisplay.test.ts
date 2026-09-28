import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { MAIL_CONTENT_OBFUSCATED } from './getMailContentVisible';
import { getMailDisplay } from './getMailDisplay';

const createMail = (overrides: Partial<GatheredMail> = {}): GatheredMail =>
  new GatheredMail({
    exid: 'msg_123',
    ceiver: new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'test@gmail.com',
    }),
    sender: new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'sender@gmail.com',
    }),
    subject: 'Test Subject',
    snippet: 'Test snippet preview',
    body: 'Full body content here',
    deliveredAt: new Date('2024-01-15T12:00:00Z'),
    labels: [],
    attachments: [],
    isObfuscated: false,
    ...overrides,
  });

describe('getMailDisplay', () => {
  describe('non-obfuscated mail', () => {
    test('returns original content', () => {
      const mail = createMail();
      const result = getMailDisplay({ mail });

      expect(result.subject).toBe('Test Subject');
      expect(result.snippet).toBe('Test snippet preview');
      expect(result.body).toBe('Full body content here');
    });

    test('preserves null body', () => {
      const mail = createMail({ body: null });
      const result = getMailDisplay({ mail });

      expect(result.body).toBeNull();
    });
  });

  describe('obfuscated mail', () => {
    test('every field carries the ONE shared replacement literal', () => {
      const mail = createMail({ isObfuscated: true });
      const result = getMailDisplay({ mail });

      // ⚠️ asserted against the exported constant, never a copy of its text. this file
      // once pinned two literals of its own — `[OBFUSCATED: security-sensitive content]`
      // and `[OBFUSCATED]` — which had drifted from the single source, so the string a
      // human saw was never the declared one. a test that re-types the literal cannot
      // catch that drift; a test that imports it cannot miss it
      expect(result.subject).toBe(MAIL_CONTENT_OBFUSCATED);
      expect(result.snippet).toBe(MAIL_CONTENT_OBFUSCATED);
      expect(result.body).toBe(MAIL_CONTENT_OBFUSCATED);
    });

    test('an absent body is replaced too — it does not stay null', () => {
      const mail = createMail({ isObfuscated: true, body: null });
      const result = getMailDisplay({ mail });

      // ⚠️ this reverses what this file previously asserted. a null body among three
      // replaced fields tells a reader THIS obfuscated mail differed from the others,
      // which is a partial disclosure of the exact kind the obfuscation exists to
      // prevent. the single source already ruled the other way
      // (`getMailContentVisible.test.ts` — "the replacement is uniform across all three")
      expect(result.body).toBe(MAIL_CONTENT_OBFUSCATED);
    });
  });
});
