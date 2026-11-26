import type { DeclastructProvider } from 'declastruct';
import {
  DeclaredCloudflareDomainZone,
  getDeclastructCloudflareProvider,
} from 'declastruct-cloudflare';
import { type DomainEntity, RefByUnique } from 'domain-objects';
import { BadRequestError } from 'helpful-errors';
import { keyrack } from 'rhachet/keyrack';
import { genLogMethods } from 'sdk-logs';

import {
  MAIL_BY_ENV,
  MAIL_REGION,
  MAIL_ZONE,
  type MailEnv,
} from '../resources.common.mail';
import { asCloudflareDnsRecords } from './asCloudflareDnsRecords';
import { asDkimTokensByDomain } from './asDkimTokensByDomain';
import { asSesMailDnsRecords } from './asSesMailDnsRecords';

// source cloudflare credentials from keyrack (lenient: an absent key does not throw here —
// getProviders fails loud with the exact fix if the token is not filled). the nheuron.com zone
// belongs to the nheuron org, so its keys live in the nheuron org slot
keyrack.source({
  env: 'prod',
  owner: 'ehmpath',
  org: 'nheuron',
  mode: 'lenient',
});

const log = genLogMethods();

/** every env whose mailbox domains sit in the zone */
const MAIL_ENVS: MailEnv[] = ['prep', 'prod'];

/**
 * .what = the 3 easy-dkim tokens aws emitted for each applied ses domain identity, by domain.
 *   these are the ONLY dynamic values in the dns set — aws generates them at identity-create
 *   time and holds them stable for the life of the identity (they change only on a
 *   delete+recreate). the MX / SPF / DMARC records are static forms derived from
 *   `asSesMailDnsRecords`, so these are the sole apply-sourced input.
 * .source = `rhx mail.dns.records.get --env <env>` reads them from the live identities and
 *   prints the exact value to fill; see readme.md.
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
 * .note = the parse itself lives in `asDkimTokensByDomain` — a named, tested transformer — so
 *   this closure only reads the env and hands the raw value in.
 */
const getDkimTokensByDomain = (): Record<string, string[]> =>
  asDkimTokensByDomain({ raw: process.env.SES_DKIM_TOKENS ?? null });

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
      'cloudflare credentials absent — CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be filled in keyrack org=nheuron env=prod',
      {
        hint: 'create a cloudflare USER token (My Profile > API Tokens, NOT an account token) with Zone:Read + DNS:Edit, then `rhx keyrack fill --owner ehmpath --org nheuron --env prod`',
        present: { apiToken: !!apiToken, accountId: !!accountId },
      },
    );

  return [
    await getDeclastructCloudflareProvider({ apiToken, accountId }, { log }),
  ];
};

/**
 * .what = the ses mail dns records for every mailbox domain (prep, prod, and the prod alias),
 *   declared as cloudflare resources: per domain, the inbound MX, the SPF TXT, the 3 easy-dkim
 *   CNAMEs, and the DMARC TXT
 * .why = declared, `apply` writes them and `plan` proves they hold — so the mail loop is
 *   reproducible end to end. one wish covers every env, since every domain sits in one zone
 *
 * .note = the records live in the `nheuron.com` zone but name its `one.*` subdomains — the apex
 *   mx is untouched, which is the whole point of the subdomain.
 */
export const getResources = async (): Promise<DomainEntity<any>[]> => {
  // the tokens are unknowable until each mail wish applies, so an absent domain is a REAL state
  // (its apply has not run yet) rather than a defect. it fails loud with the exact next command,
  // never a partial dns set that half-verifies an identity
  const tokensByDomain = getDkimTokensByDomain();
  const domains = MAIL_ENVS.flatMap((env) => MAIL_BY_ENV[env].domains);
  const domainsAbsent = domains.filter(
    (domain) => (tokensByDomain[domain] ?? []).length === 0,
  );
  if (domainsAbsent.length > 0)
    BadRequestError.throw(
      'SES_DKIM_TOKENS lacks a domain — its dns records cannot be declared until ses emits them',
      {
        hint: 'apply each env mail wish (rhx provision.member --wish provision/aws.mail/account=<env>/resources.mail.ts ...), then `rhx mail.dns.records.get --env <env>` prints the SES_DKIM_TOKENS value to set in keyrack org=nheuron env=prod',
        domainsAbsent,
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

  // derive the exact records each identity owes, then declare each in the zone
  const owed = domains.flatMap((domain) =>
    asSesMailDnsRecords({
      domain,
      region: MAIL_REGION,
      dkimTokens: tokensByDomain[domain] ?? [],
    }),
  );
  const records = asCloudflareDnsRecords({ records: owed, zoneRef });

  // zone first (the records ref it), then the records — declastruct applies in array order
  return [zone, ...records];
};
