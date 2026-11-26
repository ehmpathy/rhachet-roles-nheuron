# F18 — the cloudflare dns wish is kept beside the hand step

## .the fork

the human enters the mail dns records by hand (seed S2). the declared cloudflare wish
(`provision/cloudflare/resources.mail.dns.ts`) then sits off the critical path.

- (a) delete the wish and its transformers; the hand step is the only path
- (b) keep the wish as the optional path for a zone-scoped token; derive the hand records from the
  same `asSesMailDnsRecords` transformer, so both paths declare one record set

## .taken

(b). the transformers already compute the exact records the human needs; the wish costs naught to
keep and is the path the human named as ideal once a zone-scoped token exists. one transformer
feeds both, so the hand records and the wish cannot drift.

## .rework

clean — delete one wish file, its readme, and its integration test; no caller depends on them.

## .confidence

85%. the doubt: a wish no one applies can rot unseen. its live case stays gated behind
`TEST_LIVE=cloudflare`, so ci never proves it.

## .where

`provision/cloudflare/`
