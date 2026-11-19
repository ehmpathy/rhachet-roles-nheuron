#!/usr/bin/env bash
######################################################################
# .what = shell entrypoint for gather.auth skill
#
# .why = enables direct invocation from CLI, CI/CD, git hooks
#        via location-independent package import
#
# usage:
#   ./gather.auth.sh --from ses --address you@your.domain    # reports the AWS_PROFILE identity
#
# options:
#   --from     mail source: ses (required)
#   --address  email address to check status for (optional)
#   -h, --help show help message
#
# note:
#   ses has no interactive auth flow, by design: iam needs no grant. the
#   credentials come from keyrack:
#     rhx keyrack unlock --owner ehmpath --env prep
######################################################################
set -euo pipefail

# the entrypoint RETURNS its exit code rather than calls process.exit itself, so that a
# caller who imports it as a library keeps its own process. the shell owns the exit —
# 0 ok, 2 caller-must-fix, 1 unexpected (rule.require.exit-code-semantics)
exec node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- "$@"
