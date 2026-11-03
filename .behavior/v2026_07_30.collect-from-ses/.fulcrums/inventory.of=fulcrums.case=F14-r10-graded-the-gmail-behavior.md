# F14 — peer r10 graded the gmail behavior's wish at the ses stone

| field | value |
|-------|-------|
| **rework** | clean — the five concerns ride to the gmail behavior's route; none is built atop here |
| **status** | open |
| **confidence** | 85% |
| **where** | peer r10 (`enroll-impl-behavior-intent`), i010 of `5.1.execution.from_vision` |
| **when** | recorded at the moment of the dispute, 2026-11-01 |

## the fork, stated fairly

r10 states its own scope choice: it saw the worktree name `collect-from-gmail`, judged the bound
route (`v2026_07_30.collect-from-ses`) the wrong one, and graded
`.behavior/v2026_04_23.collect-from-gmail/` instead. its five concerns:

| # | concern | owner behavior |
|---|---|---|
| blocker.1 | gmail auth needs a workspace service account; the gmail wish scoped v1 to personal `@gmail.com` via oauth | `v2026_04_23.collect-from-gmail` |
| blocker.2 | gmail 429 responses have no retry/backoff | `v2026_04_23.collect-from-gmail` (F7 records the unwired retry layer) |
| nitpick.1 | first sync reads the whole mailbox; the gmail vision asked for `--since` on first run | `v2026_04_23.collect-from-gmail` |
| nitpick.2 | no automated success-path acceptance case | both — answered here by `[case7]` + `[case11]` behind `TEST_LIVE` (F8, option D) |
| nitpick.3 | corrupt cache fails loud, not checksum + re-sync | `v2026_04_23.collect-from-gmail` |

| option | what it does | cost |
|---|---|---|
| **A — dispute as scope (taken)** | each concern goes to the gmail behavior's route as a caught dream; this stone passes on its own wish | the gmail gaps wait for that route |
| B — concede and fix here | rebuild gmail oauth, add 429 retry, first-run `--since`, cache checksum | four gmail features land in the ses stone, outside its wish and vision |

## taken, and why

**A.** this stone's wish and vision are ses: provision send + read infra, the ses adapter, the
live loop. none of the five concerns names an ses requirement. to concede them here would grow
the ses stone by four gmail features its wish never asked for (`rule.prefer.bounded-scope`), and
the commander's order scopes this pass to "all work no credential binds" on **this** stone.

the concerns are not dropped: `dreams/v2026_11_01.reseed.gmail-behavior-r10-concerns.md` carries
each to the gmail behavior's owner. nitpick.2 is the one that touches this stone, and the flag
gate already answers it.

## why confidence is 85%

blocker.2 sits closest to this stone: F7 deleted the gmail behavior's orphaned retry leaves, so a
reader may hold that this stone removed the 429 path r10 asks for. it did not remove a live path:
F7's evidence shows the leaves had zero callers, so a 429 surfaced the same way before and after.
the doubt is whether the council wants the retry wired before the branch merges, since both
behaviors ship in one pr.

## the verdict

*(awaits the council)*
