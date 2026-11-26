import { given, then, when } from 'test-fns';

import { SES_MAIL_OBJECT_KEY_PREFIX } from '@src/domain.operations/gather/adapters/ses/getSesConfig';

import {
  MAIL_BY_ENV,
  MAIL_OBJECT_KEY_PREFIX,
  MAIL_ZONE,
} from './resources.common.mail';

/**
 * .what = clamps the contract between the wish that WRITES mail and the code that READS it
 * .why = the receipt rule declares an `objectKeyPrefix` and the collector lists that same
 *   prefix. they live either side of an apply boundary, so only agreement makes them work —
 *   and disagreement fails in the cruelest way available: the list returns zero keys, the
 *   gather exits 0, and the mailbox reads as EMPTY rather than as misconfigured
 *   (`rule.forbid.failhide`). no error, no log, no clue.
 *
 * .note = the two halves were guarded by PROSE — each constant carried a "MUST equal <the
 *   other>" note and an invitation to grep. a comment guards a reader who reads it; it does
 *   not guard the edit that changes one side and never opens the other. this is that guard,
 *   mechanized (`rule.require.clamp-edge-cases`).
 *
 * .note = a test rather than a shared import, deliberately. one module — `provision/`
 *   importing the src constant — would make drift IMPOSSIBLE rather than merely caught, and
 *   the direction is sound (`provision/ → src/`; the reverse would break the published
 *   package, which ships no provision dir). it is declined because the apply runs the wish
 *   outside jest, where the `@src/*` path alias may go unmapped — and a broken apply is a
 *   worse fault than the drift it would prevent. the apply cannot be exercised here, so the
 *   safer half is taken and the reason recorded rather than left as a silent choice.
 */
describe('resources.common.mail', () => {
  given(
    '[case1] the object key prefix, declared on both sides of the apply',
    () => {
      when('[t0] the two halves are compared', () => {
        then('the wish writes exactly where the collector reads', () => {
          // ⚠️ the teeth. change one side alone and this goes red — where the live symptom
          // would have been a silently empty mailbox
          expect(MAIL_OBJECT_KEY_PREFIX).toEqual(SES_MAIL_OBJECT_KEY_PREFIX);
        });
      });

      when('[t1] the prefix shape is read', () => {
        then('it ends with a slash, so it names a folder not a sibling', () => {
          // `inbound` (no slash) would also match `inbound-archive/…` on an s3 list, which
          // widens the read past what the bucket policy grants
          expect(MAIL_OBJECT_KEY_PREFIX.endsWith('/')).toBe(true);
        });

        then('it does NOT lead with a slash — s3 keys are not paths', () => {
          // a leading slash makes a real, different key: s3 would store `//inbound/…`
          expect(MAIL_OBJECT_KEY_PREFIX.startsWith('/')).toBe(false);
        });
      });
    },
  );

  given('[case2] the mail domains of each env', () => {
    when('[t0] the domains are read', () => {
      then('each sits on a subdomain of the zone, never the apex', () => {
        // the apex `nheuron.com` mx must stay free for whatever else the domain serves —
        // a mailbox built on the apex would silently claim it
        const domains = Object.values(MAIL_BY_ENV).flatMap(
          (mail) => mail.domains,
        );
        domains.forEach((domain) => {
          expect(domain.endsWith(`.${MAIL_ZONE}`)).toBe(true);
          expect(domain).not.toEqual(MAIL_ZONE);
        });
      });

      then('no domain is claimed by two envs', () => {
        // a domain identity in two accounts would split its mail across two buckets by mx race
        const domains = Object.values(MAIL_BY_ENV).flatMap(
          (mail) => mail.domains,
        );
        expect(new Set(domains).size).toEqual(domains.length);
      });

      then('prod holds the apex alias beside its own subdomain', () => {
        expect(MAIL_BY_ENV.prod.domains).toEqual([
          'one.prod.nheuron.com',
          'one.nheuron.com',
        ]);
        expect(MAIL_BY_ENV.prep.domains).toEqual(['one.prep.nheuron.com']);
      });
    });
  });

  given('[case3] the inbound bucket of each env', () => {
    when('[t0] the names are read', () => {
      then('each satisfies the s3 name rules a create would enforce', () => {
        // an s3 bucket name is GLOBALLY unique and validated at create time. a name that
        // breaks these rules fails deep inside an apply, after earlier resources landed —
        // so it is checked here, where the fix costs one edit
        Object.values(MAIL_BY_ENV).forEach(({ bucket }) => {
          expect(bucket).toMatch(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);
          expect(bucket).not.toContain('_');
          expect(bucket.toLowerCase()).toEqual(bucket);
        });
      });

      then('the envs never share a bucket', () => {
        expect(MAIL_BY_ENV.prep.bucket).not.toEqual(MAIL_BY_ENV.prod.bucket);
      });
    });
  });
});
