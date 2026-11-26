import { given, then, when } from 'test-fns';

import {
  MAIL_BY_ENV,
  MAIL_OBJECT_KEY_PREFIX,
  MAIL_REGION,
  type MailEnv,
} from '../resources.common.mail';
import { getResourcesOfMail } from './getResourcesOfMail';

/**
 * .what = clamps on the declared mail resources — the walls, not the field list
 * .why = `getResourcesOfMail` is pure, so every claim the vision makes about the mailbox's
 *   blast radius is checkable without an apply. each case below is a wall from
 *   `philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`; a future edit that widens one
 *   goes red here rather than in production. every wall is checked for both envs.
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

const ENVS: MailEnv[] = ['prep', 'prod'];

describe('getResourcesOfMail', () => {
  ENVS.forEach((env) => {
    const { domains, bucket } = MAIL_BY_ENV[env];
    const mailboxes = domains.map((domain) => `jelly@${domain}`);

    given(`[case1] the declared ${env} mailbox`, () => {
      // a plain const, never `useBeforeAll`: the build is a pure in-memory call, so it is
      // neither expensive nor async, and `useBeforeAll` would hand back a deferred proxy that
      // does not forward array methods
      const resources = getResourcesOfMail({
        env,
        account: ACCOUNT,
        region: MAIL_REGION,
      }) as any[];

      when('[t0] the identities are read', () => {
        then('there is one ses identity per domain of the env', () => {
          // ses verifies each domain on its own, so an alias needs its own identity — never a
          // cname, which cannot share a name with the mx + txt records
          const identities = resources
            .filter((resource) => typeof resource.identity === 'string')
            .map((resource) => resource.identity);
          expect(identities).toEqual(domains);
        });
      });

      when('[t1] the receipt rule is read', () => {
        then('it names jelly on each domain, and no other recipient', () => {
          // the catch-all wall. a bare domain here would read EVERY address on the subdomain
          // — the vision refuses it outright, and the refusal is one edit away from undone
          const rule = getOneWith<{ recipients: string[] }>({
            resources,
            has: (resource) => Array.isArray(resource.recipients),
          });
          expect(rule.recipients).toEqual(mailboxes);
          domains.forEach((domain) =>
            expect(rule.recipients).not.toContain(domain),
          );
        });
      });

      when('[t2] the inbound bucket is read', () => {
        then('it has no lifecycle, so mail is readable at any age', () => {
          // an object in DEEP_ARCHIVE cannot be read by GetObject without an hours-long
          // restore, so `gather.mail --since <a year ago>` would fail on exactly that mail
          const store = getOneWith<{ lifecycle: unknown }>({
            resources,
            has: (resource) => resource.name === bucket,
          });
          expect(store.lifecycle).toBeNull();
        });
      });

      when('[t3] the bucket policy is read', () => {
        const policy = getOneWith<{ document: { statements: any[] } }>({
          resources,
          has: (resource) =>
            resource.document?.statements?.[0]?.principal?.service ===
            'ses.amazonaws.com',
        });

        then('the ses write is bounded by BOTH account and rule arn', () => {
          // either condition alone leaves a hole: SourceAccount alone lets any rule in this
          // account write; SourceArn alone is spoofable across accounts
          const statement = policy.document.statements[0]!;
          expect(statement.condition.StringEquals['aws:SourceAccount']).toBe(
            ACCOUNT,
          );
          expect(statement.condition.ArnLike['aws:SourceArn']).toContain(
            ACCOUNT,
          );
          expect(statement.condition.ArnLike['aws:SourceArn']).toContain(
            MAIL_REGION,
          );
        });

        then('the write is scoped to the inbound prefix', () => {
          expect(policy.document.statements[0]!.resource).toBe(
            `arn:aws:s3:::${bucket}/${MAIL_OBJECT_KEY_PREFIX}*`,
          );
        });
      });

      /**
       * .what = the clone role must be assumable by the identity that actually runs the clone
       * .why = the clone runs LOCALLY, under the `AWS_PROFILE` keyrack sources. an
       *   `ec2.amazonaws.com` trust would leave the grant beneath it reachable by nobody
       *   (`rule.require.behavior-intent-coverage`) — every other wall has a clamp; so does the door
       */
      when('[t4] the clone role trust policy is read', () => {
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
          expect(role.policies[0]!.principal.service).toBeUndefined();
        });

        then('the trust does not reach OUTSIDE the mail account', () => {
          // the delegation is to this account's own iam, one of the nested vaults.
          // a principal from any other account would dissolve that wall
          const trust = role.policies[0]!;
          expect(trust.principal.aws).toContain(ACCOUNT);
          expect(trust.principal).not.toBe('*');
        });
      });

      when('[t5] the clone grant is read', () => {
        const grant = getOneWith<{ document: { statements: any[] } }>({
          resources,
          has: (resource) => resource.name === 'mail-send-read',
        });

        then('the object read is scoped to the prefix', () => {
          const read = grant.document.statements.find(
            (statement) => statement.action === 's3:GetObject',
          );
          expect(read.resource).toBe(
            `arn:aws:s3:::${bucket}/${MAIL_OBJECT_KEY_PREFIX}*`,
          );
        });

        then('the list is scoped to the prefix', () => {
          // ListBucket targets the bucket arn, so the s3:prefix condition holds the wall
          const list = grant.document.statements.find(
            (statement) => statement.action === 's3:ListBucket',
          );
          expect(list.condition.StringLike['s3:prefix']).toBe(
            `${MAIL_OBJECT_KEY_PREFIX}*`,
          );
        });

        then('the send is scoped by from-address to the env domains', () => {
          // ses:SendRawEmail takes `resource: '*'` — the from-address condition IS the wall
          const send = grant.document.statements.find(
            (statement) => statement.action === 'ses:SendRawEmail',
          );
          expect(send.condition.StringLike['ses:FromAddress']).toEqual(
            domains.map((domain) => `*@${domain}`),
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
  });

  given('[case2] credentials for a region the mail does not use', () => {
    when('[t0] the resources are built', () => {
      then('it refuses loudly rather than declare a split stack', () => {
        // this mismatch is SILENT in aws — the apply succeeds, the mx points at one region,
        // the bucket lives in another, and mail never arrives. the throw is the only surface
        expect(() =>
          getResourcesOfMail({
            env: 'prep',
            account: ACCOUNT,
            region: 'eu-west-1',
          }),
        ).toThrow('the credential region does not match the mail region');
      });
    });
  });
});
