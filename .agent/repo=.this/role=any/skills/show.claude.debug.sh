#!/usr/bin/env bash
######################################################################
# .what = show Claude Code debug logs for current session
#
# .why  = helps diagnose hook execution issues:
#         - which hooks are matched
#         - which hooks timeout
#         - which hooks produce output
#
# usage:
#   show.claude.debug.sh                    # show hook entries from current session
#   show.claude.debug.sh --filter "hook"    # filter to specific pattern
#   show.claude.debug.sh --tail 100         # show last N lines
#   show.claude.debug.sh --session UUID     # show specific session
#   show.claude.debug.sh --list             # list recent sessions
#
# guarantee:
#   - reads from ~/.claude/debug/
#   - fail-fast on errors
######################################################################

set -uo pipefail
# note: -e omitted because SIGPIPE (141) is expected when piping to head/less

# defaults
FILTER="hook"
TAIL_LINES=100
SESSION_ID=""
LIST_SESSIONS=false

# parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    # rhachet passes these - ignore them
    --skill|--repo|--role)
      shift 2
      ;;
    --filter)
      FILTER="$2"
      shift 2
      ;;
    --tail)
      TAIL_LINES="$2"
      shift 2
      ;;
    --session)
      SESSION_ID="$2"
      shift 2
      ;;
    --list)
      LIST_SESSIONS=true
      shift
      ;;
    --all)
      FILTER=""
      shift
      ;;
    --help|-h)
      echo "usage: show.claude.debug.sh [options]"
      echo ""
      echo "options:"
      echo "  --filter PATTERN   filter to lines matching pattern (default: 'hook')"
      echo "  --all              show all debug lines (no filter)"
      echo "  --tail N           show last N matching lines (default: 100)"
      echo "  --session UUID     show specific session by ID"
      echo "  --list             list recent debug sessions"
      echo "  --help             show this help"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

DEBUG_DIR="$HOME/.claude/debug"

# list sessions mode
if [[ "$LIST_SESSIONS" == "true" ]]; then
  echo "recent debug sessions:"
  echo ""
  ls -lt "$DEBUG_DIR"/*.txt 2>/dev/null | head -10 | while read -r line; do
    file=$(echo "$line" | awk '{print $NF}')
    size=$(echo "$line" | awk '{print $5}')
    date=$(echo "$line" | awk '{print $6, $7, $8}')
    session=$(basename "$file" .txt)
    echo "  $date  ${size}B  $session"
  done
  exit 0
fi

# find the debug file
if [[ -n "$SESSION_ID" ]]; then
  DEBUG_FILE="$DEBUG_DIR/${SESSION_ID}.txt"
  if [[ ! -f "$DEBUG_FILE" ]]; then
    echo "error: session not found: $SESSION_ID" >&2
    exit 1
  fi
else
  # find most recent debug file
  DEBUG_FILE=$(ls -t "$DEBUG_DIR"/*.txt 2>/dev/null | head -1)
  if [[ -z "$DEBUG_FILE" ]]; then
    echo "error: no debug files found in $DEBUG_DIR" >&2
    exit 1
  fi
  SESSION_ID=$(basename "$DEBUG_FILE" .txt)
fi

echo "session: $SESSION_ID"
echo "file: $DEBUG_FILE"
echo "filter: ${FILTER:-'(none)'}"
echo "---"
echo ""

# show the debug output
if [[ -n "$FILTER" ]]; then
  grep -Ei "$FILTER" "$DEBUG_FILE" | tail -"$TAIL_LINES"
else
  tail -"$TAIL_LINES" "$DEBUG_FILE"
fi
