# F1 — provision files live in this repo, not declastruct-aws

## the fork, stated fairly

the mail + account resources could be declared in either place:

| option | argument for |
|--------|-------------|
| **this repo** (taken) | precedent — `provision/github.repo/resources.ts` already declares this repo's own resources by consumption of `declastruct-github`. declastruct-aws stays a library, not a home for one consumer's infra |
| declastruct-aws | the demo (`echo@demo.ehmpathy.com`) lives there, so a mirror would sit beside its template and reach its internal operations directly |

## taken, and why at the time

**this repo.** the vision had already flagged it as a best-guess (open question 7) with the
`provision/github.repo/` precedent as the argument. that precedent held on inspection: the
extant file declares *this repo's* github resources by consumption of a published declastruct
package, exactly the shape the mail wish needs.

the deciding read: declastruct-aws's demo exists to prove its own resources work. nheuron's
mailbox is not a proof of declastruct-aws — it is nheuron's infra. a library should not carry
its consumer's declarations.

## rework, and why

**clean.** three directories move, and two relative imports re-point
(`resources.mail.constants` ← the cloudflare wish, `resources.common.accounts` ← the account
wish). no caller has hardened against the location; no later work builds upon it.

## confidence

**90%.** the precedent is direct and the argument is not close. the 10% is that the wisher may
prefer all declastruct-consuming infra to live beside the library's own demos for discoverability.

## where

- `provision/aws.auth/`
- `provision/aws.mail/account=prep/`
- `provision/cloudflare/`

## the verdict

open — awaits the fulcrum council.
