#!/usr/bin/env bash
######################################################################
# ⛵ provision.root — plan/apply a declastruct wish AS the org manager
#
# .what = runs a root (management-account) declastruct wish via
#         plan/apply, under keyrack env sudo, and only after
#         aws.caller.get proves that env lands in the management
#         account of its aws organization
#
# .why  = org, sso, scp, and budget wishes must run as the org manager.
#         a wrong profile declares them under the wrong account, and
#         the wish cannot catch that itself (it learns the account FROM
#         the credentials). this skill makes the check a code guard,
#         never a human glance
#
# usage:
#   rhx provision.root --wish <path> --mode plan
#   rhx provision.root --wish <path> --mode apply
#   rhx provision.root help
#
# options:
#   --wish WISH   path to a declastruct resources.ts (required)
#   --mode MODE   plan or apply (required)
#   --plan PLAN   plan file path (optional; defaults to <wish>.plan.json)
#   --key KEY     an extra keyrack env=sudo key the wish reads (repeatable);
#                 AWS_PROFILE is always unlocked
#
# guarantee:
#   - plan writes <wish>.plan.json; apply reads it, and refuses without it
#   - refuses before any declastruct call unless the caller is the
#     management account (aws.caller.get --env sudo --expect management)
#   - exit 0 = provision completed
#   - exit 1 = malfunction (declastruct/aws error)
#   - exit 2 = constraint (absent args, absent plan, not the manager)
#
# .note = mirrors ghlitch deployer provision.declastruct (flags, plan file,
#         mascot, nest). it exists because that skill's --env admits no
#         management env (sudo); once ghlitch accepts one, this skill reduces
#         to the management guard + a delegation
######################################################################
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

show_help() {
  echo "🐈 heres the deal..."
  echo ""
  echo "⛵ provision.root"
  echo "   ├─ usage: rhx provision.root --wish <path> --mode <mode>"
  echo "   ├─ options"
  echo "   │  ├─ --wish   path to a declastruct resources.ts (required)"
  echo "   │  ├─ --mode   plan or apply (required)"
  echo "   │  ├─ --plan   plan file path (optional; defaults to <wish>.plan.json)"
  echo "   │  └─ --key    an extra sudo key the wish reads (repeatable; AWS_PROFILE is always unlocked)"
  echo "   └─ example"
  echo "      └─ rhx provision.root --wish provision/aws.budget/account=.root/resources.ts --mode plan"
  exit 0
}

# require a value for a flag — the same helper and message as every kin deployer skill
require_val() {
  # $1 = flag name, $2 = candidate value, $3 = optional comma-joined valid set
  if [[ -z "$2" || "$2" == --* ]]; then
    echo "🐈 belay that..."
    echo ""
    echo "⛵ provision.root"
    echo "   ├─ absent value for $1"
    [[ -n "${3:-}" ]] && echo "   ├─ fix: pass one of $3"
    echo "   └─ hint: rhx provision.root help"
    exit 2
  fi
}

# parse arguments
WISH=""
MODE=""
PLAN=""
KEYS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --wish)
      require_val --wish "${2:-}"
      WISH="$2"
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
    --key)
      require_val --key "${2:-}"
      KEYS+=("$2")
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
      echo "⛵ provision.root"
      echo "   ├─ unknown argument: $1"
      echo "   └─ hint: rhx provision.root help"
      exit 2
      ;;
  esac
done

# validate args
if [[ -z "$WISH" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.root"
  echo "   ├─ absent required arg: --wish"
  echo "   └─ hint: rhx provision.root --wish <path> --mode plan"
  exit 2
fi
if [[ ! -f "$WISH" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.root"
  echo "   ├─ wish not found: $WISH"
  echo "   └─ hint: pass a path to a declastruct resources.ts"
  exit 2
fi
if [[ "$MODE" != "plan" && "$MODE" != "apply" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.root"
  echo "   ├─ invalid or absent --mode: ${MODE:-(absent)}"
  echo "   └─ must be: plan or apply"
  exit 2
fi
PLAN_FILE="${PLAN:-$WISH.plan.json}"
if [[ "$MODE" == "apply" && ! -f "$PLAN_FILE" ]]; then
  echo "🐈 belay that..."
  echo ""
  echo "⛵ provision.root"
  echo "   ├─ plan not found: $PLAN_FILE"
  echo "   └─ hint: run --mode plan first"
  exit 2
fi

# nest helper, from the ghlitch package, so declastruct's own tree renders inside ours
source "$REPO_ROOT/node_modules/rhachet-roles-ghlitch/dist/domain.roles/operator/skills/_.nest.sh"

echo "🐈 chartin course..."
echo ""
echo "⛵ provision.root --wish $WISH --mode $MODE"
echo "   ├─ wish: $WISH"
echo "   ├─ mode: $MODE"

# unlock env sudo, key by key: sudo keys sit in no manifest, so keyrack demands each by name.
# AWS_PROFILE always; each --key adds one more a wish reads (e.g. a root-only account email)
echo "   ├─ unlock the keyrack..."
for SUDO_KEY in AWS_PROFILE ${KEYS[@]+"${KEYS[@]}"}; do
  run_sub_bucket_or_belay "   │  " "⛵ provision.root" "blocked at the keyrack ($SUDO_KEY)" \
    rhx keyrack unlock --owner ehmpath --env sudo --key "$SUDO_KEY"
done

# guard: the sudo env must land in the management account, or no call is made
echo "   ├─ prove the org manager..."
run_sub_bucket_or_belay "   │  " "⛵ provision.root" "blocked: not the org manager" \
  bash "$SKILL_DIR/aws.caller.get.sh" --env sudo --expect management

# one credential channel: the sudo profile, no ambient rival
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_PROFILE 2>/dev/null || true
AWS_PROFILE=$(rhx keyrack get --owner ehmpath --env sudo --key AWS_PROFILE --output value)
export AWS_PROFILE
export AWS_REGION=us-east-1
echo "   ├─ identity: AWS_PROFILE = $AWS_PROFILE"

# hand each extra sudo key to the wish's process. a wish's own keyrack.source cannot reach
# sudo: it enumerates keyrack.yml, and sudo keys never land there. names only in the render
for SUDO_KEY in ${KEYS[@]+"${KEYS[@]}"}; do
  SUDO_VALUE=$(rhx keyrack get --owner ehmpath --env sudo --key "$SUDO_KEY" --output value)
  export "$SUDO_KEY=$SUDO_VALUE"
  echo "   ├─ handed: $SUDO_KEY = (set)"
done

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
echo "⛵ provision.root --wish $WISH --mode $MODE"
if [[ "$MODE" == "plan" ]]; then
  echo "   └─ planned → $PLAN_FILE"
fi
if [[ "$MODE" == "apply" ]]; then
  echo "   └─ provisioned"
fi