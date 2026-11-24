#!/usr/bin/env bash
######################################################################
# ⛵ test.live — run a test suite with its live-service gates open
#
# .what = sets TEST_LIVE to the named services, then hands every other
#         arg to `rhx git.repo.test`
#
# .why  = the live cases (ses, cloudflare, aws.accounts, gmail) touch real services and stay
#         closed by default. an env-var prefix on the command line is not
#         a paved shape, so the gate opens through this one skill
#
# usage:
#   rhx test.live --live ses --what integration --scope sendReplyViaSes
#   rhx test.live --live ses --what acceptance --against local --env test --scope gatherMail
#   rhx test.live --live ses,cloudflare --what integration
#
# options:
#   --live SERVICES   comma list of live gates: ses, cloudflare, aws.accounts, gmail (required)
#   (all else)        passed through to rhx git.repo.test; --mode apply is
#                     added when absent, since a live run is never a plan
#
# guarantee:
#   - refuses an unknown service name (exit 2)
#   - exit code is git.repo.test's own
######################################################################
set -euo pipefail

# emit a constraint refusal and exit 2
belay() {
  echo "🐈 belay that..."
  echo ""
  echo "⛵ test.live"
  echo "   ├─ $1"
  echo "   └─ $2"
  exit 2
}

# parse arguments: --live is ours, the rest pass through
LIVE=""
PASS=()
HAS_MODE=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --live)
      LIVE="${2:-}"
      shift 2
      ;;
    --mode)
      HAS_MODE=true
      PASS+=("$1" "${2:-}")
      shift 2
      ;;
    --skill|--repo|--role)
      shift 2 # rhx passthrough args
      ;;
    help|--help|-h)
      echo "🐈 heres the deal..."
      echo ""
      echo "⛵ test.live"
      echo "   ├─ usage: rhx test.live --live <ses|cloudflare|aws.accounts|gmail>[,…] <git.repo.test args>"
      echo "   └─ example: rhx test.live --live ses --what integration --scope sendReplyViaSes"
      exit 0
      ;;
    *)
      PASS+=("$1")
      shift
      ;;
  esac
done

# validate the gate names
[[ -z "$LIVE" ]] && belay "absent required arg: --live" "pass a comma list of: ses, cloudflare, aws.accounts, gmail"
IFS=',' read -r -a SERVICES <<< "$LIVE"
for SERVICE in "${SERVICES[@]}"; do
  [[ "$SERVICE" =~ ^(ses|cloudflare|aws\.accounts|gmail)$ ]] || belay "unknown live gate: $SERVICE" "pass a comma list of: ses, cloudflare, aws.accounts, gmail"
done

# a live run executes; it never stops at a plan
[[ "$HAS_MODE" == true ]] || PASS+=("--mode" "apply")

# open the gates, then run the suite
export TEST_LIVE="$LIVE"
exec rhx git.repo.test "${PASS[@]}"
