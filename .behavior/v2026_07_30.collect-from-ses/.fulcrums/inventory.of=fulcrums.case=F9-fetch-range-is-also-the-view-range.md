# F9 — the fetch range is also the view range

| field | value |
|-------|-------|
| **rework** | clean |
| **status** | open |
| **confidence** | 61% |
| **where** | `src/domain.operations/gather/mail/setMailsFromAdapter.ts` |
| **taken at** | while r11.2 was wired (the cached-key skip), 2026-09-07 |

## the fork, stated fairly

after r11.1 wired the sync cursor, a bare `gather.mail` builds its range as
`--since ?? mailFoundUptil`. that one range now does **two** jobs:

1. **the fetch range** — how far back the adapter is asked to look
2. **the view range** — which mails the run prints

they were the same thing when the cursor was unread, because the only bound was the caller's
own `--since`. now they differ in kind:

| | its natural bound |
|---|---|
| fetch | the cursor — anything older is already cached, so a re-fetch buys none of it |
| view | the caller's `--since` alone — the human asked to see a window, not a delta |

so a human who runs `gather.mail --from ses --address jelly@one.nheuron.com` twice sees their
mail the first time and a near-empty list the second, on an unchanged mailbox. the mail is
present in the cache and the run is correct by its own contract; it simply does not show it.

**the fork:** does the range stay ONE thing (fetch bound = view bound), or split into two
(fetch narrow by the cursor, view wide by the caller's `--since` alone)?

## taken, and why at the time

**taken: keep it ONE range.** the split was not what r11.2 asked for, and r11.2 could be
delivered without it — the cache read-back already fixes the output regression the skip would
otherwise cause, which was the defect in front of me. so the split is a separate ergonomic
improvement, and `rule.always.defer-fulcrums-to-last` says best-guess and flag rather than
widen the change under way.

the readme line r11.1 added is honest under the current choice — it says a bare re-run
**collects** only what has arrived since, and it does. so the extant docs do not promise the
split.

## rework, and why

**clean.** the whole change is contained to `setMailsFromAdapter`: build a second
`getPaginationInput({ since, cursorPrior: null, limit })` and hand THAT to the cache read-back,
while the fetch keeps the cursor-defaulted one. two lines and a named variable. no caller
hardens against the current shape — `setGatheredMails` takes whatever mails come back.

## confidence, and why it is low

**61%** — lowered from 72% at i005, because a dedicated architecture lane read the same fork and
**dissented** (see the counter-argument below). two things pull against the call:

- **the surprise is real and user-facing.** "run it twice, see less" is exactly the shape
  `rule.forbid.surprises` names, and I am deferring it rather than fixing it. the defense is
  that the behavior is documented and internally consistent — but documented surprise is still
  surprise.
- **the split may be what a human meant by `gather.mail` all along.** the skill's name says
  *gather*, which argues the output reports what this run gathered. but a human at a terminal
  reads a mail list as "my mail", not "my delta". I genuinely do not know which the wisher
  wants, and that is the definition of a fulcrum rather than a defect.

what holds it above a coin flip: the current shape is the one that existed before this behavior
touched it (a run reported what it fetched), so the call preserves rather than changes intent.

## what has since reduced the harm, and what it leaves open

the output now states its **scope** and labels its three counts apart — `listed`, `synced`,
`cached` (peer point r11 nitpick 2). so the second bare run reads:

```
   ├─ scope: whole mailbox
   ├─ listed: 0
   ├─ synced: 0
   └─ cached: 250
```

a human who sees `cached: 250` beside an empty list knows their mail is held rather than lost.
that turns a silent surprise into a legible one — a real improvement, and **not** a resolution.
the fork stands: whether `gather.mail` should SHOW the window or the delta is still the
wisher's to rule.

## ⚠️ the counter-argument, from a reviewer

i005's `enroll-impl-arch-defects` lane — the first dedicated architecture pass since i001 — read
this fulcrum and argued **against** the call. its case, quoted rather than summarized, so the
council meets it at full strength:

> *"**F9 (fetch range == view range) — lean toward [a split of] the range, contra the current
> 'keep it one' call.** The `scope:`/`listed`/`synced`/`cached` output split already mitigates the
> *confusion*, but the [deeper] issue — a `gather.mail` invocation named after 'gather' [reports]
> a delta instead of a mailbox view — is a UX surprise every second run produces, silently,
> forever. The rework cost is stated as genuinely small ('two lines and a named variable... no
> caller hardens against the current shape'). Given low cost + a real [repeat] surprise +
> `rule.forbid.surprises` [as] a house rule, this reads more like a fix than a fulcrum. Recommend
> [a settlement of] it in the same pass as F10, since both touch `getPaginationInput` call sites
> in the same function."*

> ⚠️ the bracketed words replace `-ing` forms this repo's `rule.forbid.gerunds` refuses in a
> written file. no clause of the argument is altered; read the brackets as the reviewer's own
> word in its natural form.

three of its clauses are checkable and I verified each: the rework cost is quoted from this file
and still accurate; `rule.forbid.surprises` is indeed a house rule (ergonomist); and F9 and F10 do
touch the same function.

**it is not overturned here, and that is deliberate.** the fork is the wisher's to settle, and a
driver who flips his own entry on one dissent has stopped a record of the fork and started to pick
a side. what the dissent changes is the confidence (72% → 61%) and this section — so a council
that reads only this file meets both cases, not just mine.

⇒ note the pair the lane recommends: **settle F9 and F10 in one pass.** and note the knock-on in
`F12` — F9's verdict is one of the two conditions that would flip the declined
`GatheredMailSyncScope` extraction.

## the verdict

_open — awaits the council. one reviewer dissents; see the counter-argument above._
