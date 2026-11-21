/**
 * .what = the parameters that name the jelly@one.nheuron.com mailbox and its aws resources
 * .why = the mail wish (aws) and the dns wish (cloudflare) both need the same domain + region.
 *   one module holds them, so a change to the mail domain cannot leave the two wishes disagreed.
 *
 * .note = it sits at `provision/`, the COMMON ANCESTOR of its two consumers
 *   (`provision/aws.mail/account=prep/` and `provision/cloudflare/`), rather than inside
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
 * the mail SUBDOMAIN, never the apex — keeps `nheuron.com`'s own mx free and bounds the blast
 * radius. `one` is a domain term: a clone IS one connection into the external brain
 * (see `domain.terms/one.md`), not a numeral.
 */
export const MAIL_DOMAIN = 'one.nheuron.com';

/**
 * jelly's address — ONE address for both legs: receive (the recipient the rule names) and
 * send-from (covered by the verified DOMAIN identity, so it owes no email identity of its own)
 */
export const MAIL_MAILBOX = `jelly@${MAIL_DOMAIN}`;

/**
 * the region. ses INBOUND receipt runs in a subset of regions only (us-east-1, us-west-2,
 * eu-west-1, and a few more) — the mx target and the bucket must share it.
 */
export const MAIL_REGION = 'us-east-1';

/**
 * the cloudflare zone that holds the records. `one.nheuron.com` records live within it.
 */
export const MAIL_ZONE = 'nheuron.com';

/** the inbound store. an s3 bucket name is globally unique, so it is keyed to the mail domain */
export const MAIL_BUCKET = 'nheuron-mail-inbound-one';

/** the account's active receipt rule set (aws allows exactly one active set per region) */
export const MAIL_RULE_SET = 'nheuron-mail-inbound';

/** the rule within that set — routes jelly's mail to s3 */
export const MAIL_RULE = 'to-s3';

/**
 * where ses writes each raw rfc822 message; the gatherer lists + reads this prefix.
 * MUST equal `SES_MAIL_OBJECT_KEY_PREFIX` in
 * `src/domain.operations/gather/adapters/ses/getSesConfig.ts` — the reader's half of the
 * same contract.
 *
 * .note = that MUST is CLAMPED, never merely asked for: `resources.common.mail.test.ts`
 *   imports both and asserts they are equal, so a change to one side alone goes red in ci.
 *   the clamp exists because the live symptom of drift is silence — the gatherer lists a
 *   prefix ses never writes, finds zero keys, and reports an empty mailbox with exit 0.
 */
export const MAIL_OBJECT_KEY_PREFIX = 'inbound/';

/**
 * the send-event capture set. MUST equal the `SES_CONFIG_SET` keyrack value the adapter
 * names on each send — ses binds a config set per-send, so a mismatch silences the
 * event destination while every send still looks healthy.
 */
export const MAIL_CONFIG_SET = 'nheuron-mail-events';
