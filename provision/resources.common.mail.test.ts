import { given, then, when } from 'test-fns';

import { SES_MAIL_OBJECT_KEY_PREFIX } from '@src/domain.operations/gather/adapters/ses/getSesConfig';

import {
  MAIL_BUCKET,
  MAIL_DOMAIN,
  MAIL_MAILBOX,
  MAIL_OBJECT_KEY_PREFIX,
} from './resources.common.mail';

/**
 * .what = clamps the contract between the wish that WRITES mail and the code that READS it
 * .why = the receipt rule declares an `objectKeyPrefix` and the gatherer lists that same
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
        then('the wish writes exactly where the gatherer reads', () => {
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

  given('[case2] the mailbox address, built from the mail domain', () => {
    when('[t0] the address is read', () => {
      then('it sits on the declared subdomain, never the apex', () => {
        // the apex `nheuron.com` mx must stay free for whatever else the domain serves —
        // an address built on the apex would silently claim it
        expect(MAIL_MAILBOX).toEqual(`jelly@${MAIL_DOMAIN}`);
        expect(MAIL_DOMAIN.endsWith('.nheuron.com')).toBe(true);
        expect(MAIL_DOMAIN).not.toEqual('nheuron.com');
      });
    });
  });

  given('[case3] the inbound bucket name', () => {
    when('[t0] the name is read', () => {
      then('it satisfies the s3 naming rules a create would enforce', () => {
        // an s3 bucket name is GLOBALLY unique and validated at create time. a name that
        // breaks these rules fails deep inside an apply, after earlier resources landed —
        // so it is checked here, where the fix costs one edit
        expect(MAIL_BUCKET).toMatch(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);
        expect(MAIL_BUCKET).not.toContain('_');
        expect(MAIL_BUCKET.toLowerCase()).toEqual(MAIL_BUCKET);
      });
    });
  });
});
