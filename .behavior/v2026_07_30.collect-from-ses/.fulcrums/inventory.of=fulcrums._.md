# fulcrum inventory — v2026_07_30.collect-from-ses

the forks taken mid-drive on best-guess rather than escalated, per
`rule.always.defer-fulcrums-to-last`. the council sorts on **rework**.

| case | title | rework | status | confidence |
|------|-------|--------|--------|------------|
| [F1](inventory.of=fulcrums.case=F1-provision-files-live-here.md) | provision files live in this repo, not declastruct-aws | clean | open | 90% |
| [F2](inventory.of=fulcrums.case=F2-local-dns-record-derivation.md) | `asSesMailDnsRecords` is a local copy, not an import | clean | open | 85% |
| [F3](inventory.of=fulcrums.case=F3-minimal-account-triplet.md) | the account triplet is declared minimally (no sso/scp/oidc) | clean | open | 80% |
| [F4](inventory.of=fulcrums.case=F4-shared-mail-constants.md) | one shared constants module, not a literal per wish | clean | open | 92% |
| [F5](inventory.of=fulcrums.case=F5-account-mismatch-guarded-by-prose.md) | the account mismatch is guarded by a human check, not by code | clean | open | 70% |
| [F6](inventory.of=fulcrums.case=F6-bucket-name-carries-no-account-id.md) | the inbound bucket name carries no account discriminator | clean | open | 75% |
| [F7](inventory.of=fulcrums.case=F7-deleted-another-behaviors-orphans.md) | six of the gmail behavior's orphaned operations deleted from this stone | clean | open | 78% |
| [F8](inventory.of=fulcrums.case=F8-acceptance-gate-turned-red.md) | the gmail behavior's acceptance gate turned RED, green only by a human's hand | clean | ruled: D, a `TEST_LIVE` flag gate (commander) | 88% |
| [F9](inventory.of=fulcrums.case=F9-fetch-range-is-also-the-view-range.md) | the fetch range doubles as the view range, so a bare re-run shows a delta | clean | open | 61% |
| [F10](inventory.of=fulcrums.case=F10-filtered-runs-are-non-incremental.md) | a filtered run is non-incremental, rather than separately cached | clean | open | 81% |
| [F11](inventory.of=fulcrums.case=F11-since-does-not-bound-the-ses-walk.md) | `--since` bounds the gmail fetch but not the ses one; capped, not pushed down | clean | open | 76% |
| [F12](inventory.of=fulcrums.case=F12-sync-scope-strategy-declined.md) | the `GatheredMailSyncScope` extraction, declined four times — **conditional on F9 + F10** | clean | best-guessed: (b) upheld | 79% |
| [F13](inventory.of=fulcrums.case=F13-upgrade-churn-restored-in-git-only.md) | the upgrade's `.claude` relocation restored in git, not on disk; dispatcher `extends` kept | clean | open | 80% |
| [F14](inventory.of=fulcrums.case=F14-r10-graded-the-gmail-behavior.md) | peer r10 graded the gmail behavior's wish; its five concerns disputed as scope, caught for the gmail route | clean | open | 85% |
| [F15](inventory.of=fulcrums.case=F15-provision-wishes-source-at-load.md) | the provision wishes source keyrack, and refuse absent account emails, at module load | clean | open | 72% |
| [F16](inventory.of=fulcrums.case=F16-error-header-names-two-classes.md) | the error header named two classes (`ConstraintError: BadRequestError:`); cut in 5.3, the `helpful-errors` upgrade caught as a dream | clean | taken: (b), fixed in 5.3 | 90% |
| [F17](inventory.of=fulcrums.case=F17-obfuscated-null-body-reads-as-the-obfuscation.md) | an obfuscated mail's absent body reads as the obfuscation literal, not `null` — a reversed assertion, approval owed | clean | ruled: (a) revert (director) | 90% |

## ⚠️ a note on when these were recorded

the rule asks that a fulcrum be appended **at the moment** it is taken. F1–F4 were recorded in
a sweep at the close of the execution stone instead. the cost is the one the rule names: the
reason "as it stood" is reconstructed rather than captured live, so a reviewer should weigh the
stated confidence accordingly. F3 in particular is the one most likely to have looked different
mid-drive.

⚠️ **F12 is late by four iterations, which is worse than F1–F4's sweep.** the call was taken at
i002 and re-taken at i003, i004 and i005 without an entry. so a live three-reviewer disagreement
sat in the review trail rather than in the inventory a council reads. its own entry opens with
this, rather than buries it.

**F5 and F6 are the exceptions, and are the shape the rule asks for** — each was surfaced and
recorded in the same pass, so its reason is live rather than reconstructed. they are also the
two lowest-confidence entries, which is not a coincidence: a fork captured at the moment of the
choice records the doubt honestly, where a reconstructed one tends to read as more settled than
it was.

⚠️ **read F5 and F6 together, and first.** they concern one hazard — the mail wish applied into
the wrong aws account. F5 is whether the code refuses it; F6 is whether the mistake is
recoverable when it happens. F5 is the only entry whose author recommends the overturn.

⚠️ **read F7 and F8 together, and last.** neither is a design fork within this behavior's own
bounds — both are **scope** forks about how far this stone may reach into the gmail behavior
(`v2026_04_23`), which shares this branch.

- **F7** — this stone **deleted** six of that behavior's orphaned operations. it carries a
  defect worth a look even if the deletion is upheld: the gmail behavior shipped without the
  retry/lock layer its blueprint declared, and six green unit tests on the orphaned leaves
  concealed the gap.
- **F8** — this stone turned that behavior's acceptance gate **RED**, and no code on this
  branch can turn it green. it needs the wisher to fill two gmail secrets and add them to the
  CI workflow.

both were forced by rules that do not hedge, and both spend someone else's release readiness to
satisfy them. that is the question the council owes an answer to.

⚠️ **F9 is the one a human will FEEL.** every other entry is a decision about how the code is
arranged; F9 is a decision about what a human sees at their terminal when they run the skill a
second time. it is also among the lowest confidences here, and — like F5, F6 and F10 — it was
recorded in the same pass that took it, so its doubt is live rather than reconstructed.

⚠️ **F9, F10 and F11 are neighbors — all three are the gap between what a run COSTS and what it
SHOWS.** F9 asks whether the cursor should bound what a human sees as well as what is fetched.
F10 asks whether a *filtered* run should touch the cursor at all. F11 asks what the surface
should say when one flag (`--since`) is a real fetch bound on gmail and a local filter on ses.

F10 and F11 were both **forced** — the ungated shape lost mail permanently and silently, and the
uncapped walk had no upper bound at all — so what the council rules on in each is the SHAPE of
the fix, never whether to fix it.

⚠️ **F11 is the one a rule may already have decided.** `rule.forbid.ambiguous-labels` grades a
flag that reads one way and behaves two ways as a **blocker**. its entry takes the documentation
option and says plainly why that may be too little — the author's own recommendation is the one
place to look first there.

⚠️ **F12 is DOWNSTREAM of F9 and F10 — rule it last of the three.** whether the four-way scope
branch in `setMailsFromAdapter` is worth an extraction depends on how many branches survive: F9's
split and F10's labels-cursor would each add gates, which moves 4 toward 6-8. a reviewer named
that exact threshold. so F12 ruled first is F12 ruled on stale cardinality; its entry carries the
verdict table.

## ⚠️ how i005 changed these numbers, and why

i005's `enroll-impl-arch-defects` lane was **the first dedicated architecture pass since i001** —
the eight rubric lanes have been dark for four rounds on a suspended account. it moved three
confidences, in both directions, which is the shape of a review that read rather than agreed:

| entry | before | after | why |
|-------|--------|-------|-----|
| F9 | 72% | **61%** | the lane **dissented** — its counter-argument is now quoted in full in the entry |
| F10 | 74% | **81%** | the lane **concurred, on a reason of its own** (yield, not cardinality) — an argument that survives a verdict mine would not |
| F12 | — | **79%** | first itemized; the lane endorsed the refusal AND named the trigger that flips it |

⇒ the general point for the council: **a dark lane is not a neutral cost.** four rounds without an
architecture grader left three defects unfixed and one fulcrum un-itemized. the account at
fireworks.ai is the fix.

**i007 confirmed that point twice over.** the same lane ran again and found **three more** real
defects that six prior rounds had not — one of which, a duplicate obfuscation with drifted
literals, meant the security-replacement string a human ever saw on their terminal was never the
one the single source declared. its tally malfunctioned; only its prose survived to be read.

it also became the **third reviewer on F12**, and the second to endorse the refusal — so that
entry's confidence stands at 79% against a live 2-endorse / 2-recommend split, which is exactly
the shape a council should rule on rather than a driver.

## .see also

- `5.1.execution.from_vision.yield.md` — the execution these forks arose within
