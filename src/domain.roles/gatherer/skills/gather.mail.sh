#!/usr/bin/env bash
######################################################################
# .what = shell entrypoint for gather.mail skill
#
# .why = enables direct invocation from CLI, CI/CD, git hooks
#        via location-independent package import
#
# usage:
#   ./gather.mail.sh --from ses --address jelly@one.nheuron.com
#   ./gather.mail.sh --from ses --address jelly@one.nheuron.com --since 2026-08-01
#   ./gather.mail.sh --from ses --address jelly@one.nheuron.com --format json
#
# options:
#   --from      mail source: ses (required)
#   --address   email address to collect from (required)
#   --since     only LIST mail since this date (ISO format)
#   --format    output format: tree, json (default: tree)
#   -h, --help  show help message
#
# what --since costs:
#   applied locally, AFTER the walk — every object under the inbound s3 prefix
#   is listed, and each one not yet cached is read and parsed. so --since
#   narrows the LIST, never the fetch.
######################################################################
set -euo pipefail

# the entrypoint RETURNS its exit code rather than calls process.exit itself, so that a
# caller who imports it as a library keeps its own process. the shell owns the exit —
# 0 ok, 2 caller-must-fix, 1 unexpected (rule.require.exit-code-semantics)
exec node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- "$@"
