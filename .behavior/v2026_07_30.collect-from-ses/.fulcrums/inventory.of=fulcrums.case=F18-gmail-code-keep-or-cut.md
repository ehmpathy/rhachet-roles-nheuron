# F18 — the gmail code this branch ships: keep or cut

rework: clean · status: ruled: (b) cut (commander) · confidence: n/a (his call)

## .the fork

the commander ruled nheuron mail ses only (`decision.of=nheuron-mail-mechanism.md`). the branch
still shipped the gmail mechanism: `--from gmail` in `gather.mail` and `gather.auth`, its adapter,
its tests, its live case, and its keyrack keys.

- (a) keep — the code stays as a generic gatherer mechanism for other domain owners; no nheuron path uses it
- (b) cut — remove the gmail mechanism from this pr; `--from` takes `ses` only

## .taken

(b), by the commander's verdict. no driver guess stood in for it.

## .rework, why clean

the ses path is untouched. the cut deletes the gmail adapter, its oauth token cache, its cli
branch, its tests and snapshots, its keyrack keys, and its service-account brief; no ses file
imported them.

## .where

- `src/domain.operations/gather/adapters/gmail/` (deleted)
- `src/domain.operations/gather/auth/token/` (deleted; the oauth token cache only gmail read)
- `src/contract/cli/` (`--from gmail` branches in `gather.mail`, `gather.auth`)
- `.agent/keyrack.yml` (the four gmail test keys)
- `.agent/repo=.this/role=any/briefs/howto.create-gmail-service-account.md` (deleted)
- how far the cut reaches past the adapter: F19

## .verdict

ruled: (b) cut — the commander, 2026-11-17. ses was built so nheuron needs no google path.
