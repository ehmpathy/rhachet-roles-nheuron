import {
  getMailContentVisible,
  MAIL_CONTENT_OBFUSCATED,
} from './getMailContentVisible';

const RAW = {
  subject: 'your verification code is 123456',
  snippet: 'code 123456 expires in 10 minutes',
  body: 'full body with the code 123456 in it',
};

describe('getMailContentVisible', () => {
  describe('a security-sensitive mail', () => {
    const visible = getMailContentVisible({
      ...RAW,
      isSecuritySensitive: true,
    });

    test('every field is replaced — none of the three leaks', () => {
      // ⚠️ the teeth, and they must be read as one claim. obfuscate two of three and the
      // mail still discloses its secret through the survivor — which is worse than no
      // obfuscation, because the output claims to have hidden it
      expect(visible.subject).toEqual(MAIL_CONTENT_OBFUSCATED);
      expect(visible.snippet).toEqual(MAIL_CONTENT_OBFUSCATED);
      expect(visible.body).toEqual(MAIL_CONTENT_OBFUSCATED);
    });

    test('the secret appears in no field', () => {
      // asserted on the VALUE rather than the field names, so a future field added to the
      // returned shape without obfuscation is caught here too
      expect(JSON.stringify(visible)).not.toContain('123456');
    });
  });

  describe('an ordinary mail', () => {
    const visible = getMailContentVisible({
      ...RAW,
      isSecuritySensitive: false,
    });

    test('every field passes through untouched', () => {
      expect(visible).toEqual(RAW);
    });
  });

  describe('a mail with no body', () => {
    test('a null body stays null rather than becomes a string', () => {
      const visible = getMailContentVisible({
        subject: 'hello',
        snippet: 'hi',
        body: null,
        isSecuritySensitive: false,
      });

      // an absent body is a real state, spelled null (`rule.forbid.undefined-inputs`)
      expect(visible.body).toBeNull();
    });

    test('a null body IS replaced when the mail is sensitive', () => {
      const visible = getMailContentVisible({
        subject: 'your code is 123456',
        snippet: 'code 123456',
        body: null,
        isSecuritySensitive: true,
      });

      // ⚠️ deliberate: the replacement is uniform across all three, so a reader cannot infer
      // from an absent body that this mail differed from any other obfuscated one
      expect(visible.body).toEqual(MAIL_CONTENT_OBFUSCATED);
    });
  });
});
