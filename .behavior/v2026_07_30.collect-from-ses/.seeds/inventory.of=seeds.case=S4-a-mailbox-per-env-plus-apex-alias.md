# S4 — a mailbox per env, plus an apex alias

## .said

"i mean, we should have both right? a prep mailbox we can test against and a prod one?"

"e.g., one.prep.nheuron.com, one.prod.nheuron.com, and one.nheuron.com = alias to one.prod.nheuron.com"

## .settled

two mailboxes, one per account:

- `jelly@one.prep.nheuron.com` in nheuron-prep — the one tests run against
- `jelly@one.prod.nheuron.com` in nheuron-prod
- `jelly@one.nheuron.com` = an alias of the prod mailbox: a second ses identity in nheuron-prod,
  its mx at the same prod inbound endpoint, named by the same receipt rule, into the same bucket

refines S3: prod still holds the public address; prep returns as the test target.

## .landed

- fulcrum F20 — the alias is a second identity in prod, not a dns cname (a cname cannot share a
  name with mx/txt records, and ses verifies each domain on its own)
- foreman asks: both `nheuron.prep.AWS_PROFILE` and `nheuron.prod.AWS_PROFILE`
