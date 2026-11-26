# F3 — the account triplet is declared minimally (no sso, no scp, no oidc)

## the fork, stated fairly

the vision's deliverable (a0) sketched a full `provision/aws.auth/` tree mirrored on a peer
repo:

```
account=.root/  resources.prod.account.ts  resources.prep.account.ts
                resources.admin.sso.ts     resources.scp.ts
account=prod/   resources.oidc.ts
account=prep/   resources.oidc.ts
```

| option | argument for |
|--------|-------------|
| **the accounts alone** (taken) | the mail loop needs the accounts and no more; `rule.prefer.wet-over-dry` refuses a build for a hypothetical |
| the full tree | org-wide SCPs are a genuine wall in the fort-knox nest, and sso beats a long-lived root profile for human access |

## taken, and why at the time

**the accounts alone** — the organization + `nheuron-prod` + `nheuron-prep`.

the reads that decided it:

- the vision presented that tree as *"the layout mirrors a peer repo"* — a description of the
  shape to follow, not an enumeration of what the wish must contain
- each of sso / scp / oidc is **additive**: a later wish declares them without a change to the
  account declarations
- a human reaches each member account by assume of `OrganizationAccountAccessRole`, which the
  account declaration already sets — so no account is unreachable without sso
- oidc providers exist for CI to assume a role. no CI applies this infra yet

## rework, and why

**clean.** purely additive — a later `resources.scp.ts` / `resources.admin.sso.ts` /
`account=prep/resources.oidc.ts` drops in beside what exists and refs the same accounts.

## confidence, and why it is the lowest of the four

**80%.** this is the fulcrum most likely to be overturned, and the reason is stated rather than
hidden: the fort-knox philosophy holds that **isolation is the most important property** of the
external brain, and an org-wide SCP is one of the named walls. to defer it is to ship a nest
with a rung declared-but-absent.

the counter that carried the call: an SCP with no threat model yet articulated is a guardrail
guessed at, not designed. a wrong SCP is worse than a deferred one — it blocks legitimate
applies and gets loosened under pressure until it guards no one.

**the honest gap:** if the wisher wants the guardrails before any real cognition lands in these
accounts, this should be overturned and an SCP wish written now, while the accounts are empty
and a mistake is free to correct.

## where

- `provision/aws.auth/account=.root/resources.accounts.ts`
- `provision/aws.auth/resources.common.accounts.ts`

## the verdict

open — awaits the fulcrum council. flagged as the one to scrutinize first.
