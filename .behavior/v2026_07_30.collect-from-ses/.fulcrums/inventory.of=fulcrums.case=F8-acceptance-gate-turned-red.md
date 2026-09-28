# F8 — the acceptance gate is turned RED, deliberately, and only a human can turn it green

| field | value |
|-------|-------|
| **rework** | clean — one `if` reverted to a `when.runIf` restores the prior behavior |
| **status** | open |
| **confidence** | 88% |
| **where** | `src/domain.operations/gather/__test_acceptance__/gatherMail.acceptance.test.ts` (`[case7]`) |
| **when** | recorded at the moment of the change, mid-r008 repair |

## the fork, stated fairly

two peer lanes (r008 blocker.5, r009 blocker.3) named the same defect: `[case7]` — the **only**
acceptance case that proves gmail collection actually works — was wrapped in
`when.runIf(hasCredentials)`. with no gmail secrets in the env, it did not run, and the suite
went green.

the fork was **which repair to take**:

| option | what it does | cost |
|---|---|---|
| **A — throw (taken)** | absent credentials raise a `BadRequestError` naming the CI fix | the gate goes RED on this branch and stays red until a human acts |
| B — keep the skip, add a CI-only assert | skip locally, fail only when `process.env.CI` is set | a local run still proves naught; the "excuse" survives one env deep |
| C — mock the gmail api for the positive path | always green | a fresh `rule.forbid.acceptance.mocks` violation; proves the mock, not gmail |

## taken, and why — at the time

**A.** the deciding read was that `rule.require.failfast` and `rule.forbid.failhide` do not
hedge on this: *"absent resource = unacceptable, always fail loud"*, and `given.runIf` /
`when.runIf` are named **by name** as blockers. B keeps the same lie behind one more condition;
C swaps a silent skip for a confident falsehood.

## ⚠️ why this is a fulcrum and not just a repair

**the consequence lands outside this behavior's bounds.** `[case7]` is a *gmail* case, from the
`v2026_04_23` behavior that shares this branch. so this stone's change makes **another
behavior's** acceptance suite fail, and no code in this branch can make it pass. it needs:

1. a human to fill `GMAIL_SERVICE_ACCOUNT_JSON` + `GMAIL_SERVICE_ACCOUNT_SUBJECT` in keyrack
2. those two keys added to `.github/workflows/test.yml` under `secrets:`

verified state: acceptance is **17 passed / 2 failed / 0 skipped**. the 2 failures are this
case's two `then` blocks, and the failure text is the throw itself:

```
BadRequestError: the gmail service account is required for the positive-path acceptance case
  hint: local: rhx keyrack unlock --owner ehmpath --env test. ci: add both keys to
        .github/workflows/test.yml `secrets:` (see howto.create-gmail-service-account)
```

this is the same scope shape as **F7** — a change inside this stone that reaches into the gmail
behavior's artifacts. F7 deleted its orphans; F8 turns its gate red. both deserve the wisher's
read as scope calls, not just as repairs.

## why rework is clean

the whole change is one helper and one call site. to revert: restore `hasCredentials` +
`when.runIf`, and the suite is green again in a single commit. no later work is built atop the
new behavior.

## why confidence is 88% and not higher

the **rule** is unambiguous — a skip is a blocker, and two independent lanes flagged it. what is
not certain is whether the wisher wants a **cross-behavior** gate flipped from this stone without
a say. a driver that turns another behavior's CI red is making a call about someone else's
release readiness.

the 12% doubt is entirely that, not the correctness of the repair.

## the verdict

*(awaits the wisher)*

## .see also

- `F7` — the peer scope fork: this stone deleted the gmail behavior's orphaned operations
- `…r008._.taken.by_self.behavior-intent-coverage.md` — blocker.5, the repair in full
- `rule.require.failfast` / `rule.forbid.failhide` (code.test) — the rules that forced option A
- `philosophy.verification-strictness` — "zero credential excuses", "a skip is a hidden lie"
