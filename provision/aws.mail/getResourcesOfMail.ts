import {
  asSesReceiptRuleArn,
  DeclaredAwsIamRole,
  DeclaredAwsIamRolePolicyAttachedInline,
  DeclaredAwsS3Bucket,
  DeclaredAwsS3BucketPolicy,
  DeclaredAwsSesAccountDetails,
  DeclaredAwsSesConfigurationSet,
  DeclaredAwsSesConfigurationSetEventDestination,
  DeclaredAwsSesEmailIdentity,
  DeclaredAwsSesReceiptRule,
  DeclaredAwsSesReceiptRuleSet,
} from 'declastruct-aws';
import { type DomainEntity, RefByUnique } from 'domain-objects';
import { BadRequestError } from 'helpful-errors';

import {
  MAIL_BY_ENV,
  MAIL_CONFIG_SET,
  MAIL_LOCAL_PART,
  MAIL_OBJECT_KEY_PREFIX,
  MAIL_REGION,
  MAIL_RULE,
  MAIL_RULE_SET,
  type MailEnv,
} from '../resources.common.mail';
import { asIamRootPrincipalArn } from './asIamRootPrincipalArn';
import { asS3BucketArn } from './asS3BucketArn';
import { asS3ObjectArn } from './asS3ObjectArn';

/**
 * .what = one env's jelly mailbox — a clone's own address that receives to s3 and sends out,
 *   authed by a dedicated declared iam role. one call per member account (prep, prod)
 * .why = a clone warrants a real address rather than an invocation. this is the one connection
 *   into the external brain, made concrete (see `domain.terms/one.md`). it beats the google
 *   service-account path, which needs domain-wide delegation over EVERY org mailbox.
 *
 * .note = each domain is a dedicated SUBDOMAIN, never the apex. that keeps the `nheuron.com`
 *   apex mx free for whatever else the domain serves, and isolates the blast radius to the
 *   subdomain — the third wall of the nest (`philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`).
 *
 * .note = an env may hold several domains (prod: its own subdomain plus the `one.nheuron.com`
 *   alias). each gets its own ses identity — ses verifies each domain on its own — and one
 *   receipt rule names jelly at every one of them, into one bucket. one mailbox, many addresses.
 *
 * .note = the receipt rule names jelly's addresses ONLY, never a domain catch-all. a catch-all
 *   would read every address on the subdomain — more than one clone needs. the honest cost: a
 *   second clone here owes its own rule.
 *
 * .note = a domain identity's apply emits the dns records the domain owes — v2 easy dkim: an MX
 *   (inbound), an SPF TXT, and 3 dkim CNAMEs. there is NO separate `_amazonses` TXT ownership
 *   token (that was the v1 shape). the identity stays `verificationStatus: unresolved` until
 *   that dns propagates. `rhx mail.dns.records.get --env <env>` prints them.
 *
 * @see .behavior/v2026_07_30.collect-from-ses/1.vision.yield.md — deliverable (a)
 * @see readme.md for prereqs + apply steps
 */
export const getResourcesOfMail = (input: {
  env: MailEnv;
  account: string;
  region: string;
}): DomainEntity<any>[] => {
  const { env, account, region } = input;
  const { domains, bucket } = MAIL_BY_ENV[env];

  // the mx target each domain owes is keyed to MAIL_REGION, while the bucket + rules land in
  // whatever region the credentials name. a mismatch is SILENT — the apply succeeds and mail
  // simply never arrives — so refuse it loudly instead
  if (region !== MAIL_REGION)
    BadRequestError.throw(
      'the credential region does not match the mail region',
      {
        regionOfCredentials: region,
        regionOfMail: MAIL_REGION,
        hint: `set AWS_REGION=${MAIL_REGION} (or the profile's region) — the ses inbound mx, the receipt rules, and the bucket must all share one region`,
      },
    );

  // jelly's address on each domain of this env — receive (the rule names each) and send-from
  // (each covered by its verified DOMAIN identity, so none owes an email identity of its own)
  const mailboxes = domains.map((domain) => `${MAIL_LOCAL_PART}@${domain}`);

  // the bucket policy's SourceArn must name the RECEIPT RULE arn (deterministic from names)
  const receiptRuleArn = asSesReceiptRuleArn({
    region,
    account,
    ruleSetName: MAIL_RULE_SET,
    ruleName: MAIL_RULE,
  });

  // 1. one domain identity per domain — each emits the dkim tokens its dns owes
  const identities = domains.map((domain) =>
    DeclaredAwsSesEmailIdentity.as({
      identity: domain,
      dkim: 'enabled',
      mailFrom: null,
      tags: { managedBy: 'declastruct', purpose: 'mail' },
    }),
  );

  // 2. the inbound store — `lifecycle: null` = persist, every object in Standard.
  //    a glacier staircase would be the cheaper shape, and it is deliberately NOT taken: an
  //    object in DEEP_ARCHIVE cannot be read without a restore that takes hours, so
  //    `gather.mail --since <a year ago>` would fail on the archived mail. a clone must be able
  //    to read its own memory at any age. the vision judged storage cost a non-issue at a
  //    clone's volume, so no cost cut here is worth that price.
  //    `access.public: 'blocked'` = all four public-access controls on: the bucket holds private
  //    mail, and ses writes via the bucket policy's service principal, which a public block
  //    never touches
  const store = DeclaredAwsS3Bucket.as({
    name: bucket,
    access: { public: 'blocked' },
    lifecycle: null,
    tags: { managedBy: 'declastruct', purpose: 'mail' },
  });

  // 3. the bucket policy — allow SES (this account + this rule ONLY) to PutObject into inbound/
  const storePolicy = DeclaredAwsS3BucketPolicy.as({
    bucket: RefByUnique.as<typeof DeclaredAwsS3Bucket>({ name: bucket }),
    document: {
      statements: [
        {
          sid: 'AllowSesPut',
          effect: 'Allow',
          principal: { service: 'ses.amazonaws.com' },
          action: 's3:PutObject',
          resource: asS3ObjectArn({ bucket, prefix: MAIL_OBJECT_KEY_PREFIX }),
          condition: {
            StringEquals: { 'aws:SourceAccount': account },
            ArnLike: { 'aws:SourceArn': receiptRuleArn },
          },
        },
      ],
    },
  });

  // 4. the receipt rule set — the account's active set (aws allows exactly one per region)
  const ruleSet = DeclaredAwsSesReceiptRuleSet.as({
    name: MAIL_RULE_SET,
    active: true,
  });

  // 5. the receipt rule — route inbound mail for jelly's addresses (those alone) to the prefix
  const rule = DeclaredAwsSesReceiptRule.as({
    ruleSet: RefByUnique.as<typeof DeclaredAwsSesReceiptRuleSet>({
      name: MAIL_RULE_SET,
    }),
    name: MAIL_RULE,
    enabled: true,
    recipients: mailboxes,
    actions: [
      {
        s3: {
          bucket: RefByUnique.as<typeof DeclaredAwsS3Bucket>({ name: bucket }),
          objectKeyPrefix: MAIL_OBJECT_KEY_PREFIX,
          topic: null,
          kmsKeyArn: null,
        },
        sns: null,
        lambda: null,
        bounce: null,
        stop: null,
        addHeader: null,
        workmail: null,
        connect: null,
      },
    ],
    // aws materializes TlsPolicy to 'Optional' by default (it is never absent), so declare the
    // real default explicitly — a null desired would drift to a perpetual UPDATE
    tlsPolicy: 'Optional',
    scanEnabled: true,
  });

  // 6. the clone's dedicated role + a least-privilege grant — the fifth wall of the nest.
  //    read exactly one prefix, send as exactly this env's domains; a stolen credential cannot roam
  //
  // ⚠️ THE TRUST PRINCIPAL IS THE ACCOUNT, because the clone runs LOCALLY.
  //   `gather.mail` runs on a human's machine under the `AWS_PROFILE` keyrack sources, so an
  //   ec2-only trust policy would leave the grant below reachable by no one
  //   (`rule.require.behavior-intent-coverage`).
  //
  //   `arn:aws:iam::<account>:root` is the standard account-delegation principal: it does NOT
  //   mean the root USER, it means "a principal in this account may assume this role, if its
  //   own iam policy also allows it". so the wall is not dissolved — it moves to the
  //   account's own iam, and the account boundary is itself one of the nested vaults
  //   (`._.zoom=fort-knox-of-fort-knoxes`). the delegation is exactly as tight as the member
  //   account's own iam: only a principal that account grants `sts:AssumeRole` may wear it.
  const cloneRole = DeclaredAwsIamRole.as({
    name: 'nheuron-mail-clone',
    path: '/',
    description: 'Role the nheuron mail clone assumes to read inbound + send',
    policies: [
      {
        effect: 'Allow',
        principal: { aws: asIamRootPrincipalArn({ account }) },
        action: 'sts:AssumeRole',
      },
    ],
    tags: { managedBy: 'declastruct', purpose: 'mail' },
  });
  const cloneGrant = DeclaredAwsIamRolePolicyAttachedInline.as({
    name: 'mail-send-read',
    role: RefByUnique.as<typeof DeclaredAwsIamRole>({
      name: 'nheuron-mail-clone',
    }),
    document: {
      statements: [
        // the gatherer lists the prefix to enumerate mail, then reads each object.
        // ListBucket targets the bucket arn, so the prefix wall is the s3:prefix condition
        {
          effect: 'Allow',
          action: 's3:ListBucket',
          resource: asS3BucketArn({ bucket }),
          condition: {
            StringLike: { 's3:prefix': `${MAIL_OBJECT_KEY_PREFIX}*` },
          },
        },
        {
          effect: 'Allow',
          action: 's3:GetObject',
          resource: asS3ObjectArn({ bucket, prefix: MAIL_OBJECT_KEY_PREFIX }),
        },
        // the respond path — send scoped to this env's mail subdomains, never the apex
        {
          effect: 'Allow',
          action: 'ses:SendRawEmail',
          resource: '*',
          condition: {
            StringLike: {
              'ses:FromAddress': domains.map((domain) => `*@${domain}`),
            },
          },
        },
      ],
    },
  });

  // 7. the send-event capture — a config set + a cloudwatch event destination
  const configSet = DeclaredAwsSesConfigurationSet.as({
    name: MAIL_CONFIG_SET,
    tags: { managedBy: 'declastruct', purpose: 'mail' },
  });
  const eventDest = DeclaredAwsSesConfigurationSetEventDestination.as({
    configurationSet: RefByUnique.as<typeof DeclaredAwsSesConfigurationSet>({
      name: MAIL_CONFIG_SET,
    }),
    name: 'to-cloudwatch',
    enabled: true,
    // order here does not matter — the domain object sorts eventTypes to a canonical order,
    // the same order the aws read-back is cast to, so the compare converges to KEEP
    eventTypes: [
      'BOUNCE',
      'CLICK',
      'COMPLAINT',
      'DELIVERY',
      'OPEN',
      'REJECT',
      'SEND',
    ],
    sink: {
      cloudwatch: [
        {
          name: 'ses:configuration-set',
          source: 'MESSAGE_TAG',
          defaultValue: MAIL_CONFIG_SET,
        },
      ],
      sns: null,
    },
  });

  // 8. the sandbox exit — request production access so jelly can answer ANY recipient, not just
  //    verified ones. aws REVIEWS the request (it does not flip inline), so a fresh apply lands
  //    an unresolved review — a normal KEEP; read reviewStatus for the verdict
  const accountDetails = DeclaredAwsSesAccountDetails.as({
    region,
    productionAccess: 'enabled',
    mailType: 'TRANSACTIONAL',
    websiteUrl: 'https://nheuron.com',
    contactLanguage: 'EN',
    additionalContactEmails: null,
  });

  // apply order = declared array order (declastruct does no topological sort):
  //   identities -> bucket -> bucketPolicy -> ruleSet -> rule (ses test-puts the bucket, so the
  //   bucket + policy must exist first) -> iam -> config set + event destination -> account
  //   details (the account-level sandbox exit; free of any resource dependency)
  return [
    ...identities,
    store,
    storePolicy,
    ruleSet,
    rule,
    cloneRole,
    cloneGrant,
    configSet,
    eventDest,
    accountDetails,
  ];
};
