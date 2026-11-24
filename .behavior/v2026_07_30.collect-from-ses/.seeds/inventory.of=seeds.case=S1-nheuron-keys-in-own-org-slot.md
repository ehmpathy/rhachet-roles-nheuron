# S1 — nheuron keys in their own org slot

## .said

asked: how should this repo get its nheuron-prep identity, given `ehmpathy.prep.AWS_PROFILE` points
at the demo account and other ehmpathy repos on the host read it?

chose: "Own org slot (Recommended)"

then: "iirc, rhachet supports the org overwrite already right?"

## .settled

nheuron-prep credentials (and every nheuron mail key) live under the `nheuron` keyrack org, reached
via `--org nheuron`; the shared `ehmpathy.prep.*` slots stay untouched. rhachet's org allowlist is
the mechanism — the manifest declares `org: [ehmpathy, nheuron]`.

## .landed

- `.agent/keyrack.yml` — `org: [ehmpathy, nheuron]`
- `provision/aws.mail/account=prep/resources.mail.ts`, `provision/cloudflare/resources.mail.dns.ts` — `keyrack.source({ …, org: 'nheuron' })`
- `patches/rhachet.patch` — sdk `keyrack.source` accepts `org`
- keyrack `nheuron.prep.SES_MAIL_BUCKET`, `SES_REGION`, `SES_CONFIG_SET`
