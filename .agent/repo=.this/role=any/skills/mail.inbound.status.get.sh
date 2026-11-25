#!/usr/bin/env bash
######################################################################
# ⛵ mail.inbound.status.get — where does inbound mail stop, if it stops?
#
# .what = walks the inbound path of an env's mailbox, live, hop by hop:
#         the mx each domain publishes, the active ses receipt rule set and
#         each rule's recipients + s3 action, and the newest objects in the
#         mail bucket
#
# .why  = "i sent it, the gatherer shows naught" has three suspects: dns
#         never routes the mail to ses, ses receives it but no rule takes
#         it, or a rule takes it but writes elsewhere. this names the hop
#         that drops it, with no raw aws cli call to approve
#
# usage:
#   rhx mail.inbound.status.get --env prep
#   rhx mail.inbound.status.get --env prod
#   rhx mail.inbound.status.get help
#
# options:
#   --env ENV   the mailbox env: prep or prod (required)
#
# guarantee:
#   - read-only: dns mx lookup, ses describe-active-receipt-rule-set,
#     s3api list-objects-v2
#   - reads keyrack org=nheuron env=ENV for AWS_PROFILE + SES_MAIL_BUCKET
#   - exit 0 = report printed
#   - exit 1 = malfunction (aws error)
#   - exit 2 = constraint (bad args, absent key)
######################################################################
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

# emit a constraint refusal and exit 2
belay() {
  echo "🐈 belay that..."
  echo ""
  echo "⛵ mail.inbound.status.get"
  echo "   ├─ $1"
  echo "   └─ $2"
  exit 2
}

# emit a malfunction and exit 1
wetpaws() {
  echo "🐈 wet paws..."
  echo ""
  echo "⛵ mail.inbound.status.get"
  echo "   ├─ $1"
  echo "   └─ error: $(printf '%s' "$2" | head -n 1)"
  exit 1
}

# parse arguments
ENV=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="${2:-}"
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
      echo "⛵ mail.inbound.status.get"
      echo "   ├─ usage: rhx mail.inbound.status.get --env <prep|prod>"
      echo "   └─ walks mx → receipt rules → bucket, to name where inbound mail stops"
      exit 0
      ;;
    *)
      belay "unknown argument: $1" "hint: rhx mail.inbound.status.get help"
      ;;
  esac
done
if [[ "$ENV" != "prep" && "$ENV" != "prod" ]]; then
  belay "invalid or absent --env: ${ENV:-(absent)}" "must be: prep or prod"
fi

# one credential channel: the env's member profile + bucket from the nheuron slot
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN 2>/dev/null || true
PROFILE=$(rhx keyrack get --owner ehmpath --org nheuron --env "$ENV" --key AWS_PROFILE --output value 2>/dev/null || echo "")
[[ -n "$PROFILE" ]] || belay "absent: nheuron.$ENV.AWS_PROFILE" "fix: rhx keyrack unlock --owner ehmpath --org nheuron --env $ENV --key AWS_PROFILE"
BUCKET=$(rhx keyrack get --owner ehmpath --org nheuron --env "$ENV" --key SES_MAIL_BUCKET --output value 2>/dev/null || echo "")
[[ -n "$BUCKET" ]] || belay "absent: nheuron.$ENV.SES_MAIL_BUCKET" "fix: rhx keyrack unlock --owner ehmpath --org nheuron --env $ENV --key SES_MAIL_BUCKET"

# the env's domains, from the one module both wishes read
cd "$REPO_ROOT"
DOMAINS=$(npx tsx -e "
import { MAIL_BY_ENV } from './provision/resources.common.mail';
console.log(MAIL_BY_ENV['$ENV'].domains.join(' '));
")

echo "🐈 heres the chart..."
echo ""
echo "⛵ mail.inbound.status.get --env $ENV"

# hop 1: the mx each domain publishes (node dns, so no dig dependency)
echo "   ├─ hop 1: mx (expect inbound-smtp.us-east-1.amazonaws.com)"
for DOMAIN in $DOMAINS; do
  MX=$(node -e "
require('dns').promises.resolveMx('$DOMAIN')
  .then((rows) => console.log(rows.map((r) => r.priority + ' ' + r.exchange).join(', ') || '(none)'))
  .catch((e) => console.log('(none: ' + e.code + ')'));
")
  echo "   │  ├─ $DOMAIN"
  echo "   │  │  └─ $MX"
done
echo "   │"

# hop 1b: ip receipt filters — the one account-wide sender gate, outside any rule set
FILTERS_JSON=$(aws ses list-receipt-filters --profile "$PROFILE" --region us-east-1 --output json 2>&1) || wetpaws "ses list-receipt-filters failed" "$FILTERS_JSON"
FILTER_COUNT=$(printf '%s' "$FILTERS_JSON" | jq -r '(.Filters // []) | length')
echo "   ├─ hop 1b: ip receipt filters: $FILTER_COUNT (0 = every sender ip admitted)"
printf '%s' "$FILTERS_JSON" | jq -r '
  (.Filters // [])[] |
  "   │  ├─ \(.Name): \(.IpFilter.Policy) \(.IpFilter.Cidr)"
'
echo "   │"

# hop 2: the active receipt rule set and each rule
RULESET_JSON=$(aws ses describe-active-receipt-rule-set --profile "$PROFILE" --region us-east-1 --output json 2>&1) || wetpaws "ses describe-active-receipt-rule-set failed" "$RULESET_JSON"
RULESET_NAME=$(printf '%s' "$RULESET_JSON" | jq -r '.Metadata.Name // "(no active rule set)"')
echo "   ├─ hop 2: active receipt rule set: $RULESET_NAME"
printf '%s' "$RULESET_JSON" | jq -r '
  (.Rules // [])[] |
  "   │  ├─ rule: \(.Name) (enabled: \(.Enabled), scan: \(.ScanEnabled), tls: \(.TlsPolicy))\n" +
  "   │  │  ├─ recipients: \((.Recipients // ["(all)"]) | join(", "))\n" +
  "   │  │  └─ actions: \([.Actions[] | if .S3Action then "s3://\(.S3Action.BucketName)/\(.S3Action.ObjectKeyPrefix // "")" else (keys[0]) end] | join(", "))"
'
echo "   │"

# hop 2b: how the bucket guards what it holds — encryption at rest, public block, policy
ENCRYPTION_JSON=$(aws s3api get-bucket-encryption --bucket "$BUCKET" --profile "$PROFILE" --region us-east-1 --output json 2>&1) || wetpaws "s3api get-bucket-encryption failed" "$ENCRYPTION_JSON"
BLOCK_JSON=$(aws s3api get-public-access-block --bucket "$BUCKET" --profile "$PROFILE" --region us-east-1 --output json 2>&1) || wetpaws "s3api get-public-access-block failed" "$BLOCK_JSON"
POLICY_JSON=$(aws s3api get-bucket-policy --bucket "$BUCKET" --profile "$PROFILE" --region us-east-1 --output json 2>&1) || wetpaws "s3api get-bucket-policy failed" "$POLICY_JSON"
echo "   ├─ hop 2b: store guards"
printf '%s' "$ENCRYPTION_JSON" | jq -r '
  .ServerSideEncryptionConfiguration.Rules[] |
  "   │  ├─ encryption at rest: \(.ApplyServerSideEncryptionByDefault.SSEAlgorithm)\(if .ApplyServerSideEncryptionByDefault.KMSMasterKeyID then " (kms: \(.ApplyServerSideEncryptionByDefault.KMSMasterKeyID))" else "" end)"
'
printf '%s' "$BLOCK_JSON" | jq -r '
  .PublicAccessBlockConfiguration |
  "   │  ├─ public access block: acls \(.BlockPublicAcls)/\(.IgnorePublicAcls), policy \(.BlockPublicPolicy)/\(.RestrictPublicBuckets)"
'
printf '%s' "$POLICY_JSON" | jq -r '.Policy | fromjson | .Statement[] |
  "   │  └─ policy: \(.Effect) \(.Action) to \(.Principal | tostring) on \(.Resource | tostring)"
'
echo "   │"

# hop 3: the newest objects in the bucket
OBJECTS_JSON=$(aws s3api list-objects-v2 --bucket "$BUCKET" --profile "$PROFILE" --region us-east-1 --output json 2>&1) || wetpaws "s3api list-objects-v2 failed for the mail bucket" "$OBJECTS_JSON"
COUNT=$(printf '%s' "$OBJECTS_JSON" | jq -r '(.Contents // []) | length')
echo "   └─ hop 3: bucket objects: $COUNT (newest 8)"
printf '%s' "$OBJECTS_JSON" | jq -r '
  (.Contents // []) | sort_by(.LastModified) | reverse | .[0:8][] |
  "      ├─ \(.LastModified) \(.Key)"
'
