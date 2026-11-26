#!/usr/bin/env bash
######################################################################
# ⛵ mail.dns.records.get — the dns records an env's ses mailbox owes
#
# .what = prints the exact MX, SPF, 3 dkim CNAMEs, and DMARC records each
#         domain of an env's mailbox owes, derived by asSesMailDnsRecords
#         from resources.common.mail.ts and the dkim tokens read live from
#         the applied ses identities; plus the SES_DKIM_TOKENS segment the
#         declared dns wish reads
#
# .why  = the dns step is entered by a human in the dns console, with no
#         robot credential on the zone. the records must come from the
#         same derivation the declared dns wish uses, and the tokens from
#         the identities themselves, never a hand copy — a typo in a dkim
#         cname strands the identity unverified
#
# usage:
#   rhx mail.dns.records.get --env prep
#   rhx mail.dns.records.get --env prod --format bind > prod.zone.txt
#   rhx mail.dns.records.get help
#
# options:
#   --env ENV       the mailbox env: prep or prod (required)
#   --format FMT    tree (default, to read) | bind (a zone file, to import:
#                   cloudflare dns → records → import and export; leave
#                   "proxy imported dns records" unchecked)
#
# guarantee:
#   - read-only: sesv2 get-email-identity only; no write, no dns call
#   - reads keyrack org=nheuron env=ENV for the member profile
#   - exit 0 = records printed
#   - exit 1 = malfunction (aws error)
#   - exit 2 = constraint (bad args, absent profile, identity not applied)
######################################################################
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

# emit a constraint refusal and exit 2
belay() {
  echo "🐈 belay that..."
  echo ""
  echo "⛵ mail.dns.records.get"
  echo "   ├─ $1"
  echo "   └─ $2"
  exit 2
}

# parse arguments
ENV=""
FORMAT="tree"
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="${2:-}"
      shift 2
      ;;
    --format)
      FORMAT="${2:-}"
      shift 2
      ;;
    --skill|--repo|--role)
      shift 2 # rhx passthrough args
      ;;
    --)
      shift
      ;;
    help|--help|-h)
      echo "🐈 heres the deal..."
      echo ""
      echo "⛵ mail.dns.records.get"
      echo "   ├─ usage: rhx mail.dns.records.get --env <prep|prod> [--format tree|bind]"
      echo "   ├─ prints the dns records each domain of the env's mailbox owes"
      echo "   └─ --format bind = a zone file for cloudflare dns → records → import and export"
      exit 0
      ;;
    *)
      belay "unknown argument: $1" "hint: rhx mail.dns.records.get help"
      ;;
  esac
done
if [[ "$ENV" != "prep" && "$ENV" != "prod" ]]; then
  belay "invalid or absent --env: ${ENV:-(absent)}" "must be: prep or prod"
fi
if [[ "$FORMAT" != "tree" && "$FORMAT" != "bind" ]]; then
  belay "invalid --format: ${FORMAT:-(absent)}" "must be: tree or bind"
fi

# one credential channel: the env's member profile from the nheuron slot
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN 2>/dev/null || true
PROFILE=$(rhx keyrack get --owner ehmpath --org nheuron --env "$ENV" --key AWS_PROFILE --output value 2>/dev/null || echo "")
if [[ -z "$PROFILE" ]]; then
  belay "absent: nheuron.$ENV.AWS_PROFILE" "fix: rhx keyrack unlock --owner ehmpath --org nheuron --env $ENV --key AWS_PROFILE"
fi

# the env's domains, from the one module both wishes read
cd "$REPO_ROOT"
DOMAINS=$(npx tsx -e "
import { MAIL_BY_ENV } from './provision/resources.common.mail';
console.log(MAIL_BY_ENV['$ENV'].domains.join(' '));
")

# read each identity's dkim tokens, live: the identity is the source of truth
SEGMENTS=()
for DOMAIN in $DOMAINS; do
  TOKENS_JSON=$(aws sesv2 get-email-identity --email-identity "$DOMAIN" --profile "$PROFILE" --region us-east-1 --output json 2>&1) || {
    if printf '%s' "$TOKENS_JSON" | grep -q 'NotFoundException'; then
      belay "identity not applied: $DOMAIN" "fix: rhx provision.member --wish provision/aws.mail/account=$ENV/resources.mail.ts --env $ENV --org nheuron --mode apply"
    fi
    echo "🐈 wet paws..."
    echo ""
    echo "⛵ mail.dns.records.get"
    echo "   ├─ sesv2 get-email-identity failed for $DOMAIN"
    echo "   └─ error: $(printf '%s' "$TOKENS_JSON" | head -n 1)"
    exit 1
  }
  TOKENS=$(printf '%s' "$TOKENS_JSON" | jq -r '.DkimAttributes.Tokens | join(",")')
  SEGMENTS+=("$DOMAIN=$TOKENS")
done
TOKEN_MAP=$(IFS=';'; printf '%s' "${SEGMENTS[*]}")

# derive the records via the same transformers the declared dns wish uses
SES_DKIM_TOKENS="$TOKEN_MAP" npx tsx -e "
import { MAIL_REGION, MAIL_ZONE } from './provision/resources.common.mail';
import { asDkimTokensByDomain } from './provision/cloudflare/asDkimTokensByDomain';
import { asSesMailDnsRecords } from './provision/cloudflare/asSesMailDnsRecords';
const tokensByDomain = asDkimTokensByDomain({ raw: process.env.SES_DKIM_TOKENS ?? null });
const records = Object.entries(tokensByDomain).flatMap(([domain, dkimTokens]) =>
  asSesMailDnsRecords({ domain, region: MAIL_REGION, dkimTokens }),
);
// bind: one zone-file line per record, fqdns dot-terminated, txt values quoted
if ('$FORMAT' === 'bind') {
  const asFqdn = (name: string) => (name.endsWith('.') ? name : name + '.');
  console.log('; ses mailbox records for env=$ENV, zone ' + MAIL_ZONE + ' — import with proxy off');
  records.forEach((record) => {
    const rdata =
      record.type === 'TXT'
        ? JSON.stringify(record.value)
        : record.type === 'MX'
          ? record.value.split(' ')[0] + ' ' + asFqdn(record.value.split(' ')[1]!)
          : asFqdn(record.value);
    console.log([asFqdn(record.name), '300', 'IN', record.type, rdata].join('\t'));
  });
  process.exit(0);
}
console.log('🐈 heres the chart...');
console.log('');
console.log('⛵ mail.dns.records.get --env $ENV');
console.log('   ├─ zone: ' + MAIL_ZONE);
console.log('   ├─ proxy: off (dns only, grey cloud) on every record');
console.log('   ├─ records (' + records.length + ')');
records.forEach((record, index) => {
  const isLast = index === records.length - 1;
  const trunk = isLast ? '   │  └─ ' : '   │  ├─ ';
  const limb = isLast ? '   │     ' : '   │  │  ';
  console.log(trunk + record.type);
  console.log(limb + '├─ name: ' + record.name);
  // an mx value is '<priority> <server>'; dns consoles take the priority as its own field
  const [priority, server] = record.value.split(' ');
  if (record.type === 'MX') console.log(limb + '├─ priority: ' + priority);
  console.log(limb + '└─ value: ' + (record.type === 'MX' ? server : record.value));
});
console.log('   │');
console.log('   └─ SES_DKIM_TOKENS segment (join the envs with ;)');
console.log('      └─ ' + process.env.SES_DKIM_TOKENS);
"