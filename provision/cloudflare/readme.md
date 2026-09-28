# provision: the one.nheuron.com mail dns

## .what

the dns half of jelly's mailbox — the inbound MX, the SPF TXT, the 3 easy-dkim CNAMEs, and the
DMARC TXT, declared as cloudflare resources in the `nheuron.com` zone.

## .why

a human once pasted these by hand. declared, `apply` writes them and `plan` proves they hold —
so the whole mail loop is reproducible rather than a console ritual.

---

## prereqs

| prereq | why |
|--------|-----|
| the mail wish applied | it emits the 3 dkim tokens this wish needs |
| a cloudflare **user** token | My Profile > API Tokens — NOT an account token |
| token scopes: `Zone:Read` + `DNS:Edit` | the minimum to declare records in a zone |
| the `nheuron.com` zone exists | this wish declares records in it, never the zone's registration |

fill the credentials:

```sh
rhx keyrack fill --owner ehmpath --env prep
#   CLOUDFLARE_API_TOKEN
#   CLOUDFLARE_ACCOUNT_ID
```

---

## the one apply-sourced input: the dkim tokens

aws generates 3 dkim tokens when the ses identity is created and holds them stable for its
life (they change only on a delete+recreate). they are the sole dynamic value in the set.

1. apply `provision/aws.mail/account=prep/resources.mail.ts`
2. read the `setSesEmailIdentity` log — `metadata.dnsRecords` carries the 3 tokens
3. `rhx keyrack fill --owner ehmpath --env prep` → fill `SES_DKIM_TOKENS`, comma-separated
4. `rhx keyrack unlock --owner ehmpath --env prep`, then apply this wish

the wish fails loud with that exact hint while `SES_DKIM_TOKENS` is empty, so the order cannot
be gotten wrong silently.

### why keyrack rather than a literal in the file

the two applies run in sequence — aws mints the tokens, then cloudflare declares them — so
their values cannot exist in the source at commit time. a hardcoded placeholder would make the
committed wish un-applyable until someone edits code, which puts a **source change between two
infra applies**. read from the sourced env, the wish is applyable exactly as committed: fill,
unlock, apply.

they are **not** a secret — they become public dns the moment they are declared. they ride
keyrack because it is the one env source this repo reads at all, and because the fill step is
the natural place to hand an apply-emitted value to the next apply.

---

## apply

```sh
rhx keyrack unlock --owner ehmpath --env prep

npx declastruct plan  --wish 'provision/cloudflare/resources.mail.dns.ts'
npx declastruct apply --wish 'provision/cloudflare/resources.mail.dns.ts'
```

---

## the records

| type | name | value | purpose |
|------|------|-------|---------|
| MX | `one.nheuron.com` | `10 inbound-smtp.us-east-1.amazonaws.com` | route inbound to ses |
| TXT | `one.nheuron.com` | `v=spf1 include:amazonses.com ~all` | spf — authorize ses to send |
| CNAME ×3 | `<token>._domainkey.one.nheuron.com` | `<token>.dkim.amazonses.com` | easy-dkim |
| TXT | `_dmarc.one.nheuron.com` | `v=DMARC1; p=none` | dmarc, monitor mode |

### ⚠️ dns-only, never proxied

every record is declared `proxied: false` (grey-cloud). a proxied mx or txt breaks mail.

### v2 easy dkim — no `_amazonses` TXT

ownership is proved by the 3 dkim CNAMEs **alone**. the separate `_amazonses` TXT token was the
v1 shape and does not apply here.

### the apex is untouched

the records name `one.nheuron.com` within the `nheuron.com` zone. the apex mx stays free for
whatever else the domain serves — the whole point of the subdomain.

---

## verify

after propagation (minutes to an hour), the ses identity moves from
`verificationStatus: unresolved` to verified:

```sh
npx declastruct plan --wish 'provision/aws.mail/account=prep/resources.mail.ts'
```

then send a test email to `jelly@one.nheuron.com` and collect it:

```sh
rhx gather.mail --from ses --address jelly@one.nheuron.com --since 2026-09-01
```

## .see also

- `asSesMailDnsRecords.ts` — the pure derivation of the record set
- `provision/aws.mail/account=prep/readme.md` — the aws half
- `.behavior/v2026_07_30.collect-from-ses/1.vision.yield.md` — deliverable (a)
