# F15 — the provision wishes source keyrack, and refuse absent account emails, at module load

| field | value |
|---|---|
| rework | clean |
| status | open |
| confidence | 72% |
| where | `provision/aws.auth/resources.common.accounts.ts`, `provision/aws.auth/account=.root/resources.accounts.ts`, `provision/aws.mail/account=prep/resources.mail.ts`, `provision/cloudflare/resources.mail.dns.ts` |

## .the fork

peer r7 (i002, blocker.1) grades as a behavior hazard that the four wish modules call
`keyrack.source(...)` in the module body, and that `resources.common.accounts.ts` throws at
import when an account email is absent.

- **(a) keep the source + refusal at load** — a wish module is an entrypoint. declastruct
  imports it to call `getResources()`, so the load IS the invocation, and the refusal lands
  before aws holds any state
- **(b) move both behind an explicit call** — `getNheuronAccountEmailsOrThrow()` and a
  `keyrack.source` at the top of each `getResources()`. fail-fast survives, since
  `getResources()` runs before the apply; the import becomes pure

## .taken: (a), why

the declastruct wish pattern this repo follows sources keyrack at the top of the wish module,
the same way declastruct-aws provisions its own `/aws/` resources. the import-order hazard r7
names is real, and the accounts module already carries the fix for it: the source sits in the
same module as the reads, above them. no importer outside the wishes exists.

## .rework, why clean

(b) is a four-file change with no external caller: one getter, four moved lines, no contract a
caller holds. it was not taken here because the provision integration tests need an sso session
to run locally, so a refactor of the load path would ship unproven until ci.

## .confidence, why 72%

r7's argument that (b) keeps fail-fast is correct — `getResources()` precedes any apply. the
residual case for (a) is convention and an unproven refactor, not a property (b) lacks. a
council that prefers (b) has the cheaper and more testable shape.

## .verdict

open — for the council.
