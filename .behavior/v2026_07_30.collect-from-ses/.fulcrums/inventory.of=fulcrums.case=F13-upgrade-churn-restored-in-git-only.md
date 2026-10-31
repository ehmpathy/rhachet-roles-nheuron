# F13 — the upgrade's `.claude` relocation is restored in git, not on disk

| field | value |
|-------|-------|
| **rework** | clean — one revert of the commit's `.agent/keyrack.yml` hunk, or one `git rm` of `.claude/settings.json` |
| **status** | open |
| **confidence** | 80% |
| **where** | `.claude/settings.json`, `.agent/keyrack.yml`, `.gitignore` |
| **when** | recorded at the moment of the change, 2026-10-31 |

## the fork, stated fairly

the director ordered: restore the keyrack.yml comments and `.claude/settings.json` the upgrade
churned; keep only real pin bumps.

`rhachet@1.50.1` moved `.claude/` into the actor dir
(`.agent/.actors/actor.via.repo=ambient/brain/.claude`) and left a `.claude` symlink in its
place. the live session runs from that actor dir. so a disk restore of `.claude/settings.json`
must replace the symlink with a real dir.

| option | what it does | cost |
|---|---|---|
| **A — restore in git only (taken)** | the commit leaves `.claude/settings.json` as committed; the local deletion stays unstaged | local tree stays dirty on one path |
| B — restore on disk too | replace the `.claude` symlink with a real dir | breaks the actor layout the bumped `rhachet` pin expects; hooks may fire twice |

## taken, and why

**A.** the order targets what lands in the repo. git keeps the file byte-for-byte; the live actor
layout stays intact.

two adjacent calls ride with it:

- the `.gitignore` line `!.agent/.actors/actor.via.repo=ambient/` is reverted. it would un-ignore
  session history and a symlink to the human's `~/.claude/settings.json`
- the `extends: .agent/repo=bhuild/role=dispatcher/keyrack.yml` line is **kept**. the bumped
  `rhachet-roles-bhuild` pin ships that role, so the line is part of the pin bump, not churn

## why confidence is 80%

the director may want the new actor layout rejected outright (option B), or the dispatcher
`extends` dropped as churn. each is a one-commit change.

## the verdict

*(awaits the director)*
