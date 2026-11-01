import type { DeclastructProvider } from 'declastruct';
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
  getCredentials,
  getDeclastructAwsProvider,
} from 'declastruct-aws';
import { type DomainEntity, RefByUnique } from 'domain-objects';
import { BadRequestError } from 'helpful-errors';
import { keyrack } from 'rhachet/keyrack';
import { genLogMethods } from 'sdk-logs';

import {
  MAIL_BUCKET,
  MAIL_CONFIG_SET,
  MAIL_DOMAIN,
  MAIL_MAILBOX,
  MAIL_OBJECT_KEY_PREFIX,
  MAIL_REGION,
  MAIL_RULE,
  MAIL_RULE_SET,
} from '../../resources.common.mail';

// source aws credentials from keyrack — this wish applies into the nheuron-prep account
keyrack.source({ env: 'prep', owner: 'ehmpath', mode: 'lenient' });

const log = genLogMethods();

/**
 * .what = the jelly@one.nheuron.com mailbox — a clone's own address that receives to s3 and
 *   sends out, authed by a dedicated declared iam role
 * .why = a clone warrants a real address rather than an invocation. this is the one connection
 *   into the external brain, made concrete (see `domain.terms/one.md`). it beats the google
 *   service-account path, which needs domain-wide delegation over EVERY org mailbox.
 *
 * .note = the mail domain is a dedicated SUBDOMAIN (`one.nheuron.com`), never the apex. that
 *   keeps the `nheuron.com` apex mx free for whatever else the domain serves, and isolates the
 *   blast radius to the subdomain — the third wall of the nest
 *   (`philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`).
 *
 * .note = the receipt rule names ONE recipient, never a domain catch-all. a catch-all would
 *   read every address on the subdomain — more than one clone needs. the honest cost: a second
 *   clone here owes its own rule.
 *
 * .note = a domain identity's apply emits the dns records the cloudflare wish then declares —
 *   v2 easy dkim: an MX (inbound), an SPF TXT, and 3 dkim CNAMEs. there is NO separate
 *   `_amazonses` TXT ownership token (that was the v1 shape). the identity stays
 *   `verificationStatus: unresolved` until that dns propagates.
 *
 * @see .behavior/v2026_07_30.collect-from-ses/1.vision.yield.md — deliverable (a)
 * @see readme.md for prereqs + apply steps
 */
export const getResourcesOfMail = (input: {
  account: string;
  region: string;
}): DomainEntity<any>[] => {
  const { account, region } = input;

  // the mx target the dns wish declares is keyed to MAIL_REGION, while the bucket + rules land
  // in whatever region the credentials name. a mismatch is SILENT — the apply succeeds and mail
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

  // the bucket policy's SourceArn must name the RECEIPT RULE arn (deterministic from names)
  const receiptRuleArn = asSesReceiptRuleArn({
    region,
    account,
    ruleSetName: MAIL_RULE_SET,
    ruleName: MAIL_RULE,
  });

  // 1. the domain identity — emits the dkim tokens the cloudflare wish declares
  const identity = DeclaredAwsSesEmailIdentity.as({
    identity: MAIL_DOMAIN,
    dkim: 'enabled',
    mailFrom: null,
    tags: { managedBy: 'declastruct', purpose: 'mail' },
  });

  // 2. the inbound store — `lifecycle: null` = persist, every object in Standard.
  //    a glacier staircase would be the cheaper shape, and it is deliberately NOT taken: an
  //    object in DEEP_ARCHIVE cannot be read without a restore that takes hours, so
  //    `gather.mail --since <a year ago>` would fail on the archived mail. a clone must be able
  //    to read its own memory at any age. the vision judged storage cost a non-issue at a
  //    clone's volume, so no cost cut here is worth that price.
  const store = DeclaredAwsS3Bucket.as({
    name: MAIL_BUCKET,
    lifecycle: null,
    tags: { managedBy: 'declastruct', purpose: 'mail' },
  });

  // 3. the bucket policy — allow SES (this account + this rule ONLY) to PutObject into inbound/
  const storePolicy = DeclaredAwsS3BucketPolicy.as({
    bucket: RefByUnique.as<typeof DeclaredAwsS3Bucket>({ name: MAIL_BUCKET }),
    document: {
      statements: [
        {
          sid: 'AllowSesPut',
          effect: 'Allow',
          principal: { service: 'ses.amazonaws.com' },
          action: 's3:PutObject',
          resource: `arn:aws:s3:::${MAIL_BUCKET}/${MAIL_OBJECT_KEY_PREFIX}*`,
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

  // 5. the receipt rule — route inbound mail for JELLY (that one address) to the s3 prefix
  const rule = DeclaredAwsSesReceiptRule.as({
    ruleSet: RefByUnique.as<typeof DeclaredAwsSesReceiptRuleSet>({
      name: MAIL_RULE_SET,
    }),
    name: MAIL_RULE,
    enabled: true,
    recipients: [MAIL_MAILBOX],
    actions: [
      {
        s3: {
          bucket: RefByUnique.as<typeof DeclaredAwsS3Bucket>({
            name: MAIL_BUCKET,
          }),
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
  //    read exactly one prefix, send as exactly one domain; a stolen credential cannot roam
  //
  // ⚠️ THE TRUST PRINCIPAL IS THE ACCOUNT, because the clone runs LOCALLY.
  //   this read `{ service: 'ec2.amazonaws.com' }`, carried over from a demo whose clone ran
  //   on an ec2 instance. ours does not: the vision runs `gather.mail` on a human's machine
  //   under the `AWS_PROFILE` keyrack sources. with an ec2-only trust policy, NO credential
  //   a local profile can hold may assume this role — so the grant below was syntactically
  //   present and reachable by no one, and the mailbox infra could never be exercised at all
  //   (`rule.require.behavior-intent-coverage`).
  //
  //   `arn:aws:iam::<account>:root` is the standard account-delegation principal: it does NOT
  //   mean the root USER, it means "a principal in this account may assume this role, if its
  //   own iam policy also allows it". so the wall is not dissolved — it moves to the
  //   account's own iam, and the account boundary is itself one of the nested vaults
  //   (`._.zoom=fort-knox-of-fort-knoxes`). nheuron-prep exists for this mailbox alone, which
  //   is what keeps the delegation tight.
  const cloneRole = DeclaredAwsIamRole.as({
    name: 'nheuron-mail-clone',
    path: '/',
    description: 'Role the nheuron mail clone assumes to read inbound + send',
    policies: [
      {
        effect: 'Allow',
        principal: { aws: `arn:aws:iam::${account}:root` },
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
          resource: `arn:aws:s3:::${MAIL_BUCKET}`,
          condition: {
            StringLike: { 's3:prefix': `${MAIL_OBJECT_KEY_PREFIX}*` },
          },
        },
        {
          effect: 'Allow',
          action: 's3:GetObject',
          resource: `arn:aws:s3:::${MAIL_BUCKET}/${MAIL_OBJECT_KEY_PREFIX}*`,
        },
        // the respond path — send scoped to the mail subdomain, never the apex
        {
          effect: 'Allow',
          action: 'ses:SendRawEmail',
          resource: '*',
          condition: {
            StringLike: { 'ses:FromAddress': `*@${MAIL_DOMAIN}` },
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
  //   identity -> bucket -> bucketPolicy -> ruleSet -> rule (ses test-puts the bucket, so the
  //   bucket + policy must exist first) -> iam -> config set + event destination -> account
  //   details (the account-level sandbox exit; free of any resource dependency)
  return [
    identity,
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

export const getProviders = async (): Promise<DeclastructProvider[]> => [
  await getDeclastructAwsProvider({}, { log }),
];

export const getResources = async (): Promise<DomainEntity<any>[]> => {
  // read account + region via the CHEAP credential lookup (region from env/config + account
  // from sts) — NOT a second full provider build, which would re-construct the whole dao map
  // just to read two strings
  const { account, region } = await getCredentials();
  return getResourcesOfMail({ account, region });
};
