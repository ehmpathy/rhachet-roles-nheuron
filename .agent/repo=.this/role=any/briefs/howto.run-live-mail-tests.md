# howto: run the live mail tests

## .what

the cases that hit a real mail api run only when `TEST_LIVE` names their mechanism.
ci never sets it, so ci never needs live credentials.

| case | mechanism | needs |
|---|---|---|
| `sendReplyViaSes` `[case1]` (integration) | `ses` | the applied `jelly@one.nheuron.com` mailbox, `SES_MAIL_BUCKET` + `SES_REGION` + `SES_CONFIG_SET` (keyrack `prep`), `AWS_PROFILE=nheuron-prep`. sends one real mail, mailbox to itself |
| `gatherMail` `[case6]` (acceptance) | `ses` | the same mailbox and keys, with at least one mail held — the send above supplies it |
| `resources.mail` `[case3]` (integration) | `ses` | `AWS_PROFILE=nheuron-prep`. runs `declastruct plan` on the mail wish; reads every declared resource back from aws |
| `resources.mail.dns` `[case3]` (integration) | `cloudflare` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` + `SES_DKIM_TOKENS` (keyrack `prep`). plans the dns wish against the live zone |
| `resources.accounts` `[case1]` (integration) | `aws.accounts` | `AWS_PROFILE=nheuron-root` + the two account root emails (keyrack `prep`). plans the account triplet against the live organization |

## .how

```sh
# ses: send first, then read it back
rhx keyrack unlock --owner ehmpath --env prep
AWS_PROFILE=nheuron-prep TEST_LIVE=ses npm run test:integration -- sendReplyViaSes
AWS_PROFILE=nheuron-prep TEST_LIVE=ses npm run test:acceptance -- gatherMail

# provision wishes: a real plan, never an apply
rhx keyrack unlock --owner ehmpath --env prep
AWS_PROFILE=nheuron-prep TEST_LIVE=ses npm run test:integration -- resources.mail
TEST_LIVE=cloudflare npm run test:integration -- resources.mail.dns
AWS_PROFILE=nheuron-root TEST_LIVE=aws.accounts npm run test:integration -- resources.accounts
```

## .the contract

- flag absent → the case skips by name (`○ skipped … (TEST_LIVE=ses)`)
- flag names the mechanism, credential absent → the case throws `BadRequestError` with the fix
- a skip therefore means "not asked", never "asked, and the key was absent"

## .see also

- `.behavior/v2026_07_30.collect-from-ses/blocker/account-setup.md` — stand up the ses mailbox
