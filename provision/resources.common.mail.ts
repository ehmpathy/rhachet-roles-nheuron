/**
 * .what = the parameters that name each env's jelly mailbox and its aws resources
 * .why = the mail wish (aws) and the dns wish (cloudflare) both need the same domain + region.
 *   one module holds them, so a change to the mail domain cannot leave the two wishes disagreed.
 *
 * .note = it sits at `provision/`, the COMMON ANCESTOR of its two consumers
 *   (`provision/aws.mail/account=prod/` and `provision/cloudflare/`), rather than inside
 *   either one. aws and cloudflare are separate bounded contexts — separate providers,
 *   separate applies — so for one wish to import the other's internal module would couple
 *   them: a rename inside the aws wish would break the unrelated cloudflare wish, and
 *   neither could evolve alone (`rule.forbid.scope-leaks`,
 *   `rule.prefer.most-common-denominator`). the `resources.common.*` name mirrors its peer
 *   `aws.auth/resources.common.accounts.ts`, which lifts the same way for the same reason.
 *
 * .note = these are NOT credentials — a domain, a region, and resource names are public facts,
 *   and each one carries the resource's identity (a bucket name is globally unique, a
 *   receipt-rule arn is derived from the rule + rule-set names). the credentials this stack
 *   needs (AWS_PROFILE, the cloudflare token, the account emails) all come from keyrack.
 */

/**
 * the env of a mailbox — one mailbox per member account. prep is the one tests run against, so
 * a defect never lands on the address real mail reaches; prod holds the public address
 */
export type MailEnv = 'prep' | 'prod';

/**
 * the local part every mailbox shares — `jelly@<domain>`, on each domain of its env
 */
export const MAIL_LOCAL_PART = 'jelly';

/**
 * .what = the domains and the inbound store of each env's mailbox
 *
 * .note = each domain is a mail SUBDOMAIN, never the apex — keeps `nheuron.com`'s own mx free
 *   and bounds the blast radius. `one` is a domain term: a clone IS one connection into the
 *   external brain (see `domain.terms/one.md`), not a numeral.
 *
 * .note = prod lists two domains: `one.prod.nheuron.com`, and `one.nheuron.com` as its alias.
 *   the alias is a second ses identity in the SAME account — its mx at the same inbound
 *   endpoint, named by the same receipt rule, into the same bucket. never a dns cname: a cname
 *   cannot share a name with the mx + txt records, and ses verifies each domain on its own.
 *
 * .note = a bucket name is globally unique, so each env's bucket carries its env. the rule set,
 *   rule, and config set names are account-local, so both envs share them (below).
 */
export const MAIL_BY_ENV: Record<
  MailEnv,
  { domains: readonly string[]; bucket: string }
> = {
  prep: {
    domains: ['one.prep.nheuron.com'],
    bucket: 'nheuron-mail-inbound-one-prep',
  },
  prod: {
    domains: ['one.prod.nheuron.com', 'one.nheuron.com'],
    bucket: 'nheuron-mail-inbound-one-prod',
  },
};

/**
 * the region. ses INBOUND receipt runs in a subset of regions only (us-east-1, us-west-2,
 * eu-west-1, and a few more) — the mx target and the bucket must share it.
 */
export const MAIL_REGION = 'us-east-1';

/**
 * the dns zone that holds every env's records
 */
export const MAIL_ZONE = 'nheuron.com';

/** the account's active receipt rule set (aws allows exactly one active set per region) */
export const MAIL_RULE_SET = 'nheuron-mail-inbound';

/** the rule within that set — routes jelly's mail to s3 */
export const MAIL_RULE = 'to-s3';

/**
 * where ses writes each raw rfc822 message; the collector lists + reads this prefix.
 * MUST equal `SES_MAIL_OBJECT_KEY_PREFIX` in
 * `src/domain.operations/gather/adapters/ses/getSesConfig.ts` — the reader's half of the
 * same contract.
 *
 * .note = that MUST is CLAMPED, never merely asked for: `resources.common.mail.test.ts`
 *   imports both and asserts they are equal, so a change to one side alone goes red in ci.
 *   the clamp exists because the live symptom of drift is silence — the collector lists a
 *   prefix ses never writes, finds zero keys, and reports an empty mailbox with exit 0.
 */
export const MAIL_OBJECT_KEY_PREFIX = 'inbound/';

/**
 * the send-event capture set. MUST equal the `SES_CONFIG_SET` keyrack value the adapter
 * names on each send — ses binds a config set per-send, so a mismatch silences the
 * event destination while every send still looks healthy.
 */
export const MAIL_CONFIG_SET = 'nheuron-mail-events';
