import { given, then, useBeforeAll, when } from 'test-fns';

import { getSesConfig } from './getSesConfig';

/**
 * .what = set the ses env vars for one case, then restore whatever was there
 * .why = keyrack populates these in a real run; a unit test stands in for it. the
 *   restore stops one case from leaving its env behind for the next.
 */
const withSesEnv = (input: {
  bucket: string | null;
  region: string | null;
  configSet: string | null;
}): void => {
  // collapsed to null at capture, so the restore path carries no undefined
  // (`rule.forbid.undefined-inputs`) — an unset var and an absent one are one state here
  const priors = {
    bucket: process.env.SES_MAIL_BUCKET ?? null,
    region: process.env.SES_REGION ?? null,
    configSet: process.env.SES_CONFIG_SET ?? null,
  };

  const apply = (values: Record<string, string | null>): void => {
    Object.entries(values).forEach(([key, value]) => {
      if (value) process.env[key] = value;
      else delete process.env[key];
    });
  };

  beforeAll(() =>
    apply({
      SES_MAIL_BUCKET: input.bucket,
      SES_REGION: input.region,
      SES_CONFIG_SET: input.configSet,
    }),
  );

  afterAll(() =>
    apply({
      SES_MAIL_BUCKET: priors.bucket,
      SES_REGION: priors.region,
      SES_CONFIG_SET: priors.configSet,
    }),
  );
};

describe('getSesConfig', () => {
  given('[case1] every value present', () => {
    withSesEnv({
      bucket: 'nheuron-mail-inbound-one',
      region: 'us-east-1',
      configSet: 'nheuron-mail-events',
    });

    when('[t0] the config is read', () => {
      const config = useBeforeAll(async () => getSesConfig());

      then('it carries the read values', () => {
        expect(config.bucket).toBe('nheuron-mail-inbound-one');
        expect(config.region).toBe('us-east-1');
        expect(config.prefix).toBe('inbound/');
      });

      then('it carries the send value', () => {
        expect(config.configSet).toBe('nheuron-mail-events');
      });
    });
  });

  given('[case2] the send-only config set is absent', () => {
    // teeth: `SES_CONFIG_SET` is named on each SEND — the read path never touches it.
    // when it was demanded at load, this whole case threw, and `getAuthStatus` read
    // that throw as `anonymous` — so a read-only mailbox reported as unauthenticated
    // over one key it does not use.
    withSesEnv({
      bucket: 'nheuron-mail-inbound-one',
      region: 'us-east-1',
      configSet: null,
    });

    when('[t0] the config is read', () => {
      const config = useBeforeAll(async () => getSesConfig());

      then('the read path is fully configured', () => {
        expect(config.bucket).toBe('nheuron-mail-inbound-one');
        expect(config.region).toBe('us-east-1');
        expect(config.prefix).toBe('inbound/');
      });

      then('the send value reads as absent rather than throws', () => {
        expect(config.configSet).toBeNull();
      });
    });
  });

  given('[case3] a read value is absent', () => {
    withSesEnv({
      bucket: null,
      region: 'us-east-1',
      configSet: 'nheuron-mail-events',
    });

    when('[t0] the config is read', () => {
      then('it throws, and names the unlock', () => {
        expect(() => getSesConfig()).toThrow('ses config absent');
      });
    });
  });
});
