# risk ask: account setup for the collect-from-ses live run

> a risk ask for the live run only — never a merge gate. ci stays green without it: the live
> cases sit behind `TEST_LIVE` and skip when no flag names them.
> run top to bottom. each step = one command or one console path, then what it unblocks.
> 🧑 = human by hand · 🤖 = command · ⛳ = check before you go on.

## what this unblocks

| track | steps | closes |
|---|---|---|
| A — gmail credentials | A1–A4 | live `[case7]` via `TEST_LIVE=gmail` (r008 blocker.1, gmail half) |
| B — aws accounts | B1–B6 | the `nheuron-prod` + `nheuron-prep` accounts the mailbox lives in |
| C — ses mailbox | C1–C3 | `jelly@one.nheuron.com` identity, inbound bucket, dkim tokens |
| D — dns | D1–D4 | mx, spf, dkim, dmarc on `one.nheuron.com` |
| E — live loop | E1–E3 | r008 blocker.1 (ses live read) + blocker.2 (real send) |
| F — ci aws auth | F1 | `suite / test-integration` in CI |

tracks A and F are independent of B–E. B → C → D → E has a hard order.

## prereqs

🧑 gather first:

- 3 email addresses that no aws account uses yet: `nheuron-root` sign-up, `nheuron-prod`, `nheuron-prep`. all three distinct (aws compares them without regard to case)
- 1 address of your own for the test mail in E1
- a card + phone (aws sign-up verifies both)
- google workspace admin on the domain the gmail service account impersonates
- edit access to the `nheuron.com` zone in cloudflare
- this branch checked out, `npm ci` run

---

## track A — gmail credentials

**A1** 🧑 create the service account, its json key, gmail api, and domain-wide delegation (scope `https://www.googleapis.com/auth/gmail.readonly`).
console path: `.agent/repo=.this/role=any/briefs/howto.create-gmail-service-account.md` steps 1–5.
unblocks: the key json and the subject address that A2 + A3 need.

**A2** 🤖 fill the four test keys into keyrack:
```sh
rhx keyrack fill --owner ehmpath --env test
#   GMAIL_SERVICE_ACCOUNT_JSON      the key json, one line
#   GMAIL_SERVICE_ACCOUNT_SUBJECT   the workspace address it impersonates
#   GATHER_GMAIL_CLIENT_ID          oauth client id (the interactive gather.auth path)
#   GATHER_GMAIL_CLIENT_SECRET      oauth client secret
```
unblocks: local acceptance `[case7]`.

**A3** 🤖 optional — only to run the live gmail case in ci under `TEST_LIVE=gmail`. set the two ci secrets (the workflows already pass them to the acceptance job):
```sh
gh secret set GMAIL_SERVICE_ACCOUNT_JSON --repo ehmpathy/rhachet-roles-nheuron < path/to/key.json
gh secret set GMAIL_SERVICE_ACCOUNT_SUBJECT --repo ehmpathy/rhachet-roles-nheuron --body 'robot@yourdomain.com'
```
unblocks: the live gmail case in ci, once a flag targets it. ci is green without it.

**A4** ⛳ check:
```sh
rhx keyrack unlock --owner ehmpath --env test
rhx gather.mail --from gmail --address robot@yourdomain.com
```
expect: mail listed, no `token exchange failed`.

---

## track B — aws accounts

**B1** 🧑 sign up `nheuron-root` with address #1: https://signup.aws.amazon.com/ → then turn on root mfa: https://console.aws.amazon.com/iam/home#/security_credentials
unblocks: a management account for the org.

**B2** 🧑 create the org: https://console.aws.amazon.com/organizations/ → **Create an organization** → **All features**.
unblocks: declastruct can mint member accounts. (it cannot mint the org it signs in as.)

**B3** 🧑 enable identity center: https://console.aws.amazon.com/singlesignon/ → **Enable** → permission set `AdministratorAccess` (aws-managed policy) → assign your user to `nheuron-root`. copy the **AWS access portal URL**.
then:
```sh
aws configure sso --profile nheuron-root && aws sso login --profile nheuron-root
```
unblocks: `AWS_PROFILE=nheuron-root` for B5.

**B4** 🤖 fill the two member emails:
```sh
rhx keyrack fill --owner ehmpath --env prep
#   NHEURON_PROD_ACCOUNT_EMAIL   address #2
#   NHEURON_PREP_ACCOUNT_EMAIL   address #3
```
unblocks: the account wish imports (it refuses at load if absent or equal).

**B5** 🤖 ⚠️ confirm the caller is `nheuron-root`, then plan + apply the account wish:
```sh
rhx keyrack unlock --owner ehmpath --env prep
AWS_PROFILE=nheuron-root aws sts get-caller-identity          # Account must be nheuron-root
AWS_PROFILE=nheuron-root npx declastruct plan  --wish 'provision/aws.auth/account=.root/resources.accounts.ts'
AWS_PROFILE=nheuron-root npx declastruct apply --wish 'provision/aws.auth/account=.root/resources.accounts.ts'
```
unblocks: `nheuron-prod` + `nheuron-prep` exist. ⛳ organizations console lists three accounts. note the `nheuron-prep` account id.

**B6** 🧑 identity center → assign your user to `nheuron-prep` with `AdministratorAccess`. then:
```sh
aws configure sso --profile nheuron-prep && aws sso login --profile nheuron-prep
AWS_PROFILE=nheuron-prep aws sts get-caller-identity          # Account must equal the B5 prep id
```
unblocks: `AWS_PROFILE=nheuron-prep` for C2.

---

## track C — ses mailbox

**C1** 🤖 fill the three mailbox keys (values must match `provision/resources.common.mail.ts`; a mismatch reads an empty bucket with no error):
```sh
rhx keyrack fill --owner ehmpath --env prep
#   SES_MAIL_BUCKET   nheuron-mail-inbound-one
#   SES_REGION        us-east-1
#   SES_CONFIG_SET    nheuron-mail-events
```
unblocks: `gather.mail --from ses` and `sendReplyViaSes` read the right resources.

**C2** 🤖 ⚠️ worst trap: an apply under the wrong account lands the mailbox there, and the global bucket name forces a full teardown. confirm, then plan + apply:
```sh
rhx keyrack unlock --owner ehmpath --env prep
AWS_PROFILE=nheuron-prep aws sts get-caller-identity          # Account must be nheuron-prep
AWS_PROFILE=nheuron-prep npx declastruct plan  --wish 'provision/aws.mail/account=prep/resources.mail.ts'
AWS_PROFILE=nheuron-prep npx declastruct apply --wish 'provision/aws.mail/account=prep/resources.mail.ts'
```
unblocks: ses identity `one.nheuron.com`, bucket `nheuron-mail-inbound-one`, receipt rule, config set.

**C3** ⛳ copy the 3 dkim tokens the `setSesEmailIdentity` step prints in the apply log.
unblocks: D2.

---

## track D — dns

**D1** 🧑 cloudflare **user** token (not account token): https://dash.cloudflare.com/profile/api-tokens → **Create Token** → `Zone:Read` + `DNS:Edit`, zone `nheuron.com`. copy the account id from the zone overview page.
unblocks: the dns wish can write the zone.

**D2** 🤖 fill:
```sh
rhx keyrack fill --owner ehmpath --env prep
#   CLOUDFLARE_API_TOKEN    the D1 token
#   CLOUDFLARE_ACCOUNT_ID   the D1 account id
#   SES_DKIM_TOKENS         the 3 C3 tokens, comma-separated, no spaces
```

**D3** 🤖 plan + apply the dns wish:
```sh
rhx keyrack unlock --owner ehmpath --env prep
npx declastruct plan  --wish 'provision/cloudflare/resources.mail.dns.ts'
npx declastruct apply --wish 'provision/cloudflare/resources.mail.dns.ts'
```
unblocks: 6 records on `one.nheuron.com` (1 mx, 1 spf, 3 dkim cnames, 1 dmarc), all dns-only.

**D4** ⛳ ses console → identities → `one.nheuron.com` reads **verified** (minutes to a few hours).
unblocks: inbound delivery + signed sends.

---

## track E — live loop

**E1** 🧑 send a mail from your own address to `jelly@one.nheuron.com`.

**E2** 🤖 read it back:
```sh
rhx keyrack unlock --owner ehmpath --env prep
AWS_PROFILE=nheuron-prep rhx gather.mail --from ses --address jelly@one.nheuron.com --since 2026-10-01
AWS_PROFILE=nheuron-prep TEST_LIVE=ses npm run test:acceptance -- gatherMail   # the live [case11]
```
unblocks: r008 blocker.1 (ses half). ⛳ your mail appears with from, subject, snippet; `[case11]` passes.

**E3** 🧑 tell the driver "mailbox live". the driver composes the reply path, sends from `jelly@`, and re-arrives the stone.
⚠️ a new ses account sits in the sandbox: it sends only to verified addresses until aws grants production access (the mail wish requests it; aws answers within ~24h). to prove the send sooner, verify your E1 address: ses console → identities → **Create identity** → email address.
unblocks: r008 blocker.2.

---

## track F — ci aws auth

**F1** 🤖 point ci at an oidc role in the account the integration tests target (the one `AWS_PROFILE=demo-agent` reaches locally):
```sh
gh variable set CREDS_CICD_AWS_DEV_OIDC_ROLE_ARN --repo ehmpathy/rhachet-roles-nheuron --body 'arn:aws:iam::<account-id>:role/<github-oidc-role>'
```
the role's trust policy must name `token.actions.githubusercontent.com` for `repo:ehmpathy/rhachet-roles-nheuron:*`.
unblocks: `suite / test-integration` (aws-backed cases) in CI. without it, `.test.yml` skips aws auth and those cases fail.

---

## note — not a blocker

the `nheuron-mail-clone` role trusts `ec2.amazonaws.com`, so no local principal can assume it today (see the yield § "one decision the wisher owes before step 4"). E2 does not need it: it reads under the `nheuron-prep` admin profile. the least-privilege path stays open as a follow-up.
