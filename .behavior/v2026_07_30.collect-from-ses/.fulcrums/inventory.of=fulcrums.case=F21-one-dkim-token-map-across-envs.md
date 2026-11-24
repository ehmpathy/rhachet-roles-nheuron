# F21 — one dkim token map across envs

## .the fork

three domains across two accounts each mint 3 dkim tokens; all their records sit in the one
`nheuron.com` zone. the declared dns wish needs every token.

- (a) one dns wish over every env, fed by one keyrack value in the zone's slot (nheuron prod):
  `SES_DKIM_TOKENS = <domain>=t1,t2,t3;<domain>=…`
- (b) one dns wish per env, each fed by its own env's `SES_DKIM_TOKENS`
- (c) the dns wish reads the tokens live from ses — needs both accounts' credentials at once

## .taken

(a). the zone is one resource, so one wish owns it; a wish per env would each declare the zone.
(c) needs two aws profiles inside one cloudflare apply. `rhx mail.dns.records.get --env <env>`
reads the tokens live and prints each env's segment, so no token is copied by hand.

## .rework

clean — `asDkimTokensByDomain` + one wish; a switch to (b) splits the wish and the key.

## .confidence

75%. the doubt: the human joins two printed segments into one value. a mistype refuses loud
(absent domain or no-domain segment), but it is still a hand join. the hand dns path (S2) does
not touch this value at all.

## .where

`provision/cloudflare/resources.mail.dns.ts` · `asDkimTokensByDomain.ts` ·
`.agent/repo=.this/role=any/skills/mail.dns.records.get.sh`
