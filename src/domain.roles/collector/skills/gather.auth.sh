#!/usr/bin/env bash
######################################################################
# .what = shell entrypoint for gather.auth skill
#
# .why = enables direct invocation from CLI, CI/CD, git hooks
#        via location-independent package import
#
# usage:
#   ./gather.auth.sh --from gmail --address user@gmail.com   # check auth status
#   ./gather.auth.sh --from ses --address you@your.domain --org nheuron --env prod
#
# options:
#   --org, --env  the keyrack slot to source first (ses: AWS_PROFILE).
#              omit both to use the env as it stands
#   --from     mail source: gmail, ses (required)
#   --address  email address to check status for (optional)
#   -h, --help show help message
#
# note:
#   NEITHER mechanism has an interactive auth flow today. ses has none by design
#   (iam needs no grant); `--from gmail` without --address refuses with exit 2 and
#   names the service account keys to fill. credentials come from keyrack either way:
#     rhx keyrack unlock --owner ehmpath --env test   # gmail
#     rhx keyrack unlock --owner ehmpath --org nheuron --env prod   # ses
######################################################################
set -euo pipefail

# the entrypoint RETURNS its exit code rather than calls process.exit itself, so that a
# caller who imports it as a library keeps its own process. the shell owns the exit —
# 0 ok, 2 caller-must-fix, 1 unexpected (rule.require.exit-code-semantics)
source "$(dirname "${BASH_SOURCE[0]}")/gather._.keyrack.sh"
gather_keyrack_source "$@"
exec node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- "${GATHER_ARGS[@]}"
