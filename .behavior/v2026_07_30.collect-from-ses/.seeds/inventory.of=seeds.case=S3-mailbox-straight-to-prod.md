# S3 — mailbox straight to prod

## .said

asked: why only prep? does nheuron need prod aws too?

"and yeah just assume we want to promote one.nheuron.com into prod directly"

## .settled

the one.nheuron.com mail infra applies into nheuron-prod (368770445915), not nheuron-prep. the
mailbox's keys live under keyrack `nheuron.prod.*`.

## .landed

- foreman ask: `nheuron.prod.AWS_PROFILE` (account 368770445915, emergency-admin) replaces the prep profile
