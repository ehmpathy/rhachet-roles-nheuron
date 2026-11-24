#!/usr/bin/env bash
######################################################################
# ⛵ provision.member — plan/apply a declastruct wish INTO a member account
#
# .what = runs a member-account declastruct wish via plan/apply, under
#         one keyrack env + org, and only after aws.caller.get proves
#         that slot lands in a member account (never the org manager)
#
# .why  = a workload wish (e.g. the ses mailbox) belongs in a member
#         account. a wrong profile applies it with success into the
#         management account, which dissolves the account wall, and a
#         globally named bucket makes the fix a teardown. the wish cannot
#         catch that itself (it learns the account FROM the credentials),
#         so this skill makes the check a code guard, never a human glance
#
# usage:
#   rhx provision.member --wish <path> --env prod --org nheuron --mode plan
#   rhx provision.member --wish <path> --env prod --org nheuron --mode apply
#   rhx provision.member help
#
# options:
#   --wish WISH   path to a declastruct resources.ts (required)
#   --env ENV     keyrack env: test, prep, or prod (required)
#   --org ORG     keyrack org (optional; default: the repo's default org)
#   --mode MODE   plan or apply (required)
#   --plan PLAN   plan file path (optional; defaults to <wish>.plan.json)
#
# guarantee:
#   - plan writes <wish>.plan.json; apply reads it, and refuses without it
#   - refuses before any declastruct call unless the slot lands in a
#     member account (aws.caller.get --expect member)
#   - exit 0 = provision completed
#   - exit 1 = malfunction (declastruct/aws error)
#   - exit 2 = constraint (absent args, absent plan, not a member account)
#
# .note = twin of provision.root (same flags, plan file, mascot, nest), and
#         of ghlitch deployer provision.declastruct, which admits no --org and
#         no member guard. once ghlitch accepts both, this skill reduces to a
#         delegation
######################################################################
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

show_help() {
  echo "🐈 heres the deal..."
  echo ""
  echo "⛵ provision.member"
  echo "   ├─ usage: rhx provision.member --wish <path> --env <env> [--org <org>] --mode <mode>"
  echo "   ├─ options"
  echo "   │  ├─ --wish   path to a declastruct resources.ts (required)"
  echo "   │  ├─ --env    keyrack env: test, prep, or prod (required)"
  echo "   │  ├─ --org    keyrack org (optional; default: the repo's default org)"
  echo "   │  ├─ --mode   plan or apply (required)"
  echo "   │  └─ --plan   plan file path (optional; defaults to <wish>.plan.json)"
  echo "   └─ example"
  echo "      └─ rhx provision.member --wish provision/aws.mail/account=prod/resources.mail.ts --env prod --org nheuron --mode plan"
  exit 0
}

# require a value for a flag — the same helper and message as every kin deployer skill
require_val() {
  # $1 = flag name, $2 = candidate value, $3 = optional comma-joined valid set
  if [[ -z "$2" || "$2" == --* ]]; then
    echo "🐈 belay that..."
    echo ""
    echo "⛵ provision.member"
    echo "   ├─ absent value for $1"
    [[ -n "${3:-}" ]] && echo "   ├─ fix: pass one of $3"
    echo "   └─ hint: rhx provision.member help"
    exit 2
  fi
}

# parse arguments
WISH=""
ENV=""
ORG=""
MODE=""
PLAN=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --wish)
      require_val --wish "${2:-}"
      WISH="$2"
      shift 2
      ;;
    --env)
      require_val --env "${2:-}" "test, prep, prod"
      ENV="$2"
      shift 2
      ;;
    --org)
      require_val --org "${2:-}"
      ORG="$2"
      shift 2
      ;;
    --mode)
      require_val --mode "${2:-}" "plan, apply"
      MODE="$2"
      shift 2
      ;;
    --plan)
      require_val --plan "${2:-}"
      PLAN="$2"
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
      echo "⛵ provision.member"
      echo "   ├─ unknown argument: $1"
      echo "   └─ hint: rhx provision.member help"
      exit 2
      ;;
  esac
done

# validate args
if [[ -z "$WISH" || ! -f "$WISH" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.member"
  echo "   ├─ wish absent or not found: ${WISH:-(absent)}"
  echo "   └─ hint: pass --wish <path to a declastruct resources.ts>"
  exit 2
fi
if [[ "$ENV" != "test" && "$ENV" != "prep" && "$ENV" != "prod" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.member"
  echo "   ├─ invalid or absent --env: ${ENV:-(absent)}"
  echo "   └─ must be: test, prep, or prod (a root wish runs via provision.root)"
  exit 2
fi
if [[ "$MODE" != "plan" && "$MODE" != "apply" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.member"
  echo "   ├─ invalid or absent --mode: ${MODE:-(absent)}"
  echo "   └─ must be: plan or apply"
  exit 2
fi
PLAN_FILE="${PLAN:-$WISH.plan.json}"
if [[ "$MODE" == "apply" && ! -f "$PLAN_FILE" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.member"
  echo "   ├─ plan not found: $PLAN_FILE"
  echo "   └─ hint: run --mode plan first"
  exit 2
fi

# the keyrack org flag, only when one was named (else keyrack reads its default org)
ORG_ARGS=()
[[ -n "$ORG" ]] && ORG_ARGS=(--org "$ORG")
ORG_LABEL="${ORG:+ --org $ORG}"

# nest helper, from the ghlitch package, so declastruct's own tree renders inside ours
source "$REPO_ROOT/node_modules/rhachet-roles-ghlitch/dist/domain.roles/operator/skills/_.nest.sh"

echo "🐈 chartin course..."
echo ""
echo "⛵ provision.member --wish $WISH --env $ENV$ORG_LABEL --mode $MODE"
echo "   ├─ wish: $WISH"
echo "   ├─ mode: $MODE"

# unlock the slot: every key the manifest declares for this env + org
echo "   ├─ unlock the keyrack..."
run_sub_bucket_or_belay "   │  " "⛵ provision.member" "blocked at the keyrack" \
  rhx keyrack unlock --owner ehmpath ${ORG_ARGS[@]+"${ORG_ARGS[@]}"} --env "$ENV"

# guard: the slot must land in a member account, or no call is made
echo "   ├─ prove a member account..."
run_sub_bucket_or_belay "   │  " "⛵ provision.member" "blocked: not a member account" \
  bash "$SKILL_DIR/aws.caller.get.sh" --env "$ENV" ${ORG_ARGS[@]+"${ORG_ARGS[@]}"} --expect member

# one credential channel: the slot's profile, no ambient rival
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_PROFILE 2>/dev/null || true
AWS_PROFILE=$(rhx keyrack get --owner ehmpath ${ORG_ARGS[@]+"${ORG_ARGS[@]}"} --env "$ENV" --key AWS_PROFILE --output value)
export AWS_PROFILE
export AWS_REGION=us-east-1
echo "   ├─ identity: AWS_PROFILE = $AWS_PROFILE"

# plan: preview the diff and write the plan file
if [[ "$MODE" == "plan" ]]; then
  echo "   └─ plan infra changes..."
  run_sub_bucket "      " \
    npx declastruct plan --wish "$WISH" --into "$PLAN_FILE" || exit $?
fi

# apply: apply the reviewed plan
if [[ "$MODE" == "apply" ]]; then
  echo "   └─ apply reviewed plan..."
  run_sub_bucket "      " \
    npx declastruct apply --plan "$PLAN_FILE" || exit $?
fi

echo ""
echo "🐈 smooth sailin!"
echo ""
echo "⛵ provision.member --wish $WISH --env $ENV$ORG_LABEL --mode $MODE"
if [[ "$MODE" == "plan" ]]; then
  echo "   └─ planned → $PLAN_FILE"
fi
if [[ "$MODE" == "apply" ]]; then
  echo "   └─ provisioned"
fi