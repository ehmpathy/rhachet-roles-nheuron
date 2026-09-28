# F11 — `--since` bounds the gmail fetch, but NOT the ses one

| field | value |
|-------|-------|
| **rework** | clean |
| **status** | open |
| **confidence** | 76% |
| **where** | `src/domain.operations/gather/adapters/ses/mail/getAllMailFromSes.ts` |
| **taken** | i005, at the moment r010 raised it |

## the fork, stated fairly

`--since` reads as one flag with one meaning. it has two, and the mechanism decides which:

| mechanism | what `--since` does | who pays |
|-----------|--------------------|----------|
| **gmail** | pushed into the api query as `after:` (`asGmailQuery`), so the remote never sends the older mail | no one — the mail is never fetched |
| **ses** | applied **locally**, after the walk | the caller — every object under the prefix is listed, read, and parsed first |

s3 has no server-side date filter. `ListObjectsV2` filters on key **prefix** alone. so the
push-down gmail gets is not available to ses at all — this is a property of the store, not an
omission in the adapter.

⚠️ **the promise the surface makes is therefore true for one mechanism only.** the cli help says
`--since` fetches "only mail since this date". for gmail that is literal. for ses it describes
the *result*, never the *cost*.

## what was taken, and why at the time

**a page cap that refuses**, plus the asymmetry written down. NOT a `--since` push-down, because
none exists to reach for.

```ts
const SES_MAX_PAGE_QUANT = 200;   // 200 pages × 1000 keys = 200k mails
```

three reasons this shape over the alternatives:

1. **the peer already holds this number.** `GMAIL_MAX_PAGE_QUANT` is 200 for the same reason, so
   the two mechanisms now fail at the same scale rather than at two different surprises.
2. **it refuses rather than truncates.** a partial mailbox reported as a whole one is the failure
   class this adapter exists to close (`rule.forbid.failhide`). the clamp pins **both** halves —
   that it throws, and that it refuses *before* it spends the 201st list call.
3. **the cheap fix was the unsafe one.** a key-level `receivedAt >= since` filter would skip the
   body read for old objects and cost approximately none. it is wrong: the mail's `deliveredAt`
   is `parsed.date ?? receivedAt` (`getGatheredMailFromSes:129`), so a mail whose header date
   differs from its s3 write time would be dropped from a range it genuinely belongs to —
   **silently**, which is the exact defect class this stone keeps hitting. rejected.

## the fork the council actually rules on

the cap is not the question — an unbounded walk is a defect under any verdict. the open call is
**what the surface should say**, and there are three answers:

| option | what it does | cost |
|--------|--------------|------|
| **(a) — taken** | document the asymmetry in the help + readme; the flag stays one flag | a human reads carefully or does not learn it |
| **(b)** | ses reports its own cost at runtime — "walked 4,120 objects to list 12" | honest, but it puts a cost line on a happy path no other mechanism shows |
| **(c)** | a per-mechanism `--since` semantic in the help, named as such | most precise, most surface area for one difference |

(a) was taken because it is true under every verdict, so it ships now and is not undone by the
council choosing (b) or (c) — the same split applied to F10's mitigation.

## why the confidence is 76%

three things pull it down:

- **the surface reads as one promise.** `rule.forbid.ambiguous-labels` grades a flag that reads
  one way and behaves two ways as a **blocker**, not a nitpick. by that rule's own letter, (a)
  may be too little — a doc note is what you write when the label is fine and the reader is
  uninformed, and that is not what is true here.
- **200 is inherited, never derived.** it is right that ses and gmail agree, but neither number
  was measured against a real mailbox. a clone's mailbox is nowhere near 200k, so the cap will
  most likely never fire — which makes it a guard for a case no one will meet, and guards like
  that are the ones that go stale unwatched.
- **the cost is invisible until it is not.** a 50-mail mailbox hides this completely. the
  asymmetry only surfaces on a busy address, which is the worst moment to learn it
  (`rule.forbid.behavior-hazards`).

what holds it **up**: the push-down is genuinely unavailable, the unsafe shortcut was identified
and refused for a stated reason, and the cap is clamped with teeth rather than asserted.

## the rework, and why it is clean

- **(a) → (b)** — one added output line in the ses adapter's return, plus a readme row. no
  caller changes, no cache format change.
- **(a) → (c)** — a help-text edit and one snapshot re-write.
- **the cap's number** — one constant.

not one thing is built on top of the choice. no caller branches on it, no cache holds it, no
test depends on the *wording*. reversal is an edit, never a teardown.

## how it was found

not by design review — by **r010 of i005**, one of the two peer lanes that survived the round.
it is worth recording that this defect had been in the ses adapter since the adapter was written
and passed every prior review lane, including my own. the lane that found it is one of the two
that ran; nine returned a `412` from a suspended account.

## verdict

_unruled._

## .see also

- `getAllMailFromSes.test.ts` `[case5]` / `[case6]` — the clamp, dogfooded red under the
  uncapped defect
- `F9` / `F10` — the neighbors; all three concern what a run costs versus what it shows
- `rule.require.clamp-edge-cases` — why the cap ships with a test that bites
