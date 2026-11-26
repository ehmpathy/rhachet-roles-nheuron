# howto: run the live mail tests

## .what

cases that hit a real api run only when `TEST_LIVE` names their gate. ci never sets it, so ci
needs no live credential. `rhx test.live` sets the gate and runs `git.repo.test` under it.

| gate | what it exercises | keyrack slot |
|---|---|---|
| `ses` | the prep mailbox `jelly@one.prep.nheuron.com`: a real send (mailbox to itself), a real `gather.mail` read, a `declastruct plan` of the mail wish | `--org nheuron --env prep`: `AWS_PROFILE`, `SES_MAIL_BUCKET`, `SES_REGION`, `SES_CONFIG_SET` |
| `cloudflare` | a plan of the mail dns wish against the live `nheuron.com` zone | `--env prod`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SES_DKIM_TOKENS` |
| `aws.accounts` | plans of the root wishes (account triplet, sso admins, spend lockdown) against the live organization | the management-account slot (`--env sudo`) |
| `gmail` | the gmail mechanism via a service account | `--env test`: `GMAIL_SERVICE_ACCOUNT_JSON`, `GMAIL_SERVICE_ACCOUNT_SUBJECT` |

## .how

```sh
# ses: unlock the prep slot, then run the gated suites
rhx keyrack unlock --owner ehmpath --org nheuron --env prep
rhx test.live --live ses --what integration --mode apply
rhx test.live --live ses --what acceptance --mode apply

# several gates at once
rhx test.live --live ses,cloudflare --what integration --mode apply

# narrow to one suite
rhx test.live --live ses --what integration --scope sendReplyViaSes --mode apply
```

keyrack can leave a key locked after a whole-slot unlock. a gate that throws "absent" with the
slot unlocked → unlock that key alone: `rhx keyrack unlock --owner ehmpath --org nheuron --env prep --key <KEY>`.

provision gates run `declastruct plan`, never an apply.

## .the contract

- gate absent → the case skips by name (`○ skipped … (TEST_LIVE=ses)`)
- gate named, credential absent → the case throws with the unlock command as its hint
- a skip therefore means "not asked", never "asked, and the key was absent"

## .see also

- `howto.create-gmail-service-account.md` — mint the gmail credential
- `provision/aws.mail/readme.md` — stand up a mailbox
- `provision/runbook.bootstrap-nheuron-mailbox.md` — the full nheuron bootstrap, in order
