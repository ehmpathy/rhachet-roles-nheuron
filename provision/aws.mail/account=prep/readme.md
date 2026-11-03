# provision: the jelly@one.nheuron.com mailbox

## .what

the aws side of jelly's mailbox — a ses domain identity, an s3 inbound store, a receipt rule
scoped to one address, and a least-privilege iam role. applies into **`nheuron-prep`**.

## .why

a clone warrants a real address rather than an invocation. this is the one connection into the
external brain, made concrete — read via s3, send via `ses:SendRawEmail`, authed by plain iam.

no google workspace. no oauth. no 7-day token expiry.

---

## prereqs

| prereq | where |
|--------|-------|
| `nheuron-root` + the org exist | `provision/aws.auth/account=.root/bootstrap.md` |
| `nheuron-prep` exists | applied by `provision/aws.auth/account=.root/resources.accounts.ts` |
| an `AWS_PROFILE` for **nheuron-prep** | your `~/.aws/config`, sourced via keyrack |
| the `nheuron.com` cloudflare zone | already owned |

⚠️ `AWS_PROFILE` must name **nheuron-prep**, not the root. the wish reads the account id from
those credentials, so the wrong profile builds the bucket policy against the wrong account.

this hazard is **not guarded in code**, unlike its region twin below, and the reason is that
`nheuron-prep`'s account id is minted by the account wish — it does not exist at authorship
time, so there is no constant to compare against. the check is therefore yours, and step 1 of
the apply is what makes it concrete.

⚠️⚠️ the cost of a miss is the worst in this stack: the apply **succeeds**, and the mailbox
lands in the org's *management* account. that dissolves the second wall of the nest
(`philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`) rather than merely leaving one
resource wrong. and a re-apply does not undo it — the bucket is globally named, so the fix is
a teardown in the wrong account, then a fresh apply in the right one.

---

## apply

```sh
rhx keyrack unlock --owner ehmpath --env prep

# 1. CONFIRM THE ACCOUNT FIRST — this is the guard the code cannot carry
aws sts get-caller-identity
#    read `Account`. it must be nheuron-prep's id, NOT nheuron-root's.
#    if it is the root, change AWS_PROFILE and re-run this before you go on.

# 2. plan — read what it would stand up
npx declastruct plan --wish 'provision/aws.mail/account=prep/resources.mail.ts'
#    the bucket policy in the plan output carries the account id twice
#    (`aws:SourceAccount` and the SourceArn). confirm it matches step 1.

# 3. then apply
npx declastruct apply --wish 'provision/aws.mail/account=prep/resources.mail.ts'
```

### what the apply emits

the `setSesEmailIdentity` step logs the dns records the domain owes — **3 dkim tokens** among
them. copy those into `provision/cloudflare/resources.mail.dns.ts` (`DKIM_TOKENS`), then apply
the dns wish. see `provision/cloudflare/readme.md`.

until that dns propagates the identity reads `verificationStatus: unresolved`. that is expected,
not a failure — both send and receive wait on it.

---

## the resources

| # | resource | what |
|---|----------|------|
| 1 | `DeclaredAwsSesEmailIdentity` | `one.nheuron.com`, v2 easy-dkim; emits the 3 cname tokens |
| 2 | `DeclaredAwsS3Bucket` | the inbound store — `lifecycle: null`, so every object stays in Standard, readable at any age (see below) |
| 3 | `DeclaredAwsS3BucketPolicy` | ses may PutObject — scoped to this account AND this rule arn |
| 4 | `DeclaredAwsSesReceiptRuleSet` | the account's active set (one per region) |
| 5 | `DeclaredAwsSesReceiptRule` | recipient = `jelly@one.nheuron.com` ONLY → s3 `inbound/` |
| 6 | `DeclaredAwsIamRole` + inline grant | list+read that prefix, send as `*@one.nheuron.com` |
| 7 | `DeclaredAwsSesConfigurationSet` + event dest | send-event capture → cloudwatch |
| 8 | `DeclaredAwsSesAccountDetails` | requests the sandbox exit (aws reviews it async) |

### no glacier staircase — deliberately

the demo this mirrors tiers old objects down to `DEEP_ARCHIVE`. that is **not** taken here.
`GetObject` cannot read an archived object without a restore that takes hours, so
`gather.mail --since <a year ago>` would fail on exactly the mail it was asked for.

a clone must be able to read its own memory at any age. at a clone's mail volume the storage
cost is negligible, so no cost cut is worth that price.

### one mailbox, never a catch-all

the receipt rule names one recipient. a domain catch-all would read *every* address on the
subdomain — more than one clone needs, and a wall dissolved. the honest cost: a second clone on
this subdomain owes its own rule.

### the ses sandbox

a new account sends only to **verified** addresses until aws grants production access.
resource 8 requests the exit; aws reviews it out of band. meanwhile, verify a test recipient in
the ses console so jelly can answer it.

---

## then what

```sh
# the gatherer reads the mailbox
rhx keyrack unlock --owner ehmpath --env prep
rhx gather.mail --from ses --address jelly@one.nheuron.com --since 2026-09-01
```

three keyrack values must match the constants in `resources.common.mail.ts`:

| keyrack key | must equal | demanded by | used by |
|-------------|-----------|-------------|---------|
| `SES_MAIL_BUCKET` | `MAIL_BUCKET` | read + send | **read only** |
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
`provision/resources.common.mail.integration.test.ts` clamps all three against the constants;
it runs under `TEST_LIVE=ses`, the one moment the prep keyrack is unlocked for a live read.

---

## reuse it for another domain

every resource is a function of `resources.common.mail.ts` — no domain, region, or resource
name is hardcoded elsewhere. to stand up a second mailbox on a domain you own:

1. copy `provision/aws.mail/account=<env>/` and `provision/cloudflare/`
2. edit the constants — `MAIL_DOMAIN`, `MAIL_MAILBOX`, `MAIL_ZONE`, `MAIL_BUCKET` (globally
   unique), `MAIL_RULE_SET`, `MAIL_CONFIG_SET`
3. keep `MAIL_REGION` ses-inbound-capable (`us-east-1`, `us-west-2`, `eu-west-1`, and a few more)
4. apply mail → copy the dkim tokens → apply dns, in that order

⚠️ **one active receipt rule set per region per account.** a second mailbox in the SAME account
and region must join the extant rule set as another rule, not declare a second set. a second
mailbox in its own account is unconstrained.

---

## tear it down

each resource is idempotent both ways, so removal is the mirror of the apply — **in reverse
dependency order**, since ses refuses to drop a rule set that is still active and s3 refuses to
drop a bucket that still holds objects.

```sh
rhx keyrack unlock --owner ehmpath --env prep

# 1. the dns first — so no further mail is routed in mid-teardown
npx declastruct plan --wish 'provision/cloudflare/resources.mail.dns.ts' --mode del

# 2. then the aws side
npx declastruct plan --wish 'provision/aws.mail/account=prep/resources.mail.ts' --mode del
```

⚠️ **read the plan before you apply either.** the bucket holds the clone's mail — its memory.
that mail is not recoverable once the bucket is dropped, so archive it first if it matters:

```sh
rhx gather.mail --from ses --address jelly@one.nheuron.com --format json
```

the cached copy under `.gather/cache/` survives the teardown; the s3 originals do not.

## .see also

- `resources.common.mail.ts` — the domain, region, and resource names both wishes share
- `provision/cloudflare/readme.md` — the dns half
- `.behavior/v2026_07_30.collect-from-ses/1.vision.yield.md` — deliverable (a)
