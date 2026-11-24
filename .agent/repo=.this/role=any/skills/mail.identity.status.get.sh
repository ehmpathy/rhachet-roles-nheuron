#!/usr/bin/env bash
######################################################################
# ⛵ mail.identity.status.get — has ses verified each domain of an env?
#
# .what = for each domain of an env's mailbox, reads the ses identity live
#         and prints its send verification and its dkim status
#
# .why  = an identity verifies only once its dns records stand, and dns is
#         entered by hand. this answers "did the records take?" before any
#         send is tried, with no raw aws cli call to approve
#
# usage:
#   rhx mail.identity.status.get --env prep
#   rhx mail.identity.status.get --env prod
#   rhx mail.identity.status.get help
#
# options:
#   --env ENV   the mailbox env: prep or prod (required)
#
# guarantee:
#   - read-only: sesv2 get-email-identity only
#   - reads keyrack org=nheuron env=ENV for the member profile
#   - exit 0 = every domain verified, dkim SUCCESS
#   - exit 1 = malfunction (aws error)
#   - exit 2 = constraint (bad args, absent profile, identity not applied,
#              or any domain not yet verified)
######################################################################
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

# emit a constraint refusal and exit 2
belay() {
  echo "🐈 belay that..."
  echo ""
  echo "⛵ mail.identity.status.get"
  echo "   ├─ $1"
  echo "   └─ $2"
  exit 2
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
      echo "⛵ mail.identity.status.get"
      echo "   ├─ usage: rhx mail.identity.status.get --env <prep|prod>"
      echo "   └─ prints whether ses has verified each domain of the env's mailbox"
      exit 0
      ;;
    *)
      belay "unknown argument: $1" "hint: rhx mail.identity.status.get help"
      ;;
  esac
done
if [[ "$ENV" != "prep" && "$ENV" != "prod" ]]; then
  belay "invalid or absent --env: ${ENV:-(absent)}" "must be: prep or prod"
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

# read each identity live; collect one tree line per domain
LINES=()
IS_ALL_VERIFIED=true
for DOMAIN in $DOMAINS; do
  IDENTITY_JSON=$(aws sesv2 get-email-identity --email-identity "$DOMAIN" --profile "$PROFILE" --region us-east-1 --output json 2>&1) || {
    if printf '%s' "$IDENTITY_JSON" | grep -q 'NotFoundException'; then
      belay "identity not applied: $DOMAIN" "fix: rhx provision.member --wish provision/aws.mail/account=$ENV/resources.mail.ts --env $ENV --org nheuron --mode apply"
    fi
    echo "🐈 wet paws..."
    echo ""
    echo "⛵ mail.identity.status.get"
    echo "   ├─ sesv2 get-email-identity failed for $DOMAIN"
    echo "   └─ error: $(printf '%s' "$IDENTITY_JSON" | head -n 1)"
    exit 1
  }
  VERIFIED=$(printf '%s' "$IDENTITY_JSON" | jq -r '.VerifiedForSendingStatus')
  DKIM=$(printf '%s' "$IDENTITY_JSON" | jq -r '.DkimAttributes.Status')
  [[ "$VERIFIED" == "true" && "$DKIM" == "SUCCESS" ]] || IS_ALL_VERIFIED=false
  LINES+=("$DOMAIN|$VERIFIED|$DKIM")
done

# render the tree
echo "🐈 heres the chart..."
echo ""
echo "⛵ mail.identity.status.get --env $ENV"
echo "   ├─ identities (${#LINES[@]})"
for INDEX in "${!LINES[@]}"; do
  IFS='|' read -r DOMAIN VERIFIED DKIM <<< "${LINES[$INDEX]}"
  if [[ "$INDEX" -eq $(( ${#LINES[@]} - 1 )) ]]; then TRUNK='   │  └─ '; LIMB='   │     '; else TRUNK='   │  ├─ '; LIMB='   │  │  '; fi
  echo "${TRUNK}${DOMAIN}"
  echo "${LIMB}├─ verified for send: ${VERIFIED}"
  echo "${LIMB}└─ dkim: ${DKIM}"
done
echo "   │"
if [[ "$IS_ALL_VERIFIED" == true ]]; then
  echo "   └─ every domain verified"
  exit 0
fi
echo "   └─ not yet verified: dns records absent or not yet propagated"
echo "      └─ hint: rhx mail.dns.records.get --env $ENV"
exit 2
