import { BadRequestError } from 'helpful-errors';
import { getError, given, then, useBeforeAll, when } from 'test-fns';

import {
  getPlanOfWishLive,
  isProvisionLiveTargeted,
} from '../getPlanOfWishLive';
import { getProviders, getResources } from './resources.mail.dns';

/**
 * .what = blank a set of env keys for one case, then restore whatever was there
 * .why = the wish reads its inputs from the keyrack-sourced env. the refusal cases assert the
 *   NOT-FILLED contract, so they must not depend on whether this machine holds them
 */
const withEnvBlank = (input: { keys: string[] }): void => {
  const priors = Object.fromEntries(
    input.keys.map((key) => [key, process.env[key] ?? null]),
  );

  beforeAll(() => {
    input.keys.forEach((key) => {
      delete process.env[key];
    });
  });

  afterAll(() => {
    Object.entries(priors).forEach(([key, value]) => {
      if (value === null) {
        delete process.env[key];
        return;
      }
      process.env[key] = value;
    });
  });
};

/**
 * .what = clamps the two apply-time refusals of the cloudflare mail dns wish
 * .why = each is what a human meets when they run the wish out of order. an edit that dropped
 *   the sequenced hint would surface as a bare "absent" at an apply; these go red first.
 *
 * .note = an INTEGRATION test: the module calls `keyrack.source` at load, which reads the
 *   filesystem. neither case reaches cloudflare — each guard fires before any provider call.
 */
describe('resources.mail.dns', () => {
  given('[case1] cloudflare credentials are not filled', () => {
    withEnvBlank({ keys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] });

    when('[t0] the providers are requested', () => {
      // wrapped in an object: useBeforeAll's deferred proxy would hide the error's class
      const result = useBeforeAll(async () => ({
        error: await getError(getProviders()),
      }));

      then('it refuses with a caller-must-fix error', () => {
        expect(result.error).toBeInstanceOf(BadRequestError);
        expect(result.error.message).toContain('cloudflare credentials absent');
      });

      then('it names the token to create and the keyrack fill', () => {
        expect(result.error.message).toContain('Zone:Read + DNS:Edit');
        expect(result.error.message).toContain(
          'rhx keyrack fill --owner ehmpath --env prep',
        );
      });

      then('it reports which of the two keys are present', () => {
        expect(result.error.message).toContain('"apiToken": false');
        expect(result.error.message).toContain('"accountId": false');
      });
    });
  });

  given('[case2] the dkim tokens are not filled yet', () => {
    withEnvBlank({ keys: ['SES_DKIM_TOKENS'] });

    when('[t0] the resources are requested', () => {
      const result = useBeforeAll(async () => ({
        error: await getError(getResources()),
      }));

      then('it refuses with a caller-must-fix error', () => {
        expect(result.error).toBeInstanceOf(BadRequestError);
        expect(result.error.message).toContain('SES_DKIM_TOKENS is empty');
      });

      then('it names the apply order: the aws mail wish first', () => {
        expect(result.error.message).toContain(
          'apply provision/aws.mail/account=prep/resources.mail.ts first',
        );
      });
    });
  });

  /**
   * .what = the real call: plan the wish against the live cloudflare api
   * .why = the refusals above never reach cloudflare. this proves the token's scopes, the
   *   zone, and every declared record shape round-trip against the real dns api. it runs
   *   only under `TEST_LIVE=cloudflare`; targeted with no token, the plan fails loud
   */
  given.runIf(isProvisionLiveTargeted({ mechanism: 'cloudflare' }))(
    '[case3] the prep keyrack is unlocked for a live cloudflare run (TEST_LIVE=cloudflare)',
    () => {
      when('[t0] the wish is planned against the live zone', () => {
        const result = useBeforeAll(async () => ({
          plan: getPlanOfWishLive({
            wish: 'provision/cloudflare/resources.mail.dns.ts',
          }),
          declared: await getResources(),
        }));

        then('the plan holds one change per declared resource', () => {
          expect(result.plan.changes).toHaveLength(result.declared.length);
        });

        then('the plan names the zone and the dns records', () => {
          const classes = result.plan.changes.map(
            (change) => change.forResource.class,
          );
          expect(classes).toContain('DeclaredCloudflareDomainZone');
          expect(
            classes.filter((name) => name !== 'DeclaredCloudflareDomainZone'),
          ).toHaveLength(result.declared.length - 1);
        });
      });
    },
  );
});
