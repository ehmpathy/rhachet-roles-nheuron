# handoff: provision send + read email infra for a domain (via declastruct-aws)

## .what

the general capability: let folks provision the aws resources to **send** and **read** email
for a domain they own. declastruct-aws owns the aws side (ses, s3, iam); cloudflare dns is a
one-time manual step.

nheuron's gatherer `ses` mechanism is the first caller, but the resources are generic —
parameterized by a **mail-domain** and a **mailbox address**. any domain owner reuses the same
declared resources.

## .why

to own the whole mailbox on a domain you control beats the gmail service-account path — which
needs google workspace domain-wide delegation, i.e. impersonation of *every* org mailbox, too
broad a blast radius for a robot. a ses domain mailbox is scoped to exactly the addresses on
that one domain, authed by plain iam: no oauth, no per-mailbox delegation, no token expiry.

## .the parameters (generalize here)

every resource below is a function of these knobs. hard-code none of them into declastruct-aws
— take them as inputs:

| param | purpose | prod example | test example |
|-------|---------|--------------|--------------|
| `<mail-domain>` | the subdomain provisioned for mail | `mail.ehmpath.com` | `demo.ehmpathy.com` |
| `<mailbox>` | a local-part on that domain | `robot@mail.ehmpath.com` | `robot@demo.ehmpathy.com` |
| `<region>` | ses-inbound-capable region | `us-east-1` | `us-east-1` |
| `<accountId>` | aws account | — | — |
| `<slug>` | `<mail-domain>` with dots→dashes | `mail-ehmpath-com` | `demo-ehmpathy-com` |

for the first test pass, use **`demo.ehmpathy.com`** as the mail-domain.

## .subdomains are the primary case

we provision a dedicated **mail subdomain**, not the apex. `mail.ehmpath.com`,
`demo.ehmpathy.com`, and the like. this is the default, expected path:

- the apex mx stays free for whatever else the domain serves (cloudflare email route, google)
- blast radius stays isolated to the subdomain
- one parent domain hosts many mail subdomains, each its own ses identity + bucket

(the apex is a rare special case — only when the apex mx is free to point at ses.)

## .the shape (mx → ses → s3 for read; sdk → ses → recipient for send)

```
read:   sender ──▶ mx(<mail-domain>) ──▶ ses receipt rule ──▶ s3 bucket (raw rfc822)
                                                                    │
                                        adapter: getAllMailFromSes reads + parses ◀┘

send:   sdk sendRawEmail ──▶ ses ──▶ recipient        # from any <mailbox> on <mail-domain>
```

## .region caveat

ses **inbound receipt** works in a subset of regions (`us-east-1`, `us-west-2`, `eu-west-1`,
and a few more). pick one, pin it — the mx target and the s3 bucket must share it.

---

## .aws resources — via declastruct-aws

declastruct-aws already declares iam. it does **not** yet declare s3 or ses. so: reuse iam,
add s3 + ses, each per its own `DeclaredAws{Service}{Resource}` convention.

### already in declastruct-aws (reuse)

grounded against `src/access/daos/` on `origin/main`:

| declared resource | use here | note |
|-------------------|----------|------|
| `DeclaredAwsIamPolicy` | the mailbox reader/sender least-privilege policy | ⚠️ **read-only dao today** (its `set` throws) — make it writable, express as an inline role policy, or create once by console |
| `DeclaredAwsIamRole` | role the mailbox owner assumes (if role-based) | writable |
| `DeclaredAwsIamUser` + `DeclaredAwsIamUserAccessKey` | long-lived creds behind `AWS_PROFILE` (if user-based) | pick role OR user, not both |
| `DeclaredAwsIamRolePolicyAttachedInline` | attach the least-privilege policy | writable |

least-privilege policy body (parameterized — read one bucket, send from ses):

```
s3:ListBucket         on arn:aws:s3:::ses-mail-inbox-<slug>-<accountId>
s3:GetObject          on arn:aws:s3:::ses-mail-inbox-<slug>-<accountId>/inbound/*
ses:SendRawEmail      on *          # the send path
sts:GetCallerIdentity on *          # auth-status check
```

### gaps to add to declastruct-aws

each new resource takes the extant repo shape — one triple per resource:

```
src/domain.objects/DeclaredAws{X}.ts                 # the declared entity (primary + unique keys)
src/domain.operations/{x}/getOne{X}.ts               # get by primary / by unique
src/domain.operations/{x}/set{X}.ts                  # findsert / upsert (idempotent)
src/access/daos/DeclaredAws{X}Dao.ts                 # genDeclastructDao wrapper (get + set)
```

resources to add (every field a function of `<mail-domain>` / `<slug>`):

| # | declared resource | unique key | set does |
|---|-------------------|-----------|----------|
| 1 | `DeclaredAwsS3Bucket` | `name` = `ses-mail-inbox-<slug>-<accountId>` | create bucket (globally-unique name) |
| 2 | `DeclaredAwsS3BucketPolicy` | `bucketName` | allow `ses.amazonaws.com` → `s3:PutObject`, condition `aws:SourceAccount=<accountId>` |
| 3 | `DeclaredAwsSesDomainIdentity` | `domain` = `<mail-domain>` | verify domain + enable easy-dkim; **emits** the verification + dkim tokens the human puts in cloudflare |
| 4 | `DeclaredAwsSesReceiptRuleSet` | `name` = `ses-mail-inbound` | create + set-active (one active set per region) |
| 5 | `DeclaredAwsSesReceiptRule` | `ruleSetName` + `name` = `<slug>-to-s3` | recipients (see below); action = s3 put to bucket #1, `prefix=inbound/` |

**recipients — the read-scope knob:** a bare domain recipient (`<mail-domain>`) is a
**catch-all** — it reads *every* address on the subdomain (the "read all mail for the domain"
case). a specific `<mailbox>` narrows to one address. both are valid; the caller chooses.

apply order: identity(3) → bucket(1) + policy(2) → rule-set(4) → rule(5) → iam(policy + attach).
sns notify is skipped for v1 — the adapter polls s3 directly.

### ses sandbox (send)

new ses accounts start in the **sandbox**: send only to *verified* addresses, low quota. for
the first test pass this is fine — verify one test recipient and send to it. to send to
arbitrary recipients later, request production access (a one-time aws support step, not a
declastruct resource).

---

## .dns — cloudflare, by hand, once

not declastruct-managed. a human adds these in the cloudflare ui after
`DeclaredAwsSesDomainIdentity` emits its tokens. the set for a given `<mail-domain>`:

| type | name | value | purpose |
|------|------|-------|---------|
| MX | `<mail-domain>` | `10 inbound-smtp.<region>.amazonaws.com` | route inbound to ses |
| TXT | `_amazonses.<mail-domain>` | `<verification token>` | prove domain ownership |
| CNAME ×3 | `<token>._domainkey.<mail-domain>` | `<token>.dkim.amazonses.com` | dkim signature |
| TXT | `<mail-domain>` | `v=spf1 include:amazonses.com ~all` | spf (send) |
| TXT | `_dmarc.<mail-domain>` | `v=DMARC1; p=none; rua=mailto:<mailbox>` | dmarc (optional) |

concrete, for the test domain `demo.ehmpathy.com` in `us-east-1`:

| type | name | value |
|------|------|-------|
| MX | `demo.ehmpathy.com` | `10 inbound-smtp.us-east-1.amazonaws.com` |
| TXT | `_amazonses.demo.ehmpathy.com` | `<token from identity>` |
| CNAME ×3 | `<token>._domainkey.demo.ehmpathy.com` | `<token>.dkim.amazonses.com` |
| TXT | `demo.ehmpathy.com` | `v=spf1 include:amazonses.com ~all` |

⚠️ dns-only (grey-cloud), never cloudflare-proxied — a proxied mx/txt breaks mail. the
subdomain keeps this apart from any apex mail the parent domain serves.

---

## .test flow (the "how easy is it" measurement)

mail-domain = `demo.ehmpathy.com`, mailbox = `robot@demo.ehmpathy.com`. once declastruct has
applied the aws resources and dns has propagated:

```sh
# 0. creds — AWS_PROFILE comes from keyrack, same as rhachet-roles-ghlitch skills
rhx keyrack unlock --owner ehmpath --env test

# 1. auth-status: does the profile load? (sts:GetCallerIdentity)
#    expect: authenticated

# 2. read: send a test email TO robot@demo.ehmpathy.com from any inbox, then collect it
rhx gather.mail --from ses --address robot@demo.ehmpathy.com --since 2026-07-01
#    expect: the test email appears, parsed (from, subject, snippet)

# 3. send (future gather.reply skill / sendReplyViaSes communicator):
#    send FROM robot@demo.ehmpathy.com to a verified test address
#    expect: messageId returned; email arrives
```

success = all three work with `AWS_PROFILE` only, no oauth, no manual token upkeep.

## .keyrack entries the adapter reads

add under `env.test` in `.agent/keyrack.yml`:

```yaml
env.test:
  - SES_MAIL_BUCKET   # e.g. ses-mail-inbox-demo-ehmpathy-com-<accountId>
  - SES_REGION        # us-east-1
  # AWS_PROFILE already available via keyrack (no new entry needed)
```

## .open questions for the infra pass

1. mailbox reader/sender identity: iam **role** (assumed) or iam **user** + access key
   (long-lived)? both are declared in declastruct-aws; pick one for the `AWS_PROFILE`.
2. `DeclaredAwsIamPolicy` dao is read-only today — make it writable, express the
   least-privilege policy as an inline role policy, or create it once by console?
3. read-scope default: catch-all (`<mail-domain>`) or a single `<mailbox>`? catch-all is the
   more general "read all mail for the domain" fit, but reads more.
4. which aws region — this handoff pins `us-east-1` (ses-inbound-capable); confirm.
5. one aws account for test, or a dedicated sub-account per mail-domain's blast radius?

## .see also

- vision amendment: `.behavior/v2026_04_23.collect-from-gmail/1.vision.yield.md` (§ amendment: ses mechanism)
- blueprint amendment: `.behavior/v2026_04_23.collect-from-gmail/3.3.1.blueprint.product.yield.md` (§ amendment: ses adapter)
- declastruct pattern reference: `rule.prefer.declastruct.[demo].md` (get+set idempotent remote resources)
