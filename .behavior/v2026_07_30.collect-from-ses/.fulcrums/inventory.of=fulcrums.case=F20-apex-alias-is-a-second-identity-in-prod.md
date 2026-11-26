# F20 — the apex alias is a second identity in prod

## .the fork

`one.nheuron.com` must reach the prod mailbox (seed S4). an "alias" admits two shapes:

- (a) a dns cname `one.nheuron.com → one.prod.nheuron.com`
- (b) a second ses domain identity for `one.nheuron.com` in nheuron-prod: its own mx (same prod
  inbound endpoint), spf, dkim, dmarc; the one receipt rule names `jelly@` at both domains, into
  the one prod bucket; the send grant covers both

## .taken

(b). (a) cannot work: a cname may not share a name with other records, and the alias needs its
own mx + txt; ses also verifies each domain on its own, so a cname'd name would never verify or
send. (b) is what "one mailbox, two addresses" means in mail.

## .rework

clean — `MAIL_BY_ENV.prod.domains` is a list; drop the alias entry and its identity goes with it.

## .confidence

88%. the doubt: the wisher may want replies sent FROM `one.nheuron.com` rather than
`one.prod.nheuron.com`; both are granted, so the choice sits with the caller, unpinned.

## .where

`provision/resources.common.mail.ts` (`MAIL_BY_ENV`) · `provision/aws.mail/getResourcesOfMail.ts`
