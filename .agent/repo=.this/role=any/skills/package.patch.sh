#!/usr/bin/env bash
######################################################################
# ⛵ package.patch — patch a dependency in place via pnpm patch
#
# .what = opens an editable copy of an installed package (--mode open),
#         then turns the edits into a patches/*.patch file that pnpm
#         applies on every install (--mode commit)
#
# .why  = a defect in a dependency must be fixed at its cause, now, even
#         before upstream ships the fix. a pnpm patch is that fix: it is
#         declared in package.json, reviewable as a diff, and re-applied
#         on every install. the upstream fix rides a radio dispatch
#
# usage:
#   rhx package.patch --package declastruct-aws@1.13.0 --mode open
#   rhx package.patch --package declastruct-aws@1.13.0 --mode commit
#   rhx package.patch help
#
# options:
#   --package NAME@VERSION  the installed package to patch (required)
#   --mode MODE             open | commit (required)
#
# guarantee:
#   - the edit dir is .temp/patch.<name>@<version> (gitignored)
#   - open refuses if the edit dir already holds edits (commit or clear it first)
#   - commit refuses if no edit dir is open
#   - exit 0 = done · 1 = malfunction (pnpm failed) · 2 = constraint (bad args)
######################################################################
set -euo pipefail

show_help() {
  echo "🐈 heres the deal..."
  echo ""
  echo "⛵ package.patch"
  echo "   ├─ usage: rhx package.patch --package <name>@<version> --mode open|commit"
  echo "   ├─ options"
  echo "   │  ├─ --package  the installed package to patch, as name@version (required)"
  echo "   │  └─ --mode     open = copy it out to edit · commit = write patches/*.patch (required)"
  echo "   └─ example"
  echo "      ├─ rhx package.patch --package declastruct-aws@1.13.0 --mode open"
  echo "      ├─ edit files under .temp/patch.declastruct-aws@1.13.0/"
  echo "      └─ rhx package.patch --package declastruct-aws@1.13.0 --mode commit"
  exit 0
}

# halt with a constraint: the caller must fix the input
halt_constraint() {
  # $1 = what, $2 = fix
  echo "🐈 belay that..."
  echo ""
  echo "⛵ package.patch"
  echo "   ├─ $1"
  echo "   └─ fix: $2"
  exit 2
}

# parse arguments
PACKAGE=""
MODE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --package)
      [[ -z "${2:-}" || "${2:-}" == --* ]] && halt_constraint "absent value for --package" "pass name@version, e.g. declastruct-aws@1.13.0"
      PACKAGE="$2"
      shift 2
      ;;
    --mode)
      [[ -z "${2:-}" || "${2:-}" == --* ]] && halt_constraint "absent value for --mode" "pass open or commit"
      MODE="$2"
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
      halt_constraint "unknown argument: $1" "see rhx package.patch help"
      ;;
  esac
done

# validate args
[[ -z "$PACKAGE" ]] && halt_constraint "absent required arg: --package" "pass name@version, e.g. declastruct-aws@1.13.0"
[[ "$PACKAGE" != *?@?* ]] && halt_constraint "--package needs an exact version: $PACKAGE" "pass name@version, e.g. declastruct-aws@1.13.0"
[[ -z "$MODE" ]] && halt_constraint "absent required arg: --mode" "pass open or commit"
[[ "$MODE" != "open" && "$MODE" != "commit" ]] && halt_constraint "invalid mode: $MODE" "pass open or commit"

REPO_ROOT=$(git rev-parse --show-toplevel)
EDIT_DIR="$REPO_ROOT/.temp/patch.$PACKAGE"

echo "🐈 chartin course..."
echo ""
echo "⛵ package.patch --package $PACKAGE --mode $MODE"
echo "   ├─ edit dir: .temp/patch.$PACKAGE"

# open: copy the installed package out to the edit dir
if [[ "$MODE" == "open" ]]; then
  [[ -d "$EDIT_DIR" ]] && halt_constraint "an edit dir is already open: .temp/patch.$PACKAGE" "commit it (--mode commit) or delete it first"
  mkdir -p "$REPO_ROOT/.temp"
  # a package installed under several peer variants of one version makes pnpm prompt
  # "choose which version to patch"; every option is the same name@version, and the
  # patchedDependencies key name@version applies to all of them, so the first is taken
  # and the follow-up "apply this patch to all versions?" is answered yes. the prompts read
  # keystrokes only from a terminal, so pnpm runs under the util-linux pty wrapper.
  # each answer is sent only once its prompt has drawn: keystrokes sent on a clock race the
  # render, and a `y` that lands in the version search box opens no edit dir
  cd "$REPO_ROOT"
  coproc PNPM_PATCH { script -qec "pnpm patch '$PACKAGE' --edit-dir '$EDIT_DIR'" /dev/null 2>&1; }
  # bash unsets the coproc pid var the moment the coproc exits; keep it to read the exit code
  PNPM_PATCH_PROC="$PNPM_PATCH_PID"
  OUT=""
  IS_VERSION_ANSWERED=false
  IS_ALL_ANSWERED=false
  while IFS= read -r -t 120 -N 1 CHAR <&"${PNPM_PATCH[0]}"; do
    OUT+="$CHAR"
    # the version pick: take the first option
    if [[ "$IS_VERSION_ANSWERED" == false && "$OUT" == *"Choose which version to patch"* ]]; then
      sleep 0.5
      printf '\r' >&"${PNPM_PATCH[1]}"
      IS_VERSION_ANSWERED=true
    fi
    # the scope confirm: yes, all variants (the confirm reads `y`, then submits on enter)
    if [[ "$IS_ALL_ANSWERED" == false && "$OUT" == *"Apply this patch to all versions"* ]]; then
      sleep 0.5
      printf 'y' >&"${PNPM_PATCH[1]}"
      sleep 0.5
      printf '\r' >&"${PNPM_PATCH[1]}"
      IS_ALL_ANSWERED=true
    fi
  done
  wait "$PNPM_PATCH_PROC" || {
    echo "   └─ 💥 pnpm patch failed"
    echo ""
    printf '%s\n' "$OUT" | sed 's/^/      /'
    exit 1
  }
  # pnpm can exit 0 yet open no edit dir (e.g., a package installed under several peer
  # variants); never report "opened" for a dir that is not there
  [[ -d "$EDIT_DIR" ]] || {
    echo "   └─ 💥 pnpm patch exited 0, yet opened no edit dir"
    echo ""
    printf '%s\n' "$OUT" | sed 's/^/      /'
    exit 1
  }
  echo "   └─ opened"
  echo ""
  echo "🐈 smooth sailin!"
  echo ""
  echo "⛵ next"
  echo "   ├─ edit the files under .temp/patch.$PACKAGE/"
  echo "   └─ rhx package.patch --package $PACKAGE --mode commit"
  exit 0
fi

# commit: write the patch file and re-install with it applied
[[ ! -d "$EDIT_DIR" ]] && halt_constraint "no edit dir is open: .temp/patch.$PACKAGE" "open one first (--mode open)"
OUT=$(cd "$REPO_ROOT" && pnpm patch-commit "$EDIT_DIR" 2>&1) || {
  echo "   └─ 💥 pnpm patch-commit failed"
  echo ""
  printf '%s\n' "$OUT" | sed 's/^/      /'
  exit 1
}
rm -rf "$EDIT_DIR"
echo "   ├─ patch: $(cd "$REPO_ROOT" && git status --short --untracked-files=all patches | awk '{print $2}' | tr '\n' ' ')"
echo "   └─ committed + re-installed"
echo ""
echo "🐈 smooth sailin! the patch applies on every install"