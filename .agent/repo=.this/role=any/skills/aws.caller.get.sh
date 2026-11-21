#!/usr/bin/env bash
######################################################################
# ⛵ aws.caller.get — which aws account + role a keyrack env lands in
#
# .what = reads AWS_PROFILE for --env from keyrack and reports the
#         caller identity (account, arn) it lands in; with
#         --expect management, also asserts the account is the
#         management account of its aws organization
#
# .why  = every root apply must first prove it runs as the org manager:
#         a wrong profile silently declares the org, sso, or budgets
#         under the wrong account. this is the paved check, so no run
#         ever reaches for an adhoc `aws sts get-caller-identity`
#
# usage:
#   rhx aws.caller.get --env sudo
#   rhx aws.caller.get --env sudo --expect management
#   rhx aws.caller.get --env prep
#   rhx aws.caller.get help
#
# options:
#   --env ENV        keyrack env: sudo, prep, prod, or test (required)
#   --expect EXPECT  optional assertion: management (the account must be
#                    the management account of its organization)
#
# guarantee:
#   - read-only: sts + organizations describe calls only, never a write
#   - exit 0 = identity read (and the expectation held, if one was given)
#   - exit 1 = malfunction (absent credentials, aws error)
#   - exit 2 = constraint (absent args, bad env, expectation failed)
#
# .note = shaped to the ghlitch deployer contract (mascot, ⛵ tree, require_val,
#         exit codes) so it can be promoted into rhachet-roles-ghlitch as is
######################################################################
set -euo pipefail

show_help() {
  echo "🐈 heres the deal..."
  echo ""
  echo "⛵ aws.caller.get"
  echo ""
  echo "usage:"
  echo "  rhx aws.caller.get --env <env> [--expect management]"
  echo ""
  echo "options:"
  echo "  --env     keyrack env: sudo, prep, prod, or test (required)"
  echo "  --expect  management — assert the account manages its aws organization"
  echo ""
  echo "example:"
  echo "  rhx aws.caller.get --env sudo --expect management"
  exit 0
}

# require a value for a flag — the same helper and message as every kin deployer skill
require_val() {
  # $1 = flag name, $2 = candidate value, $3 = optional comma-joined valid set
  if [[ -z "$2" || "$2" == --* ]]; then
    echo "🐈 belay that..."
    echo ""
    echo "⛵ aws.caller.get"
    echo "   ├─ absent value for $1"
    [[ -n "${3:-}" ]] && echo "   ├─ fix: pass one of $3"
    echo "   └─ hint: rhx aws.caller.get help"
    exit 2
  fi
}

# parse arguments
ENV=""
EXPECT=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      require_val --env "${2:-}" "sudo, prep, prod, test"
      ENV="$2"
      shift 2
      ;;
    --expect)
      require_val --expect "${2:-}" "management"
      EXPECT="$2"
      shift 2
      ;;
    --skill|--repo|--role)
      shift 2 # rhx passthrough args
      ;;
    --)
      shift
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      echo "🐈 belay that..."
      echo ""
      echo "⛵ aws.caller.get"
      echo "   ├─ unknown argument: $1"
      echo "   └─ hint: rhx aws.caller.get help"
      exit 2
      ;;
  esac
done

# validate args
if [[ -z "$ENV" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ aws.caller.get"
  echo "   ├─ absent required arg: --env"
  echo "   └─ must be: sudo, prep, prod, or test"
  exit 2
fi
if [[ "$ENV" != "sudo" && "$ENV" != "prep" && "$ENV" != "prod" && "$ENV" != "test" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ aws.caller.get"
  echo "   ├─ invalid env: $ENV"
  echo "   └─ must be: sudo, prep, prod, or test"
  exit 2
fi
if [[ -n "$EXPECT" && "$EXPECT" != "management" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ aws.caller.get"
  echo "   ├─ invalid expect: $EXPECT"
  echo "   └─ must be: management"
  exit 2
fi

# clear a rival ambient identity: the keyrack profile is the one channel
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN 2>/dev/null || true

echo "🐈 chartin course..."
echo ""
echo "⛵ aws.caller.get --env $ENV"
echo "   ├─ eyes on target..."

# read the profile name from keyrack (a name, not a secret)
PROFILE=$(rhx keyrack get --owner ehmpath --env "$ENV" --key AWS_PROFILE --output value 2>/dev/null || echo "")
if [[ -z "$PROFILE" ]]; then
  echo "   └─ halted: absent credentials"
  echo ""
  echo "🐈 wet paws..."
  echo ""
  echo "⛵ aws.caller.get"
  echo "   ├─ absent AWS_PROFILE from keyrack for env=$ENV"
  echo "   └─ hint: rhx keyrack unlock --owner ehmpath --env $ENV --key AWS_PROFILE"
  exit 1
fi
echo "   ├─ profile: $PROFILE"

# lookup the caller identity
CALLER_JSON=$(aws sts get-caller-identity --profile "$PROFILE" --output json 2>&1) || {
  echo "   └─ halted: identity unreadable"
  echo ""
  echo "🐈 wet paws..."
  echo ""
  echo "⛵ aws.caller.get"
  echo "   ├─ sts get-caller-identity failed for profile $PROFILE"
  echo "   ├─ error: $(printf '%s' "$CALLER_JSON" | head -n 1)"
  echo "   └─ hint: rhx keyrack unlock --owner ehmpath --env $ENV --key AWS_PROFILE"
  exit 1
}
ACCOUNT=$(printf '%s' "$CALLER_JSON" | jq -r '.Account')
ARN=$(printf '%s' "$CALLER_JSON" | jq -r '.Arn')
echo "   ├─ account: $ACCOUNT"

# no expectation: report and close
if [[ -z "$EXPECT" ]]; then
  echo "   └─ arn: $ARN"
  echo ""
  echo "🐈 smooth sailin!"
  echo ""
  echo "⛵ aws.caller.get --env $ENV"
  echo "   └─ account: $ACCOUNT"
  exit 0
fi

# expect management: the account must equal its organization's management account
echo "   ├─ arn: $ARN"
ORG_JSON=$(aws organizations describe-organization --profile "$PROFILE" --output json 2>&1) || {
  echo "   └─ blocked: no organization visible"
  echo ""
  echo "🐈 belay that..."
  echo ""
  echo "⛵ aws.caller.get"
  echo "   ├─ account $ACCOUNT cannot describe an organization"
  echo "   ├─ error: $(printf '%s' "$ORG_JSON" | head -n 1)"
  echo "   └─ fix: point keyrack env=$ENV at the management account's profile"
  exit 2
}
MANAGEMENT=$(printf '%s' "$ORG_JSON" | jq -r '.Organization.MasterAccountId')
if [[ "$ACCOUNT" != "$MANAGEMENT" ]]; then
  echo "   └─ blocked: not the management account"
  echo ""
  echo "🐈 belay that..."
  echo ""
  echo "⛵ aws.caller.get"
  echo "   ├─ caller account: $ACCOUNT"
  echo "   ├─ management account: $MANAGEMENT"
  echo "   └─ fix: point keyrack env=$ENV at the management account's profile"
  exit 2
fi
echo "   └─ management: yes"
echo ""
echo "🐈 smooth sailin!"
echo ""
echo "⛵ aws.caller.get --env $ENV --expect management"
echo "   └─ account: $ACCOUNT (manages its organization)"