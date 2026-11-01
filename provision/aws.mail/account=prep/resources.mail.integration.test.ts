import { given, then, when } from 'test-fns';

import {
  MAIL_BUCKET,
  MAIL_DOMAIN,
  MAIL_MAILBOX,
  MAIL_OBJECT_KEY_PREFIX,
  MAIL_REGION,
} from '../../resources.common.mail';
import { getResourcesOfMail } from './resources.mail';

/**
 * .what = clamps on the declared mail resources — the walls, not the field list
 * .why = `getResourcesOfMail` is pure, so every claim the vision makes about the
 *   mailbox's blast radius is checkable without an apply. each case below is a wall
 *   from `philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`; a future edit
 *   that widens one goes red here rather than in production.
 *
 * .note = an INTEGRATION test rather than a unit test. `resources.mail.ts` calls
 *   `keyrack.source` at module load, so the mere import reads the filesystem — a
 *   remote boundary, which `rule.forbid.unit.remote-boundaries` puts out of scope
 *   for a unit test. the function under test is pure; its module is not.
 */
const ACCOUNT = '123456789012';

/** find one declared resource by a field that only it carries */
const getOneWith = <T>(input: {
  resources: any[];
  has: (resource: any) => boolean;
}): T => {
  const found = input.resources.filter(input.has);
  expect(found).toHaveLength(1); // ambiguity here would make every later assert a guess
  return found[0] as T;
};

describe('getResourcesOfMail', () => {
  given('[case1] the declared prep mailbox', () => {
    // a plain const, never `useBeforeAll`: the build is a pure in-memory call, so it
    // is neither expensive nor async, and `useBeforeAll` would hand back a deferred
    // proxy that does not forward array methods
    const resources = getResourcesOfMail({
      account: ACCOUNT,
      region: MAIL_REGION,
    }) as any[];

    when('[t0] the receipt rule is read', () => {
      then('it names ONE recipient, and it is the mailbox', () => {
        // the catch-all wall. a bare `MAIL_DOMAIN` here would read EVERY address on
        // the subdomain — the vision refuses it outright, and the refusal is one
        // character away from undone
        const rule = getOneWith<{ recipients: string[] }>({
          resources,
          has: (resource) => Array.isArray(resource.recipients),
        });
        expect(rule.recipients).toEqual([MAIL_MAILBOX]);
        expect(rule.recipients).not.toContain(MAIL_DOMAIN);
      });
    });

    when('[t1] the inbound bucket is read', () => {
      then('it has no lifecycle, so mail is readable at any age', () => {
        // a glacier staircase was declared here once and removed as a data-loss risk:
        // an object in DEEP_ARCHIVE cannot be read by GetObject without an hours-long
        // restore, so `gather.mail --since <a year ago>` would fail on exactly the
        // mail it was asked for
        const bucket = getOneWith<{ lifecycle: unknown }>({
          resources,
          has: (resource) => resource.name === MAIL_BUCKET,
        });
        expect(bucket.lifecycle).toBeNull();
      });
    });

    when('[t2] the bucket policy is read', () => {
      const policy = getOneWith<{ document: { statements: any[] } }>({
        resources,
        has: (resource) =>
          resource.document?.statements?.[0]?.principal?.service ===
          'ses.amazonaws.com',
      });

      then('the ses write is bounded by BOTH account and rule arn', () => {
        // either condition alone leaves a hole: SourceAccount alone lets any rule in
        // this account write; SourceArn alone is spoofable across accounts
        const statement = policy.document.statements[0]!;
        expect(statement.condition.StringEquals['aws:SourceAccount']).toBe(
          ACCOUNT,
        );
        expect(statement.condition.ArnLike['aws:SourceArn']).toContain(ACCOUNT);
        expect(statement.condition.ArnLike['aws:SourceArn']).toContain(
          MAIL_REGION,
        );
      });

      then('the write is scoped to the inbound prefix', () => {
        expect(policy.document.statements[0]!.resource).toBe(
          `arn:aws:s3:::${MAIL_BUCKET}/${MAIL_OBJECT_KEY_PREFIX}*`,
        );
      });
    });

    /**
     * .what = the clone role must be assumable by the identity that actually runs the clone
     * .why = ⚠️ the trust policy read `{ service: 'ec2.amazonaws.com' }`, carried over from a
     *   demo whose clone ran on an instance. ours runs LOCALLY, under the `AWS_PROFILE`
     *   keyrack sources — so no credential a local profile can hold could assume the role,
     *   and the whole grant beneath it was reachable by nobody. the mail infra was declared,
     *   applied, and impossible to exercise (`rule.require.behavior-intent-coverage`).
     *
     *   every OTHER wall here has a clamp; the door did not. that asymmetry is what the
     *   review caught: the tests checked how tightly the room was locked and never once
     *   checked that it had a way in.
     */
    when('[t2b] the clone role trust policy is read', () => {
      const role = getOneWith<{ policies: any[] }>({
        resources,
        has: (resource) => resource.name === 'nheuron-mail-clone',
      });

      then('a LOCAL principal in the mail account can assume it', () => {
        const trust = role.policies[0]!;
        expect(trust.action).toBe('sts:AssumeRole');
        expect(trust.principal.aws).toBe(`arn:aws:iam::${ACCOUNT}:root`);
      });

      then('it is NOT trusted to a service that never runs the clone', () => {
        // ⚠️ the teeth. an `ec2.amazonaws.com` principal is not merely over-narrow, it is
        // unreachable: the clone runs on a human's machine, never on an instance
        const trust = role.policies[0]!;
        expect(trust.principal.service).toBeUndefined();
      });

      then('the trust does not reach OUTSIDE the mail account', () => {
        // the delegation is to this account's own iam, which is one of the nested vaults.
        // a principal from any other account would dissolve that wall
        const trust = role.policies[0]!;
        expect(trust.principal.aws).toContain(ACCOUNT);
        expect(trust.principal).not.toBe('*');
      });
    });

    when('[t3] the clone grant is read', () => {
      const grant = getOneWith<{ document: { statements: any[] } }>({
        resources,
        has: (resource) => resource.name === 'mail-send-read',
      });

      then(
        'the object read is scoped to the prefix, not the whole bucket',
        () => {
          const read = grant.document.statements.find(
            (statement) => statement.action === 's3:GetObject',
          );
          expect(read.resource).toBe(
            `arn:aws:s3:::${MAIL_BUCKET}/${MAIL_OBJECT_KEY_PREFIX}*`,
          );
        },
      );

      then('the list is scoped to the prefix, not the whole bucket', () => {
        // ListBucket targets the bucket arn, so its resource cannot hold the prefix wall;
        // the s3:prefix condition does. without it a stolen credential lists every key
        const list = grant.document.statements.find(
          (statement) => statement.action === 's3:ListBucket',
        );
        expect(list.condition.StringLike['s3:prefix']).toBe(
          `${MAIL_OBJECT_KEY_PREFIX}*`,
        );
      });

      then('the send is scoped by from-address to the mail subdomain', () => {
        // ses:SendRawEmail takes `resource: '*'` — the from-address condition IS the
        // wall, so a reviewer must not read the wildcard resource as over-broad, and
        // a future edit must not drop the condition on the belief that the resource
        // holds it
        const send = grant.document.statements.find(
          (statement) => statement.action === 'ses:SendRawEmail',
        );
        expect(send.condition.StringLike['ses:FromAddress']).toBe(
          `*@${MAIL_DOMAIN}`,
        );
      });

      then('no statement grants a wildcard action', () => {
        grant.document.statements.forEach((statement) => {
          expect(statement.action).not.toBe('*');
          expect(statement.action).not.toContain(':*');
        });
      });
    });
  });

  given('[case2] credentials for a region the mail does not use', () => {
    when('[t0] the resources are built', () => {
      then('it refuses loudly rather than declare a split stack', () => {
        // teeth: this mismatch is SILENT in aws — the apply succeeds, the mx points at
        // one region, the bucket lives in another, and mail simply never arrives. the
        // throw is the only surface that reports it
        expect(() =>
          getResourcesOfMail({ account: ACCOUNT, region: 'eu-west-1' }),
        ).toThrow('the credential region does not match the mail region');
      });
    });
  });
});
