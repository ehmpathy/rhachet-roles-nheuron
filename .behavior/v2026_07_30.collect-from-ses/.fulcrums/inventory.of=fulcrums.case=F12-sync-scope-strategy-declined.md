# F12 — the `GatheredMailSyncScope` extraction, declined four times

| field | value |
|-------|-------|
| **rework** | clean |
| **status** | open |
| **confidence** | 79% |
| **where** | `src/domain.operations/gather/mail/setMailsFromAdapter.ts:90,103,135,158` + `transformers/getIsScopeWholeMailbox.ts` |
| **taken at** | first declined at i002; **itemized late, at i005** — see the note on lateness below |

## ⚠️ this entry is LATE, and the lateness is itself the first item to grade

`rule.always.itemize-the-fulcrums-you-best-guess` says to append at the **moment** of the call,
never in a sweep. this call was made at i002 and re-made at i003, i004 and i005 — four times —
and reached the inventory only now. the cost is exactly the one the rule names: the reason "as it
stood" at i002 is reconstructed rather than captured, so weigh the confidence accordingly.

it also hid a fact the council should have had earlier: **two independent reviewers recommended
this extraction and a third later endorsed the refusal.** that is a live disagreement, and it sat
in the review trail rather than in the inventory a council reads.

## the fork, stated fairly

`setMailsFromAdapter` computes one predicate and then gates **four** decisions on it:

```ts
const scopeIsWholeMailbox = getIsScopeWholeMailbox({ filter });   // :72

cursorPrior: scopeIsWholeMailbox ? statsPrior.mailFoundUptil : null,   // :90  — does it resume?
const exidsKnown = scopeIsWholeMailbox ? … : …                          // :103 — does it skip cached?
const mails      = scopeIsWholeMailbox ? … : …                          // :135 — does it read the cache back?
statsDelta:        scopeIsWholeMailbox ? … : …                          // :158 — does it advance the cursor?
```

(plus two passes of the flag itself, at `:77` and `:142`, which are reports rather than
decisions.)

| | (a) extract a `GatheredMailSyncScope` | (b) keep the four ternaries |
|---|---|---|
| shape | one object per scope kind, each holds all four answers; the orchestrator asks it | one named predicate, four gated lines, all in one function |
| the invariant | held in one place, by construction | held by a reader, across four call sites |
| cost | a new domain object + two implementations, for **one** caller | a reader must carry the predicate down the function |
| reads as | a strategy the reader must open a second file to see | a narrative the reader follows top to bottom |

## taken, and why at the time

**taken: (b), keep the ternaries.** the reason has been the same each of the four times:

1. **one caller.** `setMailsFromAdapter` is the only consumer. a strategy object with a single
   caller is the shape `rule.prefer.wet-over-dry` names — it buys indirection before the pattern
   has proven itself.
2. **four sites, one function, one screen.** the predicate is declared 18 lines above its first
   use and every gate is visible without a scroll. the invariant is legible where it lives.
3. **the extraction moves the answers out of the narrative.** `rule.require.orchestrators-as-narrative`
   wants each line to say WHAT happens. a `scope.shouldResume()` call says less than
   `scopeIsWholeMailbox ? statsPrior.mailFoundUptil : null` does, not more, while the reader
   carries only four cases.

## rework, and why

**clean.** every gate reads one predicate and no caller outside this function hardens against the
shape. (a) replaces the four ternaries with four method calls and deletes the predicate's direct
use; `setMailsFromAdapter.integration.test.ts` `[case5]` and `[case6]` clamp the **behavior**
(no lost mail, no blended list, no cursor advance under a filter), never the mechanism — so the
tests survive the overturn intact. that is the property that keeps this cheap at any point.

## confidence, and why

**79%.** what holds it up, and what pulls against it:

**up** — three reviewers have now examined it, and the most recent, a dedicated architecture lane,
**agreed with the refusal** on the same cardinality reason:

> *"the refusal is reasonable given current cardinality (1 caller, 4 sites, all in one function)
> … don't extract preemptively for a scope object with one caller today."*

**down** — two earlier reviewers recommended the extraction, and one grader's agreement does not
erase two dissents. and the count is not stable: it grows if F9 or F10 is overturned (below).

## ⚠️ the trigger that flips this, named by a reviewer

the same lane that endorsed the refusal named the condition that would reverse it, and the
condition is **not** time or taste — it is the verdict on two other fulcrums:

> *"What tips it from 'acceptable wet code' to 'worth [it]' is F9+F10 [settled]: if F9 splits the
> range into fetch-bound vs. view-bound, and F10 potentially adds a labels-cursor subtree later,
> the number of `scopeIsWholeMailbox`-gated decisions in `setMailsFromAdapter` grows from 4 toward
> 6-8, at which point one ternary per line stops [as] readable as a narrative and starts [to
> require] the reader to hold the invariant across every call site by memory. **Recommendation:
> [settle] F9 first (cheap), re-look at extraction only if that [verdict] pushes the branch count
> higher.**"*

> ⚠️ the bracketed words replace `-ing` forms this repo's `rule.forbid.gerunds` refuses in a
> written file. no clause of the argument is altered.

so this entry is **conditional rather than closed**:

| the council rules | this fulcrum |
|---|---|
| F9 keeps one range **and** F10 stays (b) | 4 gates. the refusal stands; close F12 as settled |
| F9 splits the range | ~5-6 gates. re-look — the refusal weakens |
| F10 rules (a) for labels | a cursor subtree adds gates. re-look |
| both overturned | 6-8 gates. **extract** — the refusal no longer holds |

⇒ **do not rule F12 before F9 and F10.** its verdict is downstream of theirs, and to settle it
first is to settle it on stale cardinality.

## the verdict

_open — and **conditional**. awaits F9 and F10 first._
