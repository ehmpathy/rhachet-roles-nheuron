# inventory of seeds

| case | title | settled |
|---|---|---|
| S1 | nheuron keys in their own org slot | nheuron mail + aws keys under keyrack org `nheuron`; the shared `ehmpathy.*` slots stay untouched |
| S2 | dns records set by hand | no cloudflare credential reaches the robot; the human enters the derived records |
| S3 | mailbox straight to prod | one.nheuron.com mail infra applies into nheuron-prod 368770445915; keys under `nheuron.prod.*` (refined by S4) |
| S4 | a mailbox per env, plus an apex alias | one.prep.nheuron.com in prep (the test target); one.prod.nheuron.com in prod; one.nheuron.com aliases prod |
