# S2 — dns records set by hand

## .said

"and i dont really wanna give cloudflare auth to you since it has all my accounts. can i instead set the dns records myself?"

## .settled

no cloudflare credential reaches the robot. the human enters the mail dns records (mx, spf, dmarc,
3 easy-dkim cnames) by hand; the robot derives the exact records from the applied ses identity and
hands them over, then proves them via dns lookup and ses verification status.

## .landed

- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` dropped from the foreman ask
