import type { DeclastructProvider } from 'declastruct';
import {
  DeclaredCloudflareDomainZone,
  getDeclastructCloudflareProvider,
} from 'declastruct-cloudflare';
import { type DomainEntity, RefByUnique } from 'domain-objects';
import { BadRequestError } from 'helpful-errors';
import { keyrack } from 'rhachet/keyrack';
import { genLogMethods } from 'sdk-logs';

import { MAIL_DOMAIN, MAIL_REGION, MAIL_ZONE } from '../resources.common.mail';
import { asCloudflareDnsRecords } from './asCloudflareDnsRecords';
import { asDkimTokens } from './asDkimTokens';
import { asSesMailDnsRecords } from './asSesMailDnsRecords';

// source cloudflare credentials from keyrack (lenient: an absent key does not throw here —
// getProviders fails loud with the exact fix if the token is not filled)
keyrack.source({ env: 'prep', owner: 'ehmpath', mode: 'lenient' });

const log = genLogMethods();

/**
 * .what = the 3 easy-dkim tokens aws emitted for the applied `one.nheuron.com` ses identity.
 *   these are the ONLY dynamic values in the dns set — aws generates them at identity-create
 *   time and holds them stable for the life of the identity (they change only on a
 *   delete+recreate). the MX / SPF / DMARC records are static forms derived from
 *   `asSesMailDnsRecords`, so these are the sole apply-sourced input.
 * .source = the `setSesEmailIdentity` apply log for `one.nheuron.com` (metadata.dnsRecords) —
 *   fill after the mail wish applies; see readme.md.
 *
 * .why keyrack rather than a literal = the two applies run in sequence — aws mints the tokens,
 *   then cloudflare declares them — so their values cannot exist in this file at commit time.
 *   a hardcoded placeholder would make the committed wish un-applyable until someone edits
 *   code, which puts a source change between two infra applies. read from the sourced env,
 *   the wish is applyable as committed: fill the tokens, re-run, done.
 *
 * .note = they are NOT a secret (they become public dns the moment they are declared). they
 *   ride keyrack for the sequence reason above, and because keyrack is the one env source this
 *   repo reads from at all (`rule.require.credentials-from-keyrack`).
 * .note = to refresh after a re-create: read the live identity's dkimTokens (the same values
 *   the apply log re-emits on every KEEP) and re-fill.
 *
 * .note = the parse itself lives in `asDkimTokens` — a named, tested transformer — so this
 *   closure only reads the env and hands the raw value in. the parse contract (split, trim,
 *   drop empties) is pinned by its own clamp rather than buried here untested.
 */
const getDkimTokens = (): string[] =>
  asDkimTokens({ raw: process.env.SES_DKIM_TOKENS ?? null });

/**
 * .what = the cloudflare provider — the one step the aws wish cannot do (dns is a different
 *   provider). closes the cross-provider seam so the whole mail stack is code-embedded
 * .why = reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from the sourced keyrack env; fails
 *   loud with the exact fix when the token is absent, rather than a cryptic 401 later
 */
export const getProviders = async (): Promise<DeclastructProvider[]> => {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId)
    BadRequestError.throw(
      'cloudflare credentials absent — CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be filled in keyrack env=prep',
      {
        hint: 'create a cloudflare USER token (My Profile > API Tokens, NOT an account token) with Zone:Read + DNS:Edit, then `rhx keyrack fill --owner ehmpath --env prep`',
        present: { apiToken: !!apiToken, accountId: !!accountId },
      },
    );

  return [
    await getDeclastructCloudflareProvider({ apiToken, accountId }, { log }),
  ];
};

/**
 * .what = the ses mail dns records for `one.nheuron.com`, declared as cloudflare resources:
 *   the inbound MX, the SPF TXT, the 3 easy-dkim CNAMEs, and the DMARC TXT
 * .why = a human once pasted these by hand; declared, `apply` writes them and `plan` proves
 *   they hold — so the mail loop is reproducible end to end
 *
 * .note = the records live in the `nheuron.com` zone but name `one.nheuron.com` — the apex mx
 *   is untouched, which is the whole point of the subdomain.
 */
export const getResources = async (): Promise<DomainEntity<any>[]> => {
  // the tokens are unknowable until the aws wish applies, so their absence is a REAL state
  // (the first of the two applies has not run yet) rather than a defect. it fails loud with
  // the exact next command, never a partial dns set that half-verifies the identity
  const dkimTokens = getDkimTokens();
  if (dkimTokens.length === 0)
    BadRequestError.throw(
      'SES_DKIM_TOKENS is empty — the dns records cannot be declared until ses emits them',
      {
        hint: 'apply provision/aws.mail/account=prep/resources.mail.ts first, then `rhx keyrack fill --owner ehmpath --env prep` with the 3 dkim tokens from its setSesEmailIdentity log, comma-separated',
        domain: MAIL_DOMAIN,
      },
    );

  // the zone that holds the records (must already exist in cloudflare)
  const zone = new DeclaredCloudflareDomainZone({
    name: MAIL_ZONE,
    type: 'full',
  });
  const zoneRef = RefByUnique.as<typeof DeclaredCloudflareDomainZone>({
    name: MAIL_ZONE,
  });

  // derive the exact records the identity owes, then declare each in the zone
  const owed = asSesMailDnsRecords({
    domain: MAIL_DOMAIN,
    region: MAIL_REGION,
    dkimTokens,
  });
  const records = asCloudflareDnsRecords({ records: owed, zoneRef });

  // zone first (the records ref it), then the records — declastruct applies in array order
  return [zone, ...records];
};
