# provision: jelly's mailboxes

## .what

the aws side of jelly's mailbox — a ses domain identity per domain, an s3 inbound store, a
receipt rule scoped to jelly's addresses, and a least-privilege iam role. one mailbox per member
account, from one generator (`getResourcesOfMail.ts`):

| env | wish | account | addresses |
|-----|------|---------|-----------|
| prep | `account=prep/resources.mail.ts` | `nheuron-prep` | `jelly@one.prep.nheuron.com` — the live suites run here |
| prod | `account=prod/resources.mail.ts` | `nheuron-prod` | `jelly@one.prod.nheuron.com` + alias `jelly@one.nheuron.com` |

the alias is a second ses identity in prod, routed by the same rule into the same bucket — never a
dns cname, which cannot share a name with mx + txt records.

## .why

a clone warrants a real address rather than an invocation. this is the one connection into the
external brain, made concrete — read via s3, send via `ses:SendRawEmail`, authed by plain iam.

no google workspace. no oauth. no 7-day token expiry.

---

## prereqs

| prereq | where |
|--------|-------|
| `nheuron-root` + the org exist | `provision/aws.auth/account=.root/bootstrap.md` |
| the env's account exists | applied by `provision/aws.auth/account=.root/resources.accounts.ts` |
| keyrack `nheuron.<env>.AWS_PROFILE` → that account's profile | `rhx keyrack set --owner ehmpath --org nheuron --env <env> --key AWS_PROFILE --vault aws.config` |
| keyrack `nheuron.<env>.SES_*` | `rhx keyrack set --owner ehmpath --org nheuron --env <env> --key <key>` |
| the `nheuron.com` dns zone | already owned |

⚠️ the profile must land in the env's **member** account, never the org's management account. the wish
reads the account id from those credentials, so a wrong profile applies **with success** into
the wrong account. that dissolves the second wall of the nest
(`philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`), and a re-apply does not undo it:
the bucket is globally named, so the fix is a teardown in the wrong account, then a fresh apply.

`rhx provision.member` guards it in code: before any declastruct call, `aws.caller.get --expect
member` refuses a slot whose account manages its organization.

---

## apply

```sh
# 1. plan — unlocks the slot, proves a member account, writes the plan file
rhx provision.member --wish provision/aws.mail/account=prep/resources.mail.ts --env prep --org nheuron --mode plan
#    the bucket policy in the plan carries the account id twice
#    (`aws:SourceAccount` and the SourceArn); it matches the guard's account line.

# 2. apply the reviewed plan
rhx provision.member --wish provision/aws.mail/account=prep/resources.mail.ts --env prep --org nheuron --mode apply

# 3. the dns records each domain now owes, dkim tokens read live from the identities
rhx mail.dns.records.get --env prep
```

prod: the same three, with `prep` → `prod`.

### what the apply emits

each identity mints **3 dkim tokens**. `rhx mail.dns.records.get --env <env>` reads them back and
prints every record, derived by `asSesMailDnsRecords`. see `provision/cloudflare/readme.md`.

until that dns propagates the identity reads `verificationStatus: unresolved`. that is expected,
not a failure — both send and receive wait on it.

---

## the resources

| # | resource | what |
|---|----------|------|
| 1 | `DeclaredAwsSesEmailIdentity` × domain | one per domain of the env, v2 easy-dkim; each emits 3 cname tokens |
| 2 | `DeclaredAwsS3Bucket` | the inbound store — `lifecycle: null`, so every object stays in Standard, readable at any age (see below) |
| 3 | `DeclaredAwsS3BucketPolicy` | ses may PutObject — scoped to this account AND this rule arn |
| 4 | `DeclaredAwsSesReceiptRuleSet` | the account's active set (one per region) |
| 5 | `DeclaredAwsSesReceiptRule` | recipients = `jelly@<each domain>` ONLY → s3 `inbound/` |
| 6 | `DeclaredAwsIamRole` + inline grant | list+read that prefix, send as `*@<each domain>` |
| 7 | `DeclaredAwsSesConfigurationSet` + event dest | send-event capture → cloudwatch |
| 8 | `DeclaredAwsSesAccountDetails` | requests the sandbox exit (aws reviews it async) |

### no glacier staircase — deliberately

the demo this mirrors tiers old objects down to `DEEP_ARCHIVE`. that is **not** taken here.
`GetObject` cannot read an archived object without a restore that takes hours, so
`gather.mail --since <a year ago>` would fail on exactly the mail it was asked for.

a clone must be able to read its own memory at any age. at a clone's mail volume the storage
cost is negligible, so no cost cut is worth that price.

### one mailbox, never a catch-all

the receipt rule names jelly's addresses alone. a domain catch-all would read *every* address on
the subdomain — more than one clone needs, and a wall dissolved. the honest cost: a second clone
on this subdomain owes its own rule.

### the ses sandbox

a new account sends only to **verified** identities until aws grants production access.
resource 8 requests the exit; aws reviews it out of band. jelly's own domains are verified, so a
send from jelly to jelly proves the loop in the sandbox, with no outside address on record.

---

## then what

```sh
# the collector reads a mailbox — the env slot picks which
rhx keyrack unlock --owner ehmpath --org nheuron --env prod
rhx gather.mail --from ses --address jelly@one.nheuron.com --since 2026-11-01
```

three keyrack values per env must match the constants in `resources.common.mail.ts`:

| keyrack key | must equal | demanded by | used by |
|-------------|-----------|-------------|---------|
| `SES_MAIL_BUCKET` | `MAIL_BY_ENV[env].bucket` | read + send | **read only** |
| `SES_REGION` | `MAIL_REGION` | read + send | read + send |
| `SES_CONFIG_SET` | `MAIL_CONFIG_SET` | **send only** | send only |

`gather.mail` needs the first two. it does **not** need `SES_CONFIG_SET` — that value is named
on each *send*, so a read-only mailbox may leave it unset and `gather.auth` still reports
`authenticated`. the send refuses loudly when it is absent.

**demanded ≠ used**, and the one row where they differ is `SES_MAIL_BUCKET`: both paths load
config through one `getSesConfig()`, which demands the bucket, yet the send never reads it. so
a send-only caller must set a bucket it will not touch. left as-is rather than split into a
read-config and a send-config: every mailbox that can send was provisioned with the bucket
beside it, so no caller pays this today, and a split for a caller that does not exist is a
speculative abstraction (`rule.prefer.wet-over-dry`).

⚠️ a **mismatch** on any of the three fails **silently**, which is why they warrant a table
rather than a sentence: a wrong bucket or region yields an empty mailbox rather than an error,
and a wrong config set silences the send-event destination while each send still looks healthy.
`provision/resources.common.mail.integration.test.ts` clamps all three against the prep constants;
it runs under `TEST_LIVE=ses`, the one moment the nheuron prep slot is unlocked for a live read.

---

## reuse it for another domain

every resource is a function of `resources.common.mail.ts` — no domain, region, or resource
name is hardcoded elsewhere. to stand up a second mailbox on a domain you own:

1. copy `provision/aws.mail/` and `provision/cloudflare/`
2. edit the constants — `MAIL_BY_ENV` (each env's domains and its globally unique bucket),
   `MAIL_LOCAL_PART`, `MAIL_ZONE`, `MAIL_RULE_SET`, `MAIL_CONFIG_SET`
3. keep `MAIL_REGION` ses-inbound-capable (`us-east-1`, `us-west-2`, `eu-west-1`, and a few more)
4. apply mail → `rhx mail.dns.records.get --env <env>` → enter (or apply) dns, in that order

⚠️ **one active receipt rule set per region per account.** a second mailbox in the SAME account
and region must join the extant rule set as another rule, not declare a second set. a second
mailbox in its own account is unconstrained.

---

## tear it down

each resource is idempotent both ways, so removal is the mirror of the apply — **in reverse
dependency order**, since ses refuses to drop a rule set that is still active and s3 refuses to
drop a bucket that still holds objects.

```sh
# 1. the dns first — so no further mail is routed in mid-teardown: drop the env's records

# 2. then the aws side, per env
rhx keyrack unlock --owner ehmpath --org nheuron --env <env>
npx declastruct plan --wish 'provision/aws.mail/account=<env>/resources.mail.ts' --mode del
```

⚠️ **read the plan before you apply either.** the bucket holds the clone's mail — its memory.
that mail is not recoverable once the bucket is dropped, so archive it first if it matters:

```sh
rhx gather.mail --from ses --address jelly@one.nheuron.com --format json
```

the cached copy under `.agent/.cache/repo=nheuron/role=collector/skill=gather.mail/` survives
the teardown; the s3 originals do not.

## .see also

- `resources.common.mail.ts` — the domain, region, and resource names both wishes share
- `provision/cloudflare/readme.md` — the dns half
- `.behavior/v2026_07_30.collect-from-ses/1.vision.yield.md` — deliverable (a)
