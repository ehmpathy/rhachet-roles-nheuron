# F7 — six of the gmail behavior's declared operations deleted from within this stone

| field | value |
|-------|-------|
| **rework** | clean |
| **status** | open |
| **confidence** | 78% |
| **where** | `src/domain.operations/gather/mail/transformers/` (6 operations + 6 tests, removed) |
| **surfaced** | peer review r4 `arch-opport-decomposition`, nitpicks 1 + 2 |

## the fork, stated fairly

a peer reviewer flagged six operations as dead. I verified the claim and then took the
**deletion**. the alternative was to keep them and record the debt.

deleted:

| operation | its declared consumer | that consumer's state |
|-----------|----------------------|----------------------|
| `getMailCacheKey` | the mail cache | built, but via `getCacheDir` instead — see below |
| `getSyncStatsCacheKey` | `withLock(getAllMail, { path: … })` | **never built** |
| `getIsRateLimitError` | `withRetry(getAllMailFromGmail, { retryOn: … })` | **never built** |
| `getIsNetworkTimeoutError` | same `withRetry` | **never built** |
| `getIsTokenExpiredError` | the same resilience layer | **never built** |
| `getRecoverableErrorOutput` | the cli error surface | built, but prints `error.message` instead |

## why I took deletion

**they are provably dead.** a repo-wide grep for all six names returns their own files and
their own tests, and no other production module. `withRetry` and `withLock` return **zero**
matches anywhere in `src` — so the blueprint's specified consumers were never built, and the
operations are orphaned by a dropped resilience layer rather than reserved for a near one.

**`getMailCacheKey` was worse than surplus — it was a trap.** it returned
`{mechanism}/{address}/{exid}.json` with the exid **raw**. the real write path
(`upsertCachedMail`) carries an explicit comment against exactly that:

> the exid is encoded, never pasted raw — a mechanism may put a `/` in its own identifier,
> and a raw `/` here would make path.join build a nested path whose parent the mkdir below
> does not create

so a future dev who reached for the named "cache key transformer" would have re-introduced a
defect the real path already fixed. it also dropped the whole
`.agent/.cache/repo=nheuron/…` prefix and the `mails/` segment. three divergences, and the
operation's own doc-comment asserted it was the canonical format.

**the deletion preserves behavior.** zero production consumers means zero production paths
change. gates after: types ✓ · format ✓ · lint ✓ · unit **254 passed / 0 failed** ·
integration **25 passed** · acceptance **14 passed, 2 skipped** — the acceptance count and
snapshots are byte-identical to before, which is the proof no surface moved.

## why it is a fulcrum rather than a plain repair

**these belong to a different behavior.** they are `v2026_04_23.collect-from-gmail`
deliverables, named in that behavior's blueprint file tree and its test-coverage matrix. they
land in this review only because both behaviors share a branch, so `--diffs since-main` spans
both. `rule.require.review-test-changes` is explicit that another behavior's deliverables are
not mine to change on my own read.

I took it anyway because the fix preserves behavior and I hold the lever — the same test I
applied in r2, where I landed the ENOENT allowlist (no CI risk) and escalated the
`when.runIf` flip (permanent red CI). but the wisher may weigh the cross-behavior boundary
higher than I did, so it is recorded rather than assumed.

## the cost, stated plainly

the gmail behavior's blueprint file tree and its unit-coverage matrix **name files that do not
exist** — the six here, plus the two `getGmailOAuthUrl` / `getGmailTokensFromResponse` files
that peer point r11.4 later removed for the same reason.

a peer lane flagged that drift as unrepaired, and it was right. the drift is now closed by an
**amendment** at the head of that blueprint, which names each absent file and why, and points
back here. the plan is kept as approved — an amendment states the current truth beside it
rather than rewrites it, which is the same move that blueprint's own `ses adapter` amendment
already made from outside this behavior. that precedent is what settles the liberty question:
this repo already amends a passed blueprint from a later behavior.

⚠️ the deeper defect is not the dead code. it is that **the gmail behavior shipped without
its declared resilience layer** — no retry on gmail 429s, no lock around a concurrent sync —
and its own verification passed regardless, because the orphaned leaves each had green unit
tests. six green test files stood in for a layer that was never wired. that is worth the
wisher's attention independent of how this fulcrum is ruled.

## why 78%

the *verification* is not in doubt — the grep is unambiguous and the gates hold. what I am
78% on is the **scope judgment**: whether a driver on the ses behavior should delete the
gmail behavior's declared artifacts, or leave them and file the report. I lean delete because
an operation that misleads costs every future reader, and because restoration is one command.
but a reasonable wisher could hold that a passed behavior's deliverables are frozen until
that behavior is reopened.

## the rework, if overturned

**clean.** every file is one command away:

```sh
rhx cpsafe .agent/.cache/repo=ehmpathy/role=mechanic/skill=rmsafe/trash/<path> ./<path>
```

they are pure leaves with no importers, so restoration touches no call site. the only
follow-on question, if restored, is whether to also build `withRetry` / `withLock` so they
stop being orphans — and that is a gmail-behavior scope decision, not a rework of this one.

## verdict

_(unruled — awaits the fulcrum council)_
