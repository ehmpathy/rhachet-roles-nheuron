# F19 — the gmail cut reaches `--query`, the `/labels=` scope, and `GatheredMail.labels`

rework: clean · status: taken: (b) · confidence: 90%

## .the fork

F18 ruled the gmail mechanism cut. three surfaces sat beside the adapter, built for gmail and
kept on ses only as refusals or empty fields:

- `--query` — gmail search syntax; ses refused it (`getFilterRefusal`)
- the `/labels=` address scope — gmail labels; ses refused it, and the scope parse fed the cache path
- `GatheredMail.labels` — always `[]` on ses (rfc822 has no label concept)

- (a) keep them — the filter contract stays for a future mechanism that can honor it
- (b) cut them with the adapter — `--from ses --address <one mailbox> [--since] [--format]`

## .taken

(b). each surface existed for gmail. on ses, two only refused and one was always empty, so each
kept a contract no mechanism honors. their removal also collapses the scoped-run branches in
`setMailsFromAdapter`, which makes F10 and F12 moot. `rule.prefer.wet-over-dry`: a future
mechanism that can filter adds its filter then, shaped to what it can honor.

the address guard the scope parse gave for free is kept on purpose: `asAddressOrThrow` refuses
an address with a `/` or a space before it reaches a cache path.

## .rework, why clean

the ses read path is unchanged. a revert restores `GatherMailFilter`, `getFilterRefusal`,
`getAddressScope*`, `--query`, and the `labels` field from git; no caller outside the gatherer
reads them.

## .confidence, why not higher

the verdict names the gmail code, readme, vision, and howto lines. it does not name `--query` or
labels. the reach is my read of "every gmail path cut": a flag that exists only to refuse on the
one mechanism left is a gmail path in all but name.

## .where

- `src/domain.objects/GatherMailAdapter.ts` (`GatherMailFilter`, `getFilterRefusal` removed)
- `src/domain.objects/GatherAddressScope.ts` (deleted)
- `src/domain.objects/GatheredMail.ts` (`labels` removed)
- `src/domain.operations/gather/mail/setMailsFromAdapter.ts` (scoped-run branches removed)
- `src/domain.operations/gather/mail/transformers/asAddressOrThrow.ts` (new)
- `src/contract/cli/gatherMail.ts` (`--query` removed)

## .verdict

_open — awaits the commander, if he wants the filter contract kept._
