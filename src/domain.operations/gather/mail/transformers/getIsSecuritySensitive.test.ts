import { given, then, when } from 'test-fns';

import { getIsSecuritySensitive } from './getIsSecuritySensitive';

describe('getIsSecuritySensitive', () => {
  // positive cases (should trigger obfuscation)
  const SENSITIVE_CASES = [
    {
      description: 'detects password reset in subject',
      given: {
        subject: 'Reset your password',
        snippet: 'Click here to reset',
      },
    },
    {
      description: 'detects MFA code in snippet',
      given: {
        subject: 'Security alert',
        snippet: 'Your MFA code is 123456',
      },
    },
    {
      description: 'detects OTP in body',
      given: {
        subject: 'Login notification',
        snippet: 'You requested access',
        body: 'Your OTP is 789012',
      },
    },
    {
      description: 'detects verification code',
      given: {
        subject: 'Verification code',
        snippet: 'Use this code to verify',
      },
    },
    {
      description: 'detects 2FA in subject',
      given: {
        subject: 'Enable 2FA on your account',
        snippet: 'Two-factor authentication',
      },
    },
    {
      description: 'detects sign-in alert',
      given: {
        subject: 'New sign-in detected',
        snippet: 'A new device signed in',
      },
    },
    {
      description: 'detects signin (no hyphen)',
      given: {
        subject: 'Signin from new location',
        snippet: 'We noticed a signin',
      },
    },
    {
      description: 'detects authentication code',
      given: {
        subject: 'Authentication required',
        snippet: 'Enter your authentication code',
      },
    },
    {
      description: 'detects security code',
      given: {
        subject: 'Your security code',
        snippet: 'Use this security code',
      },
    },
    {
      description: 'detects one-time password',
      given: {
        subject: 'Your one-time password',
        snippet: 'This code expires in 10 minutes',
      },
    },
    {
      description: 'detects account recovery',
      given: {
        subject: 'Account recovery options',
        snippet: 'Recover your account',
      },
    },
    {
      description: 'detects suspicious activity',
      given: {
        subject: 'Suspicious activity detected',
        snippet: 'We blocked a suspicious sign-in',
      },
    },
  ];

  // negative cases (should not trigger obfuscation)
  const SAFE_CASES = [
    {
      description: 'allows normal newsletter',
      given: {
        subject: 'Weekly newsletter',
        snippet: 'Check out our latest articles',
      },
    },
    {
      description: 'allows order confirmation',
      given: {
        subject: 'Your order has shipped',
        snippet: 'Track your package here',
      },
    },
    {
      description: 'allows calendar invite',
      given: {
        subject: 'Meeting: Project sync',
        snippet: 'Join the meeting at 2pm',
      },
    },
    {
      description: 'allows promotional email',
      given: {
        subject: 'Sale starts now!',
        snippet: '50% off everything',
      },
    },
    {
      description: 'allows personal email',
      given: {
        subject: 'Dinner plans',
        snippet: 'Are you free this weekend?',
      },
    },
  ];

  SENSITIVE_CASES.map((thisCase, index) =>
    given(`[case${index + 1}] ${thisCase.description}`, () => {
      when('[t0] the mail is classified', () => {
        then('it is security sensitive', () => {
          const result = getIsSecuritySensitive(thisCase.given);
          expect(result).toBe(true);
        });
      });
    }),
  );

  SAFE_CASES.map((thisCase, index) =>
    given(
      `[case${SENSITIVE_CASES.length + index + 1}] ${thisCase.description}`,
      () => {
        when('[t0] the mail is classified', () => {
          then('it is not security sensitive', () => {
            const result = getIsSecuritySensitive(thisCase.given);
            expect(result).toBe(false);
          });
        });
      },
    ),
  );
});
