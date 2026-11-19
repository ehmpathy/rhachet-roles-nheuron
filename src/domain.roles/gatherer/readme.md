## gatherer

collect mail and async comms from external sources with security-first design.

### purpose

- read mail from a mailbox nheuron owns, via ses
- fetch mail with local cache for rapid access
- obfuscate security-sensitive content (mfa, password resets)
- provide both human-readable and json output formats

### skills

- `gather.auth` — report auth status for the mail mechanism
- `gather.mail` — collect mail from an authenticated mailbox

### mechanism

| `--from` | auth | reads from | can send |
|----------|------|------------|----------|
| `ses` | iam via `AWS_PROFILE` from keyrack (no expiry) | an s3 bucket a ses receipt rule writes | yes — `ses:SendRawEmail` |

nheuron mail is ses only; no other mechanism exists.

⚠️ **"can send" is a capability, not a skill.** the send path is the `sendReplyViaSes`
operation; no `gather.*` skill exposes it yet. the two skills above both read.

the `ses` mechanism needs the mail infra applied (see `provision/aws.mail/account=prep/`),
plus these keyrack keys — and **which keys depends on the direction**:

| key | needed for |
|-----|------------|
| `SES_MAIL_BUCKET` | read + send (though only the read **uses** it) |
| `SES_REGION` | read + send |
| `SES_CONFIG_SET` | **send only** — `gather.mail` reads without it |

a read-only mailbox therefore needs two keys, not three. `SES_CONFIG_SET` is demanded at the
moment of a send rather than at load, because ses binds a configuration set **per-send**: a
send without one emits no bounce, complaint, or delivery event, so `sendReplyViaSes` refuses
rather than send unobserved.

### security

security-sensitive emails are automatically detected and obfuscated:
- mfa/2fa codes and messages
- password resets and account recovery
- login alerts and verification codes
- oauth/authentication tokens

only the existence of these emails is shown, never the content.

### cache

mail is cached locally for rapid repeated access:

```
.agent/.cache/repo=nheuron/role=gatherer/skill=gather.mail/
  mechanism=ses/
    address={the mailbox}/
```

- the path is keyed by **mechanism AND address** — that pair is the `ceiver`, and it is
  half of a `GatheredMail`'s natural key (`unique = ['ceiver', 'exid']`). two mailboxes
  that shared a directory would overwrite each other's mail by exid, silently.
- sync stats track what was fetched when, and a re-run over the same range converges
  rather than re-counts
- `--since` defaults to the prior run's cursor, so a bare re-run collects only what has
  arrived since. pass `--since` explicitly to override it and re-scan a wider window.

⚠️ **a bare re-run also SHOWS less, not merely fetches less.** the cursor bounds the range
once, and that one range is both what is fetched and what is listed. so a second
`gather.mail` against an unchanged mailbox prints a near-empty list. the mail is **held, not
lost** — the output says so in one line:

```
   ├─ listed: 1     ← what THIS run's range covers
   ├─ synced: 1     ← what it fetched
   └─ cached: 250   ← what the mailbox holds, in full
```

to see the whole mailbox again, pass an explicit `--since` that reaches back past it.

⚠️ **`--since` narrows what you SEE, never what is read.** it is applied locally, **after**
the walk: every object under the inbound prefix is listed, and each one not yet cached is
read and parsed.

the reason is s3: `ListObjectsV2` filters on key **prefix** only, so there is no date bound to
push down. the ses walk is capped instead — past 200 pages (~200k mails) it **refuses** rather
than return a partial mailbox as if it were whole. a clone's mailbox is far under that, so the
cap is a backstop rather than a limit you should expect to meet.

⇒ treat `--since` as a **view** narrower, never a cost one. see fulcrum `F11`.
