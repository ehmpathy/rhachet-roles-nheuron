import { given, then, when } from 'test-fns';

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
  given('[case1] a security-sensitive mail', () => {
    when('[t0] the visible content is derived', () => {
      const visible = getMailContentVisible({
        ...RAW,
        isSecuritySensitive: true,
      });

      then('every field is replaced — none of the three leaks', () => {
        // ⚠️ the teeth, and they must be read as one claim. obfuscate two of three and the
        // mail still discloses its secret through the survivor — which is worse than no
        // obfuscation, because the output claims to have hidden it
        expect(visible.subject).toEqual(MAIL_CONTENT_OBFUSCATED);
        expect(visible.snippet).toEqual(MAIL_CONTENT_OBFUSCATED);
        expect(visible.body).toEqual(MAIL_CONTENT_OBFUSCATED);
      });

      then('the secret appears in no field', () => {
        // asserted on the VALUE rather than the field names, so a future field added to the
        // returned shape without obfuscation is caught here too
        expect(JSON.stringify(visible)).not.toContain('123456');
      });
    });
  });

  given('[case2] an ordinary mail', () => {
    when('[t0] the visible content is derived', () => {
      const visible = getMailContentVisible({
        ...RAW,
        isSecuritySensitive: false,
      });

      then('every field passes through untouched', () => {
        expect(visible).toEqual(RAW);
      });
    });
  });

  given('[case3] a mail with no body', () => {
    when('[t0] the mail is ordinary', () => {
      then('a null body stays null rather than becomes a string', () => {
        const visible = getMailContentVisible({
          subject: 'hello',
          snippet: 'hi',
          body: null,
          isSecuritySensitive: false,
        });

        // an absent body is a real state, spelled null (`rule.forbid.undefined-inputs`)
        expect(visible.body).toBeNull();
      });
    });

    when('[t1] the mail is sensitive', () => {
      then('a null body stays null; subject and snippet are replaced', () => {
        const visible = getMailContentVisible({
          subject: 'your code is 123456',
          snippet: 'code 123456',
          body: null,
          isSecuritySensitive: true,
        });

        // an absent body has no content to hide; null is its real state (fulcrum F17)
        expect(visible.body).toBeNull();
        expect(visible.subject).toEqual(MAIL_CONTENT_OBFUSCATED);
        expect(visible.snippet).toEqual(MAIL_CONTENT_OBFUSCATED);
      });
    });
  });
});
