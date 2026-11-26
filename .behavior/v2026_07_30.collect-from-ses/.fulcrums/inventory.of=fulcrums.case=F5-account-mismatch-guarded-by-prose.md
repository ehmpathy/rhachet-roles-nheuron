# F5 — the account mismatch is guarded by a human check, not by code

## the fork, stated fairly

`AWS_PROFILE` is one keyrack key, and this stack needs it to point at **two different accounts
in sequence**: `nheuron-root` for the account wish, then `nheuron-prep` for the mail wish. a
human who forgets to change it between the two steps applies the whole mailbox — bucket, ses
identity, iam role — into the org's **management account**.

that failure is silent. the apply *succeeds*. and it is not undone by a re-apply: an s3 bucket
name is globally unique, so the fix is a teardown in the wrong account, then a fresh apply in
the right one. what it costs is the second wall of the nest
(`philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`) — the exact wall this behavior
provisioned a whole account triplet to build.

| option | argument for |
|--------|-------------|
| **a human check in the apply procedure** (taken) | no new keyrack key, no new fill step, no new machinery; `aws sts get-caller-identity` names the account in one command |
| a `NHEURON_PREP_ACCOUNT_ID` keyrack key + a throw | a real guard — the wish refuses rather than trusts. this is the `DKIM_TOKENS` pattern already used in this stack for a value minted by a prior apply |

## taken, and why at the time

**the human check.** both apply procedures now open with a numbered **step 1** that runs
`aws sts get-caller-identity` and states the expected account, and the mail readme names where
the account id reappears in the `plan` output (twice, inside the bucket policy) so it is
confirmed a second time before any mutation.

the reason a code guard is not merely absent but genuinely hard: **there is no value to compare
against.** `nheuron-prep`'s id is minted by the account wish, so it is not a constant at
authorship time. and the account wish's own job is to *learn* the management id from its
credentials — it holds no independent second source to check that id against. any code guard
therefore has to import a new hand-carried value.

so the choice was: add a keyrack key + a fill step to a handoff already blocked on a human, or
make the manual check concrete and explicit. I took the second because it adds no new burden and
covers most of the risk, and because the value a guard would need does not exist until step 3 of
that same handoff.

## rework, and why

**clean.** additive in full: declare `NHEURON_PREP_ACCOUNT_ID` in `.agent/keyrack.yml`, read it
in `getResourcesOfMail` beside the extant region guard, throw on mismatch. no prior work has to
be undone — the human check stays valuable either way, as a pre-plan sanity read.

## confidence

**70% — the lowest of the five, and deliberately so.**

the 30% is not doubt about the hazard; it is that I do not believe a documented check is an
adequate guard for a failure this expensive, and this behavior's own review thesis is that
**prose is not a guard**. by that standard, which I applied to five other findings, this one
should have been code.

what holds me at "taken" rather than "blocked": the guard needs a value that does not exist
until the human is already mid-handoff, so it is not a fork I can settle without the wisher's
call on whether one more keyrack key is worth it. that is precisely a fulcrum, not a blocker
(`rule.always.defer-fulcrums-to-last`).

⇒ **of the five, this is the one I would most expect the council to overturn**, and I would
not argue against it.

## where

- `provision/aws.mail/account=prep/readme.md` — the mail-side check + the blast-radius note
- `provision/aws.auth/account=.root/bootstrap.md` — the root-side check
- `provision/aws.mail/account=prep/resources.mail.ts` — where the guard would sit, beside the
  extant region guard that handles the analogous (and lesser) hazard in code

## a third option the council should weigh first: refuse the ROOT account, not confirm prep

peer r11 (i002) found that the "no value exists yet" objection blocks only a POSITIVE check
(*is this prep?*). a NEGATIVE check (*is this NOT root?*) needs the root account id, which the
human holds from `bootstrap.md` before this wish can run. the worst miss — mail landed in the
management account — is then caught on apply #1:

```ts
if (account === NHEURON_ROOT_ACCOUNT_ID)
  BadRequestError.throw('mail wish applied against the root account', { account, hint: '...' });
```

its cost is one more keyrack key (`NHEURON_ROOT_ACCOUNT_ID`, env `prep`) the human fills, sourced
the same way as the two account emails. that new credential is the wisher's call, so it stays
here rather than lands in code. it leaves F6 (the bucket account-suffix) unchanged.

## the verdict

open — awaits the fulcrum council.
