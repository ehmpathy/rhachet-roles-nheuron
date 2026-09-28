# F2 — `asSesMailDnsRecords` is a local copy, not an import

## the fork, stated fairly

the dns wish must derive the 6 records a ses domain identity owes. declastruct-aws holds that
exact derivation as `asSesEmailIdentityDnsRecords` — but **does not export it** from its public
sdk (verified against `node_modules/declastruct-aws/dist/contract/sdks/index.d.ts`; the demo
reaches it via an internal `src/domain.operations/...` path, which resolves only inside that
package).

| option | argument for |
|--------|-------------|
| **a local faithful copy** (taken) | works today; the forms are a ses contract, not a declastruct one, so the duplication tracks a stable external shape |
| a deep import into `declastruct-aws/dist/...` | no duplication — but reaches past the package's declared contract into an internal path it may move without notice |
| open a PR on declastruct-aws to export it | the right long-term fix — but blocks this drive on another repo's release cycle |

## taken, and why at the time

**the local copy.** the deep import was rejected because a package's unexported internals are
not a contract — a minor release could move the file and break an apply with no type error at
install time.

the PR was rejected as a blocker: it would halt this drive on another repo's release. it stays
the right follow-up, and the file's `.note` says so explicitly.

what makes the duplication tolerable: the record forms (`10 inbound-smtp.<region>.amazonaws.com`,
`<token>.dkim.amazonses.com`, `v=spf1 include:amazonses.com ~all`) are **aws's** shape, not
declastruct's. so the copy tracks a stable external contract rather than a library internal.

**one deliberate drop:** the demo's helper carries a custom-MAIL-FROM branch. this identity
declares `mailFrom: null`, so that branch has no caller here — `rule.prefer.wet-over-dry` says
do not carry a path nobody walks. this is a divergence a reviewer should see, not a transcription
slip.

## rework, and why

**clean.** if declastruct-aws exports the helper, delete `asSesMailDnsRecords.ts` + its test and
swap the import in `resources.mail.dns.ts`. one file, one line, one test file.

## confidence

**85%.** the risk is silent drift: aws changes a record form, declastruct-aws updates, this copy
does not. mitigated by 10 unit tests that pin each form, so a drift surfaces as a decision rather
than a mystery. the 15% is that a reviewer may prefer the deep import (accept the internal-path
risk) or may want the upstream PR opened before this merges.

## where

- `provision/cloudflare/asSesMailDnsRecords.ts`
- `provision/cloudflare/asSesMailDnsRecords.test.ts`

## the verdict

open — awaits the fulcrum council.
