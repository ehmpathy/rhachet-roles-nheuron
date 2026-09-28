# F4 — one shared constants module, not a literal per wish

## the fork, stated fairly

the aws mail wish and the cloudflare dns wish both need the mail domain, the region, and the
zone. they must **agree**, or the mx points at a host the bucket cannot serve.

| option | argument for |
|--------|-------------|
| **one shared module** (taken) | the two cannot disagree; a domain change lands in one place |
| a literal per wish (the demo's shape) | each wish reads standalone, with no cross-directory import |

## taken, and why at the time

**one shared module** — `provision/resources.common.mail.ts`.

the demo re-declares `MAIL_DOMAIN` and `REGION` in both its aws file and its cloudflare file and
accepts the divergence risk. that risk is real and silent: a domain renamed in one file and not
the other yields an apply that *succeeds* and mail that never arrives — no type error, no plan
diff on the file left behind.

the values are public facts (a domain, a region, a bucket name), never credentials, so a shared
module carries no secret. the credentials this stack needs all come from keyrack, apart from
these.

## amended — WHERE the shared module sits was the real fork

peer review r5 (`arch-smell-scopeleaks`) graded the module a **blocker** — and it was right,
though not about the fork this entry names. the module first sat at
`provision/aws.mail/account=prep/resources.mail.constants.ts`, i.e. **inside the aws wish**, so
the cloudflare wish reached across a bounded-context line to import it. aws and cloudflare are
separate providers with separate applies; a rename inside the aws wish would have broken the
unrelated dns wish, and neither could evolve alone.

so the module **lifted to `provision/`** — the common ancestor of both consumers
(`rule.prefer.most-common-denominator`). each wish now imports a peer rather than one wish's
internals. the name `resources.common.mail.ts` mirrors its extant peer
`aws.auth/resources.common.accounts.ts`, which lifts the same way for the same reason.

⇒ **the shared-vs-duplicated fork this entry records is unchanged and still open.** what
changed is that the shared module now sits where a shared module belongs. that half is settled,
not a fork.

## rework, and why

**clean.** inline the constants back into each wish and delete the module. two files, one
deletion.

## confidence

**92%.** the highest of the four. the failure mode it prevents is silent and costly; the cost it
adds is one cross-directory import. the 8% is aesthetic — a reviewer may prefer each wish to
stand fully alone, as the demo's do.

## where

- `provision/resources.common.mail.ts`
- imported by `provision/aws.mail/account=prep/resources.mail.ts`
- imported by `provision/cloudflare/resources.mail.dns.ts`

## the verdict

open — awaits the fulcrum council.
