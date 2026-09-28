# handoff: provision a ses robot mailbox via declastruct-aws

## .what

the infra handoff for the **ses mechanism** of the gatherer role. it declares the aws +
cloudflare resources needed to stand up a robot mailbox on `ehmpath.com` that can both
**receive** (collect) and **send** (respond) mail, authed via `AWS_PROFILE` (iam).

target consumer: whoever drives **declastruct-aws** to provision the test infra. the goal
of the first pass is to measure how easy it is to create a robo email for a domain we own
and auth against it via declastruct.

## .why

the gmail service-account path needs google workspace domain-wide delegation — a service
account that can impersonate *every* mailbox in the org. too broad for a robot. instead we
own the whole mailbox: a dedicated address on `ehmpath.com` (already on cloudflare) backed
by aws ses. no oauth, no per-mailbox delegation, no 7-day token expiry — just iam.

## .the split of responsibility

| layer | who provisions | how |
|-------|----------------|-----|
| **cloudflare dns** | a human, **once, by hand** | add the records in §.dns below in the cloudflare ui |
| **aws (ses, s3, iam)** | **declastruct-aws**, self-provisioned | declared as `DeclaredAws*` resources, applied via its own `genDeclastructDao` get+set — the same way declastruct-aws provisions `/aws/` in its own repo |

the dns is a one-time manual step (a handful of records, done once when the domain is set
up). everything under `/aws/` is declared + applied by declastruct-aws so it stays
idempotent and reproducible.

## .the shape (mx → ses → s3, and sdk → ses → recipient)

```
receive:   sender ──▶ mx(ehmpath.com) ──▶ ses receipt rule ──▶ s3 bucket (raw rfc822)
                                                                     │
                                              adapter: getAllMailFromSes reads + parses ◀┘

send:      sendReplyViaSes ──▶ ses:SendRawEmail ──▶ recipient
```

## .decide first: subdomain vs apex

ses receipt needs the domain's **mx** record to point at ses. the apex `ehmpath.com` mx may
already serve other mail (cloudflare email route, google, etc). to keep apex mail untouched,
**prefer a dedicated subdomain** for the robot:

| option | robot address | mx lands on | blast radius |
|--------|---------------|-------------|--------------|
| **subdomain (preferred)** | `robot@bot.ehmpath.com` | `bot.ehmpath.com` mx | isolated — apex mail untouched |
| apex | `robot@ehmpath.com` | `ehmpath.com` mx | apex mail must move to ses |

the rest of this handoff assumes the **subdomain** `bot.ehmpath.com`. swap for the apex only
if the apex mx is free to point at ses.

## .region caveat

ses **inbound receipt** is available in a subset of regions (e.g. `us-east-1`, `us-west-2`,
`eu-west-1`). pick one and pin it — the mx target and the s3 bucket must match. this handoff
assumes **`us-east-1`**.

---

## .aws resources — via declastruct-aws

declastruct-aws already declares iam. it does **not** yet declare s3 or ses. so this handoff
splits into: what to reuse, and what to add to the declastruct-aws repo (following its own
`DeclaredAws{Service}{Resource}` convention).

### already in declastruct-aws (reuse)

grounded against `src/access/daos/` on `origin/main`:

| declared resource | use here | note |
|-------------------|----------|------|
| `DeclaredAwsIamPolicy` | the robot's least-privilege policy | ⚠️ **read-only dao today** (its `set` throws) — either make it writable, or create the policy via `DeclaredAwsIamRole` inline policy, or one-time console |
| `DeclaredAwsIamRole` | role the robot assumes (if role-based) | writable |
| `DeclaredAwsIamUser` + `DeclaredAwsIamUserAccessKey` | robot's long-lived creds behind `AWS_PROFILE` (if user-based) | pick role OR user, not both |
| `DeclaredAwsIamRolePolicyAttachedInline` | attach the least-privilege policy | writable |

the least-privilege policy body (exactly this, no more):

```
s3:ListBucket        on arn:aws:s3:::nheuron-ses-robot-mailbox-<accountId>
s3:GetObject         on arn:aws:s3:::nheuron-ses-robot-mailbox-<accountId>/inbound/*
ses:SendRawEmail     on *          # the respond path
sts:GetCallerIdentity on *         # auth-status check
```

### gaps to add to declastruct-aws

each new resource follows the extant repo shape — one triple per resource:

```
src/domain.objects/DeclaredAws{X}.ts                 # the declared entity (primary + unique keys)
src/domain.operations/{x}/getOne{X}.ts               # get by primary / by unique
src/domain.operations/{x}/set{X}.ts                  # findsert / upsert (idempotent)
src/access/daos/DeclaredAws{X}Dao.ts                 # genDeclastructDao wrapper (get + set)
```

resources to add:

| # | declared resource | unique key | set does |
|---|-------------------|-----------|----------|
| 1 | `DeclaredAwsS3Bucket` | `name` = `nheuron-ses-robot-mailbox-<accountId>` | create bucket (globally-unique name) |
| 2 | `DeclaredAwsS3BucketPolicy` | `bucketName` | allow `ses.amazonaws.com` → `s3:PutObject`, condition `aws:SourceAccount=<accountId>` |
| 3 | `DeclaredAwsSesDomainIdentity` | `domain` = `bot.ehmpath.com` | verify domain + enable easy-dkim; **emits** the verification + dkim tokens the human puts in cloudflare |
| 4 | `DeclaredAwsSesReceiptRuleSet` | `name` = `nheuron-robot-inbound` | create + set-active (one active set per region) |
| 5 | `DeclaredAwsSesReceiptRule` | `ruleSetName` + `name` = `robot-to-s3` | recipients `['robot@bot.ehmpath.com']`, action = s3 put to bucket #1, `prefix=inbound/` |

order of apply: identity(3) → bucket(1) + policy(2) → rule-set(4) → rule(5) → iam(policy+attach).
sns notify is skipped for v1 — the adapter polls s3 directly.

### ses sandbox (send)

new ses accounts start in the **sandbox**: sends only to *verified* addresses, low quota.
for the first test pass this is fine — verify one test recipient and send to it. to send to
arbitrary recipients later, request production access (a one-time aws support step, not a
declastruct resource).

---

## .dns — cloudflare, by hand, once

not declastruct-managed. a human adds these in the cloudflare ui after
`DeclaredAwsSesDomainIdentity` emits its tokens. the full set for `bot.ehmpath.com`:

| type | name | value | purpose |
|------|------|-------|---------|
| MX | `bot.ehmpath.com` | `10 inbound-smtp.us-east-1.amazonaws.com` | route inbound to ses |
| TXT | `_amazonses.bot.ehmpath.com` | `<verification token>` | prove domain ownership |
| CNAME ×3 | `<token>._domainkey.bot.ehmpath.com` | `<token>.dkim.amazonses.com` | dkim signature |
| TXT | `bot.ehmpath.com` | `v=spf1 include:amazonses.com ~all` | spf (send) |
| TXT | `_dmarc.bot.ehmpath.com` | `v=DMARC1; p=none; rua=mailto:robot@bot.ehmpath.com` | dmarc (optional) |

the verification + dkim token values come from the applied `DeclaredAwsSesDomainIdentity`
(or the ses console). ⚠️ cloudflare must **not** proxy these (dns-only / grey-cloud), and if
the domain uses cloudflare email routing, its mx would conflict — the subdomain keeps them
apart.

---

## .test flow (the "how easy is it" measurement)

once declastruct has applied the resources and dns has propagated:

```sh
# 0. creds — AWS_PROFILE comes from keyrack, same as rhachet-roles-ghlitch skills
rhx keyrack unlock --owner ehmpath --env test

# 1. auth-status: does the profile load? (sts:GetCallerIdentity)
#    expect: authenticated

# 2. receive: send a test email TO robot@bot.ehmpath.com from any inbox,
#    then collect it
rhx gather.mail --from ses --address robot@bot.ehmpath.com --since 2026-07-01
#    expect: the test email appears, parsed (from, subject, snippet)

# 3. respond (future gather.reply skill / sendReplyViaSes communicator):
#    send FROM robot@bot.ehmpath.com to a verified test address
#    expect: messageId returned; email arrives
```

success = all three work with `AWS_PROFILE` only, no oauth, no manual token upkeep.

## .keyrack entries the adapter reads

add under `env.test` in `.agent/keyrack.yml`:

```yaml
env.test:
  - SES_MAIL_BUCKET   # e.g. nheuron-ses-robot-mailbox-<accountId>
  - SES_REGION        # us-east-1
  # AWS_PROFILE already available via keyrack (no new entry needed)
```

## .open questions for the infra pass

1. subdomain `bot.ehmpath.com` vs a different label — confirm the label to verify.
2. robot identity: iam **role** (assumed) or iam **user** + access key (long-lived)? both are
   declared in declastruct-aws; pick one for the `AWS_PROFILE` behind the adapter.
3. `DeclaredAwsIamPolicy` dao is read-only today — make it writable, or express the
   least-privilege policy as an inline policy on the role, or create it once by console?
4. which aws region — this handoff pins `us-east-1` (ses inbound-capable); confirm.
5. one aws account for test, or a dedicated sub-account for the robot's blast radius?

## .see also

- vision amendment: `.behavior/v2026_04_23.collect-from-gmail/1.vision.yield.md` (§ amendment: ses mechanism)
- blueprint amendment: `.behavior/v2026_04_23.collect-from-gmail/3.3.1.blueprint.product.yield.md` (§ amendment: ses adapter)
- declastruct pattern reference: `rule.prefer.declastruct.[demo].md` (get+set idempotent remote resources)
