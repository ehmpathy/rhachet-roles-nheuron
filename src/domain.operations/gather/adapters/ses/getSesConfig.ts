import { BadRequestError } from 'helpful-errors';

/**
 * .what = the ses mechanism's runtime config, sourced from keyrack
 * .why = the adapter needs to know which bucket holds the inbound mail and which
 *        region the ses identity lives in
 */
export interface SesConfig {
  /**
   * the s3 bucket a receipt rule writes inbound mail into
   */
  bucket: string;

  /**
   * the ses-inbound-capable region the identity + bucket share
   */
  region: string;

  /**
   * the object key prefix the receipt rule writes under
   */
  prefix: string;

  /**
   * the ses configuration set every send names, so its bounce/complaint/delivery
   * events reach the declared cloudwatch destination.
   *
   * .note = nullable ON PURPOSE, and the one nullable field here. it is a SEND-only
   *   value — the read path needs the bucket, the region, and the prefix, and touches
   *   no config set at all. a human who only reads jelly's mail legitimately has none
   *   configured, so its absence is a real state rather than a fault, and `sendReplyViaSes`
   *   is where it becomes required (`rule.forbid.nullable-without-reason`).
   */
  configSet: string | null;
}

/**
 * .what = the object key prefix the receipt rule writes under
 * .why = the provision wish declares `objectKeyPrefix: 'inbound/'`, so the reader
 *        must look in the same place
 *
 * .note = a constant, never an env override. the prefix is not a per-deploy knob —
 *         it is one half of a contract with the receipt rule, and a reader pointed at
 *         a prefix the rule does not write yields an empty mailbox rather than an error.
 *
 * .note = MUST equal `MAIL_OBJECT_KEY_PREFIX` in `provision/resources.common.mail.ts`,
 *         and that MUST is CLAMPED rather than merely asked for —
 *         `provision/resources.common.mail.test.ts` imports both and asserts equality, so
 *         a change to one side alone goes red in ci. the clamp is owed because drift here
 *         is SILENT: this reads a prefix ses never wrote, finds zero keys, and reports an
 *         empty mailbox with exit 0 (`rule.forbid.failhide`).
 *
 * .note = the clamp lives on the PROVISION side, since only that direction imports safely
 *         — src ships as a package with no provision dir, so the reverse import would break
 *         every consumer.
 */
export const SES_MAIL_OBJECT_KEY_PREFIX = 'inbound/';

/**
 * .what = read the ses config out of the keyrack-populated env
 * .why = every credential + config value comes from keyrack, never a literal and
 *        never a committed file (rule.require.credentials-from-keyrack). so this
 *        reads process.env ONLY for values keyrack itself placed there.
 *
 * .note = fails loud with the exact unlock command rather than a silent default,
 *         so an absent credential is never mistaken for an empty mailbox
 *
 * .note = only the READ values are demanded here. `SES_CONFIG_SET` is send-only, so to
 *   demand it at load would make the read path fail on a key it never uses — and, since
 *   `getAuthStatus` reads an absent config as `anonymous`, it would have reported a
 *   read-only mailbox as unauthenticated. `sendReplyViaSes` demands it instead.
 */
export const getSesConfig = (): SesConfig => {
  const bucket = process.env.SES_MAIL_BUCKET;
  const region = process.env.SES_REGION;

  if (!bucket || !region)
    BadRequestError.throw('ses config absent', {
      present: { bucket: !!bucket, region: !!region },
      expected: ['SES_MAIL_BUCKET', 'SES_REGION'],
      hint: 'run: rhx keyrack unlock --owner ehmpath --env prep',
    });

  return {
    bucket,
    region,
    prefix: SES_MAIL_OBJECT_KEY_PREFIX,
    configSet: process.env.SES_CONFIG_SET ?? null,
  };
};
