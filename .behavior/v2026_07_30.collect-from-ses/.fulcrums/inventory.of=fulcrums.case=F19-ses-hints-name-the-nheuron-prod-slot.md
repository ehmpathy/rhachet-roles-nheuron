# F19 — ses hints name the nheuron prod slot

## .the fork

the ses mechanism's error hints name the keyrack unlock that fixes them. the mailbox moved to
nheuron-prod under keyrack org `nheuron` (seeds S1, S3), so the old `--env prep` hint now unlocks
the wrong slot.

- (a) hints name the exact slot: `rhx keyrack unlock --owner ehmpath --org nheuron --env prod`
- (b) hints stay generic (`rhx keyrack unlock --owner ehmpath --env <env>`) for a reuser on another domain

## .taken

(a). an error must name the fix a human can paste (`rule.require.errors-name-the-fix`); a
placeholder is a fix the human must decode. this repo is the nheuron role package, and its one
mailbox lives in that slot.

## .rework

clean — one string per hint, plus their snapshots and assertions.

## .confidence

80%. the doubt: the wish asks for resources a domain owner reuses; a second domain would need
these hints parameterized, likely from the manifest's org list.

## .where

`src/domain.operations/gather/**` ses hints · `gather.auth` help text · their snapshots
