# F10 — a filtered run is non-incremental, rather than separately cached

| field | value |
|-------|-------|
| **rework** | clean |
| **status** | open |
| **confidence** | 81% |
| **where** | `src/domain.operations/gather/mail/transformers/getIsScopeWholeMailbox.ts` + its four gates in `setMailsFromAdapter.ts` |
| **taken at** | while peer point r11.1 (i003) was repaired, 2026-09-07 |

## the fork, stated fairly

the cache dir and the sync cursor are keyed on `GatheredMailRepo` — `mechanism` + `address` —
with no filter component. so each answers *"what does this address hold, in full?"*, and a
filtered run has no answer to give. left ungated, that produced permanent silent mail loss
(a filtered run advanced the shared cursor, and a later bare run skipped past it).

the defect had to be closed. **which** way it closed is the fork, and the reviewer explicitly
declined to prescribe one:

| | (a) key by a filter digest | (b) a filtered run is non-incremental |
|---|---|---|
| shape | each distinct filter gets its own cursor + cache subtree, nested under the repo | a filtered run reads no cursor, writes no cursor, requests no skip, and reports what it fetched |
| a filtered run is cached | yes | no |
| cost | a free-text `--query` spawns an unbounded set of subtrees; only the labels half can be locally re-filtered from `GatheredMail.labels`, so `--query` likely wants its own subtree regardless | a filtered run re-fetches its range every time |
| size | a real design pass: a digest function, a nested path scheme, and a story for cache eviction | four gated lines behind one named predicate |

### ⚠️ option (a) has a sharper form than first stated — the fork splits by cardinality

i004's r011 refined (a) in a way the original statement missed, and a fulcrum that omits the
best form of the option it rejected is not a fair statement of the fork. so, recorded:

| the filter | cardinality | what (a) can honestly offer it |
|------------|-------------|-------------------------------|
| `labels=` | **bounded, enumerable** — a mailbox has a finite label set | its own persistent cursor + cache subtree, with no unbounded growth. labels are also locally re-filterable from `GatheredMail.labels`, so one subtree could serve many label queries |
| `--query` | **unbounded** — free text | non-incremental is correct regardless; a digest per distinct query spawns subtrees without limit |

⇒ **(a) is not one option but two**, and only the labels half is clearly worth its complexity.
that makes the council's decision cheaper than the table below implies: it may rule (a) for
labels and (b) for query — a split no earlier statement of this fulcrum offered.

## taken, and why at the time

**taken: (b).** three reasons, in the order they weighed:

1. **the defect was severe and live.** permanent silent mail loss earns the smallest correct
   fix that closes it, rather than the largest correct design that also closes it.
2. **only one mechanism has a filter at all.** ses refuses every filter outright, so (a) would
   build a general cache scheme for gmail alone — `rule.prefer.wet-over-dry`.
3. **(b) is honest where (a) is merely clever.** under (b) the contract reads plainly: a
   narrowed run pays full freight and claims no completeness. under (a) the system holds N
   cursors whose mutual consistency is a new invariant nobody has yet had to reason about.

## rework, and why

**clean.** the four gates all read one predicate, so (a) replaces that predicate's call sites
with a digest-derived path rather than rewrites the orchestrator. concretely: `getCacheDir` and
the sync-stats path each take the filter, `getIsScopeWholeMailbox` is deleted, and the four
ternaries collapse. no caller outside `setMailsFromAdapter` hardens against the current shape.

`[case5]` of `setMailsFromAdapter.integration.test.ts` is the clamp either way — it asserts what
a human must SEE (no lost mail, no blended list), never which mechanism delivers it. so it
survives the overturn intact, which is the property that makes the rework cheap.

## confidence, and why it is low

**81%** — raised from 74% at i005, after a second, independent reviewer concurred on a reason of
its own (see below). what pulls against the call:

- **(b) removes a capability that was implicitly on offer.** before this fix a filtered run
  did (incorrectly) benefit from the cache. a human with a large mailbox who runs `--query`
  daily now pays a full fetch each time, and no message tells them why.
- **the reviewer named (a) first**, and cast (b) as the "simpler, costs the cache benefit, but
  honest" option. I agree with that read and chose the honest one — but a reviewer who weighs
  the cache benefit higher would land the other way.
- **the general shape may arrive soon.** the moment a second mechanism honors a filter, (a)
  stops being speculative. so (b) may be a fix with a known expiry.

what holds it above a coin flip: (b) is strictly correct, and (a) is strictly larger. a correct
small fix that a later behavior replaces costs far less than a design pass taken under the
pressure of an open data-loss defect.

### ✅ a second reviewer concurs, and adds an argument I had not made

i005's `enroll-impl-arch-defects` lane — the first dedicated architecture pass since i001 —
agreed with (b), and its reason is **not** the reason above. credited here because it strengthens
the call independently of my own:

> *"The cardinality split r011 added (labels=bounded, query=unbounded) is the correct shape *if*
> this is ever revisited, but [to build] it now would be speculative generality for a codebase
> where exactly one mechanism (gmail) can even produce a filter, and where `--query` (the
> unbounded half) makes a general per-filter cache scheme partly wasted effort regardless."*

⇒ the added clause is the last one. my case for (b) rested on **cardinality** — that the
unbounded `--query` half cannot be cached sanely. the lane's case rests on **yield**: even if the
labels half were built, the `--query` half stays uncached, so a general per-filter scheme is
partly wasted **whichever** way cardinality is ruled. that argument survives a verdict that mine
would not, so it raises rather than merely echoes the confidence.

## the mitigation, split by what the verdict can falsify

i004's r010 raised the second bullet above as a defect in its own right: *"F10's cost is
invisible to the user, not just open — no log line above debug level, no CLI help text, and no
readme sentence."* that read is correct, and the gap is now half closed. the split is
deliberate:

| the signal | shipped? | why |
|------------|----------|-----|
| **readme** — a scoped run is not cached, never incremental, and lists only what it matched | ✅ shipped | true under **either** verdict. under (a) the readme changes; under (b) it stands. a human who reads before they run is served now |
| **a runtime line** — e.g. `scope-limited runs are not cached — refetch of full range` | ❌ held | true under (b) **only**. rule (a) and the message becomes a lie the code prints on every run |

the runtime half is exactly the shape `rule.always.defer-fulcrums-to-last` says to hold: it is
not a fix that awaits effort, it is a sentence whose truth value the council's verdict decides.
to ship it now is to bet that verdict, and the bet is unnecessary — the readme carries the same
information at the cost of one read.

⇒ **if the council rules (b), the runtime line ships with it.** it is one string in
`getTreeOutput`, gated on the predicate that already exists.

## the verdict

_open — awaits the council._
