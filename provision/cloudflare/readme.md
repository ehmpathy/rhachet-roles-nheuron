# provision: the mail dns

## .what

the dns half of jelly's mailboxes — per domain, the inbound MX, the SPF TXT, the 3 easy-dkim
CNAMEs, and the DMARC TXT, in the `nheuron.com` zone. three domains, two envs:

| env | domains |
|-----|---------|
| prep | `one.prep.nheuron.com` |
| prod | `one.prod.nheuron.com`, `one.nheuron.com` (alias) |

## .why

the records must match what ses expects, character for character. both paths below derive
them from one pure transformer (`asSesMailDnsRecords`), so neither relies on a hand copy.

---

## two paths, one derivation

| path | who writes the records | robot credential on the zone |
|------|------------------------|------------------------------|
| **hand** (current for nheuron.com) | a human, in the cloudflare console | none |
| **declared** | `declastruct apply` of `resources.mail.dns.ts` | a zone-scoped token |

the hand path exists because a cloudflare token is account-wide unless scoped. a token scoped
to one zone (Zone Resources = `nheuron.com`, `Zone:Read` + `DNS:Edit`) makes the declared path
safe; until one exists, the human enters the records.

### the hand path

```sh
# after the env's mail wish applies:
rhx mail.dns.records.get --env prep
rhx mail.dns.records.get --env prod
```

each reads the dkim tokens live from the applied identities and prints every record. enter each
in the `nheuron.com` zone, proxy **off**. then verify (below).

### the declared path

| prereq | why |
|--------|-----|
| both mail wishes applied | each identity mints the dkim tokens this wish needs |
| a cloudflare **user** token, scoped to the `nheuron.com` zone | My Profile > API Tokens — NOT an account token |
| token scopes: `Zone:Read` + `DNS:Edit` | the minimum to declare records in a zone |
| the `nheuron.com` zone exists | this wish declares records in it, never the zone's registration |

the keys live in the nheuron prod slot (the zone's slot):

```sh
rhx keyrack set --owner ehmpath --org nheuron --env prod --key CLOUDFLARE_API_TOKEN
rhx keyrack set --owner ehmpath --org nheuron --env prod --key CLOUDFLARE_ACCOUNT_ID
rhx keyrack set --owner ehmpath --org nheuron --env prod --key SES_DKIM_TOKENS
```

`SES_DKIM_TOKENS` is one map across every env: `<domain>=t1,t2,t3;<domain>=t1,t2,t3`. each
`mail.dns.records.get` run prints its env's segment; join the two with `;`. the wish refuses
loud, and names each absent domain, until every domain holds tokens.

they are **not** a secret — they become public dns the moment they are declared. they ride
keyrack because it is the one env source this repo reads, and because they are unknowable until
each mail wish applies, which keeps the wish applyable exactly as committed.

```sh
rhx keyrack unlock --owner ehmpath --org nheuron --env prod
npx declastruct plan  --wish 'provision/cloudflare/resources.mail.dns.ts'
npx declastruct apply --wish 'provision/cloudflare/resources.mail.dns.ts'
```

---

## the records, per domain

| type | name | value | purpose |
|------|------|-------|---------|
| MX | `<domain>` | `10 inbound-smtp.us-east-1.amazonaws.com` | route inbound to ses |
| TXT | `<domain>` | `v=spf1 include:amazonses.com ~all` | spf — authorize ses to send |
| CNAME ×3 | `<token>._domainkey.<domain>` | `<token>.dkim.amazonses.com` | easy-dkim |
| TXT | `_dmarc.<domain>` | `v=DMARC1; p=none` | dmarc, monitor mode |

### ⚠️ dns-only, never proxied

every record is `proxied: false` (grey-cloud). a proxied mx or txt breaks mail.

### v2 easy dkim — no `_amazonses` TXT

ownership is proved by the 3 dkim CNAMEs **alone**. the separate `_amazonses` TXT token was the
v1 shape and does not apply here.

### the apex is untouched

every record names a `one.*` subdomain within the `nheuron.com` zone. the apex mx stays free for
whatever else the domain serves — the whole point of the subdomain.

---

## verify

after propagation (minutes to an hour), each identity moves from `unresolved` to verified; the
env's plan reads them back:

```sh
rhx provision.member --wish provision/aws.mail/account=prep/resources.mail.ts --env prep --org nheuron --mode plan
```

then the live loop: `provision/runbook.bootstrap-nheuron-mailbox.md` phase 8.

## .see also

- `asSesMailDnsRecords.ts` — the pure derivation of each domain's record set
- `asDkimTokensByDomain.ts` — the parse of the token map
- `provision/aws.mail/readme.md` — the aws half
