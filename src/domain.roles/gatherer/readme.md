## gatherer

collect mail and async comms from external sources with security-first design.

### purpose

- authenticate with mail providers (gmail, ses)
- fetch mail with local cache for rapid access
- obfuscate security-sensitive content (mfa, password resets)
- provide both human-readable and json output formats

### skills

- `gather.auth` — authenticate with mail provider
- `gather.mail` — collect mail from authenticated source

### mechanisms

| `--from` | auth | reads from | can send |
|----------|------|------------|----------|
| `gmail` | oauth (a token cache, which expires) | the gmail api | no |
| `ses` | iam via `AWS_PROFILE` from keyrack (no expiry) | an s3 bucket a ses receipt rule writes | yes — `ses:SendRawEmail` |

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
  mechanism={gmail|ses}/
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

⚠️ **a scoped run — `--query` or `labels=` — is NOT cached, and never incremental.** the cache
and the cursor are keyed on mechanism + address with no filter component, so each answers only
*"what does this address hold, in full?"* — a question a scoped run cannot answer. three
consequences, all deliberate:

| a scoped run | why |
|--------------|-----|
| re-fetches its whole range on **every** call, forever | it declines the cursor, so it gets no lower bound |
| never advances the cursor for later bare runs | its high-water mark covers only what MATCHED; to share it would make a later bare run skip every unmatched mail before it, permanently |
| lists what **it** matched, never the cache union | the cache blends every filter ever run against the address |

so a `--query` run against a large mailbox pays full freight each time. that cost is the price
of the honesty in rows 2 and 3 — see fulcrum `F10` for the alternative that was weighed
(a per-filter cache digest) and why it was not taken.

⚠️ **`--since` narrows what you SEE on both mechanisms, but only narrows what gmail FETCHES.**
one flag, two costs — and which one you pay is decided by the store behind the mechanism, not
by the flag:

| mechanism | how `--since` is applied | what a run costs |
|-----------|--------------------------|------------------|
| **gmail** | pushed into the api query as `after:` | the remote never sends the older mail — you pay for the window alone |
| **ses** | applied locally, **after** the walk | every object under the inbound prefix is listed, read, and parsed first |

the reason is s3: `ListObjectsV2` filters on key **prefix** only, so there is no date bound to
push down. the ses walk is capped instead — past 200 pages (~200k mails) it **refuses** rather
than return a partial mailbox as if it were whole. a clone's mailbox is far under that, so the
cap is a backstop rather than a limit you should expect to meet.

⇒ on ses, treat `--since` as a **view** narrower, never a cost one. see fulcrum `F11`.
