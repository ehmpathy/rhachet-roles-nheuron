#!/usr/bin/env bash
######################################################################
# ⛵ mail.roundtrip.prove — prove a mailbox sends and receives, end to end
#
# .what = sends one probe mail FROM the address TO itself through ses (the
#         real send path, sendReplyViaSes), then polls gather.mail until the
#         probe lands back in the mailbox. the probe subject carries a nonce,
#         so only this run's mail can satisfy the proof
#
# .why  = the roundtrip crosses every live part at once: iam grant, dkim-signed
#         send, public mx, the receipt rule, the s3 store, the gatherer read.
#         a self-send is the one roundtrip the ses sandbox permits, since the
#         verified domain is both sender and recipient
#
# usage:
#   rhx mail.roundtrip.prove --env prod --address jelly@one.nheuron.com
#   rhx mail.roundtrip.prove --env prep --address jelly@one.prep.nheuron.com
#
# options:
#   --env ENV        the mailbox env: prep or prod (required)
#   --address ADDR   the mailbox to prove (required)
#
# guarantee:
#   - sends exactly one probe per run; a re-run sends one more probe, never a
#     reply to any human (the recipient is always the address itself)
#   - exit 0 = probe sent and gathered back
#   - exit 1 = malfunction (send failed, or the probe never arrived in 180s)
#   - exit 2 = constraint (bad args, absent keys)
######################################################################
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"

# emit a constraint refusal and exit 2
belay() {
  echo "🐈 belay that..."
  echo ""
  echo "⛵ mail.roundtrip.prove"
  echo "   ├─ $1"
  echo "   └─ $2"
  exit 2
}

# parse arguments
ENV=""
ADDRESS=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="${2:-}"
      shift 2
      ;;
    --address)
      ADDRESS="${2:-}"
      shift 2
      ;;
    --skill|--repo|--role)
      shift 2 # rhx passthrough args
      ;;
    help|--help|-h)
      echo "🐈 heres the deal..."
      echo ""
      echo "⛵ mail.roundtrip.prove"
      echo "   ├─ usage: rhx mail.roundtrip.prove --env <prep|prod> --address <mailbox>"
      echo "   └─ sends a nonce probe to the mailbox itself, then gathers it back"
      exit 0
      ;;
    *)
      belay "unknown argument: $1" "hint: rhx mail.roundtrip.prove help"
      ;;
  esac
done
[[ "$ENV" == "prep" || "$ENV" == "prod" ]] || belay "invalid or absent --env: ${ENV:-(absent)}" "must be: prep or prod"
[[ "$ADDRESS" == *@* ]] || belay "invalid or absent --address: ${ADDRESS:-(absent)}" "pass the mailbox, e.g. jelly@one.nheuron.com"

# source the env's mailbox slot: AWS_PROFILE + SES_*
EXPORTS=$(rhx keyrack source --owner ehmpath --org nheuron --env "$ENV" --lenient)
eval "$EXPORTS"
for KEY in AWS_PROFILE SES_MAIL_BUCKET SES_REGION SES_CONFIG_SET; do
  [[ -n "${!KEY:-}" ]] || belay "absent: nheuron.$ENV.$KEY" "fix: rhx keyrack unlock --owner ehmpath --org nheuron --env $ENV"
done

# the probe: a nonce in the subject, so only this run's mail satisfies the proof
NONCE="roundtrip-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
SINCE="$(date -u +%Y-%m-%d)"

echo "🐈 chartin course..."
echo ""
echo "⛵ mail.roundtrip.prove --env $ENV --address $ADDRESS"
echo "   ├─ probe: $NONCE"

# send the probe via the real send path
cd "$REPO_ROOT"
MESSAGE_ID=$(PROBE_ADDRESS="$ADDRESS" PROBE_NONCE="$NONCE" npx tsx -e "
import { sendReplyViaSes } from './src/domain.operations/gather/adapters/ses/mail/sendReplyViaSes';
const quiet = () => undefined;
sendReplyViaSes(
  {
    from: process.env.PROBE_ADDRESS!,
    to: process.env.PROBE_ADDRESS!,
    subject: process.env.PROBE_NONCE!,
    body: 'a roundtrip probe, sent by mail.roundtrip.prove',
    inReplyTo: null,
  },
  { log: { debug: quiet, info: quiet, warn: quiet, error: quiet } },
).then((result) => console.log(result.messageId));
") || {
  echo "   └─ 💥 send failed"
  exit 1
}
echo "   ├─ sent: $MESSAGE_ID"

# poll the mailbox until the probe lands back; a failed gather halts at once, its stderr shown
for ATTEMPT in $(seq 1 18); do
  sleep 10
  GATHERED=$(rhx gather.mail --from ses --address "$ADDRESS" --org nheuron --env "$ENV" --since "$SINCE" --format json) || {
    echo "   └─ 💥 gather failed after $(( ATTEMPT * 10 ))s (its error is above)"
    exit 1
  }
  if printf '%s' "$GATHERED" | grep -q "$NONCE"; then
    echo "   ├─ gathered: after $(( ATTEMPT * 10 ))s"
    echo "   └─ 🎉 roundtrip proven: $ADDRESS sent to itself and read it back"
    exit 0
  fi
  echo "   ├─ 💤 not yet ($(( ATTEMPT * 10 ))s)"
done
echo "   └─ 💥 probe not gathered after 180s"
echo "      └─ hint: rhx gather.mail --from ses --address $ADDRESS --org nheuron --env $ENV --since $SINCE"
exit 1
