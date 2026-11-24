#!/usr/bin/env bash
######################################################################
# .what = shared operation for the gather.* entrypoints: source one
#         keyrack slot into the env, named by --org and --env
#
# .why = the ses mechanism reads AWS_PROFILE and SES_* from the env, and
#        `keyrack unlock` alone places none of them there. a caller names
#        the slot the way `keyrack unlock` does (--org, --env), and the
#        entrypoint sources it, so no `eval` is owed by the caller
#
# usage (from an entrypoint):
#   source "$(dirname "${BASH_SOURCE[0]}")/gather._.keyrack.sh"
#   gather_keyrack_source "$@"
#   exec node ... -- "${GATHER_ARGS[@]}"
#
# guarantee:
#   - --org and --env are consumed here; every other arg lands in GATHER_ARGS
#   - no --env = no source: the env is used as it stands (tests, ci)
#   - --org with no --env refuses (exit 2): a slot needs its env
#   - lenient: a key absent from the slot is skipped, so the mechanism's own
#     auth check names what is absent
######################################################################

# source the named keyrack slot into the env; leave the rest of the args in GATHER_ARGS
gather_keyrack_source() {
  local org=""
  local env=""
  GATHER_ARGS=()
  while [[ $# -gt 0 ]]; do
    case $1 in
      --org)
        org="${2:-}"
        shift 2
        ;;
      --env)
        env="${2:-}"
        shift 2
        ;;
      *)
        GATHER_ARGS+=("$1")
        shift
        ;;
    esac
  done

  # no slot named: use the env as it stands
  if [[ -z "$env" && -z "$org" ]]; then
    return 0
  fi

  # a slot needs its env
  if [[ -z "$env" ]]; then
    echo "✋ ConstraintError: --org needs --env" >&2
    echo "   └─ fix: pass both, e.g. --org nheuron --env prod" >&2
    exit 2
  fi

  # read the slot's export lines, then apply them
  local exports
  local org_args=()
  [[ -n "$org" ]] && org_args=(--org "$org")
  exports=$(rhx keyrack source --owner ehmpath --env "$env" "${org_args[@]}" --lenient) || {
    echo "💥 MalfunctionError: keyrack source failed for env=$env org=${org:-(none)}" >&2
    echo "   └─ fix: rhx keyrack unlock --owner ehmpath --env $env ${org:+--org $org}" >&2
    exit 1
  }
  eval "$exports"
}
