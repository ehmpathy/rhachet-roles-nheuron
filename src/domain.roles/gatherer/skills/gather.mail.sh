#!/usr/bin/env bash
######################################################################
# .what = shell entrypoint for gather.mail skill
#
# .why = enables direct invocation from CLI, CI/CD, git hooks
#        via location-independent package import
#
# usage:
#   ./gather.mail.sh --from gmail --address user@gmail.com
#   ./gather.mail.sh --from gmail --address user@gmail.com --since 2024-01-01
#   ./gather.mail.sh --from gmail --address user@gmail.com --format json
#   ./gather.mail.sh --from gmail --address user@gmail.com/labels=work,urgent
#   ./gather.mail.sh --from ses --address jelly@one.nheuron.com --since 2026-08-01
#
# options:
#   --from      mail source: gmail, ses (required)
#   --address   email address to collect from (required)
#   --since     only LIST mail since this date (ISO format). it narrows what
#               you SEE on both mechanisms, but only narrows what GMAIL fetches
#               — ses reads the whole s3 prefix, then applies the bound locally.
#   --query     search query to filter mail (gmail only — ses refuses it)
#   --format    output format: tree, json (default: tree)
#   --help      show help message
#
# what each mechanism can filter on:
#   gmail   --since, --query (gmail search syntax), and an --address scoped
#           as user@gmail.com/labels=work,urgent
#   ses     --since only. ses mail is read from an s3 prefix of raw rfc822,
#           which has no search index and no labels, so it REFUSES a --query
#           or a /labels= scope rather than ignore one.
#
# what --since costs, per mechanism:
#   gmail   pushed into the api query as an "after:" term, so the remote never
#           sends the older mail — you pay for the window alone.
#   ses     applied locally, AFTER the walk — every object under the inbound
#           prefix is listed, read, and parsed first. so --since narrows the
#           LIST, never the fetch.
######################################################################
set -euo pipefail

# the entrypoint RETURNS its exit code rather than calls process.exit itself, so that a
# caller who imports it as a library keeps its own process. the shell owns the exit —
# 0 ok, 2 caller-must-fix, 1 unexpected (rule.require.exit-code-semantics)
exec node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- "$@"
