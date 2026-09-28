# runbook: bootstrap the `jelly@one.nheuron.com` mailbox

follow this top to bottom. each line is either a url to open, a command to run, or a value to
fill. do not skip the `aws sts get-caller-identity` checks — they are the only guard against the
one un-recoverable mistake (apply the mail wish under the wrong account).

## legend

| glyph | meaning |
|---|---|
| 🧑 | a human does this by hand (console, browser, card, phone) |
| 🤖 | a command anyone can run |
| ⛳ | a checkpoint — confirm the stated result before you go on |
| ⚠️ | a trap — read before you act |

---

## phase 0 — prereqs (gather these first)

🧑 have these ready before you start. a stall mid-apply is worse than a slow start.

- **4 email addresses**. the 3 aws-account addresses must each be one that is not already
  attached to an aws account (aws rejects a root email already in use):
  1. `nheuron-root` sign-up email (the org manager)
  2. `NHEURON_PROD_ACCOUNT_EMAIL` (not already attached to an aws account)
  3. `NHEURON_PREP_ACCOUNT_EMAIL` (not already attached to an aws account)
  4. your own address, to send a test mail in phase 8
- a **credit/debit card** + **phone** (aws sign-up verifies both)
- **edit access** to the `nheuron.com` zone in cloudflare
- this repo checked out, on this branch, with `npm ci` already run

⛳ 4 distinct emails in hand · card + phone ready · cloudflare zone access confirmed.

---

## phase 1 — create the `nheuron-root` account 🧑

1. open https://signup.aws.amazon.com/
2. sign up with email #1 from phase 0. name the account **`nheuron-root`**.
3. complete card + phone verification.
4. sign in to the console as the root user.
5. turn on **MFA for the root user** at once:
   https://console.aws.amazon.com/iam/home#/security_credentials
   (root has unlimited power; an un-MFA'd root is the softest target in the whole stack.)

⛳ you can sign in to `nheuron-root` · root MFA is on.

---

## phase 2 — create the aws organization 🧑

⚠️ declastruct cannot mint the org it authenticates as. so this one step is by hand; every
account after it is declared.

1. open https://console.aws.amazon.com/organizations/
2. click **Create an organization**.
3. choose **All features** (not "Consolidated billing only" — service control policies need it).

⛳ the organizations console shows one account (`nheuron-root`) under a management org with **All
features** on.

---

## phase 3 — set up a CLI profile for the root account 🧑

you need `AWS_PROFILE=nheuron-root` on your machine to run the account apply as the org manager.
use IAM Identity Center (the current path; long-lived access keys are the old, riskier way).

1. open https://console.aws.amazon.com/singlesignon/ and **enable** IAM Identity Center.
2. create a **permission set** named `AdministratorAccess` (use the aws-managed
   `AdministratorAccess` policy).
3. assign your human user to `nheuron-root` with that permission set.
4. copy the **AWS access portal URL** shown in Identity Center settings.
5. in your terminal, configure the profile:
   ```sh
   aws configure sso --profile nheuron-root
   ```
   - SSO start URL = the access portal url from step 4
   - SSO region = your Identity Center region (e.g. `us-east-1`)
   - account = `nheuron-root`, role = `AdministratorAccess`
6. log in:
   ```sh
   aws sso login --profile nheuron-root
   ```

⛳ run this and confirm the account is `nheuron-root`:
```sh
AWS_PROFILE=nheuron-root aws sts get-caller-identity
```

---

## phase 4 — fill the member emails, then apply the account wish 🤖

1. fill the two member emails into keyrack (env `prep`):
   ```sh
   rhx keyrack fill --owner ehmpath --env prep
   ```
   fill `NHEURON_PROD_ACCOUNT_EMAIL` = email #2, `NHEURON_PREP_ACCOUNT_EMAIL` = email #3.
   > these throw at module load if absent — the wish will refuse to plan without them.

2. unlock the env for the apply:
   ```sh
   rhx keyrack unlock --owner ehmpath --env prep
   ```

3. ⚠️ **guard: confirm you are the root before you apply.**
   ```sh
   AWS_PROFILE=nheuron-root aws sts get-caller-identity
   ```
   the account id must be `nheuron-root`. the wish learns the management-account id FROM these
   credentials, so a wrong profile here silently builds the org under the wrong account. no code
   guard exists — your eyes are the guard.

4. plan, read the diff, then apply (as root):
   ```sh
   AWS_PROFILE=nheuron-root npx declastruct plan  --wish 'provision/aws.auth/account=.root/resources.accounts.ts'
   AWS_PROFILE=nheuron-root npx declastruct apply --wish 'provision/aws.auth/account=.root/resources.accounts.ts'
   ```

⛳ the organizations console now shows three accounts: `nheuron-root`, `nheuron-prod`,
`nheuron-prep`. note the **`nheuron-prep` account id** — you need it next.

---

## phase 5 — set up a CLI profile for `nheuron-prep` 🧑

the mail wish applies INTO `nheuron-prep`, so you need a profile scoped to that account.

1. back in IAM Identity Center, assign your user to the **`nheuron-prep`** account with the
   `AdministratorAccess` permission set.
2. configure + log in:
   ```sh
   aws configure sso --profile nheuron-prep
   aws sso login --profile nheuron-prep
   ```
   account = `nheuron-prep`, role = `AdministratorAccess`.

⛳ confirm the profile lands in prep:
```sh
AWS_PROFILE=nheuron-prep aws sts get-caller-identity
```
the account id must equal the `nheuron-prep` id from phase 4.

---

## phase 6 — apply the mail wish into `nheuron-prep` 🤖

⚠️ **this is the worst-miss trap.** if you apply this under `nheuron-root` (or any wrong
account), the mailbox lands in the management account and the second vault wall dissolves. the
bucket name is global, so the only fix is a full teardown. **check the caller first.**

1. guard:
   ```sh
   AWS_PROFILE=nheuron-prep aws sts get-caller-identity
   ```
   the account id must be `nheuron-prep`.

2. plan, read the diff (8 resources: identity → bucket → bucket-policy → rule-set → rule → role
   + inline grant → config-set + event-dest → account-details), then apply:
   ```sh
   AWS_PROFILE=nheuron-prep npx declastruct plan  --wish 'provision/aws.mail/account=prep/resources.mail.ts'
   AWS_PROFILE=nheuron-prep npx declastruct apply --wish 'provision/aws.mail/account=prep/resources.mail.ts'
   ```

3. ⛳ **grab the 3 DKIM tokens** from the apply log. the `setSesEmailIdentity` step prints three
   cname tokens (each a long hex string). copy all three — phase 7 needs them.

⛳ the ses console shows identity `one.nheuron.com` with `verificationStatus: unresolved` (it
stays unresolved until the dns lands) · the s3 bucket `nheuron-mail-inbound-one` exists · you
have 3 dkim tokens saved.

---

## phase 7 — apply the cloudflare dns wish 🤖

1. 🧑 create a cloudflare **USER** api token (not an account token):
   https://dash.cloudflare.com/profile/api-tokens → **Create Token** → grant
   **Zone:Read** + **DNS:Edit**, scoped to the `nheuron.com` zone.
2. find your cloudflare **account id** in the dash url or the zone overview page.
3. fill the three values into keyrack (env `prep`):
   ```sh
   rhx keyrack fill --owner ehmpath --env prep
   ```
   - `CLOUDFLARE_API_TOKEN` = the user token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` = the account id from step 2
   - `SES_DKIM_TOKENS` = the 3 tokens from phase 6, comma-separated, no spaces
     (e.g. `tok1,tok2,tok3`)
   > ⚠️ the mail readme's line about "copy the tokens into `resources.mail.dns.ts`" is stale.
   > the dns wish reads `SES_DKIM_TOKENS` from keyrack — the keyrack path is the true one.
4. unlock + apply:
   ```sh
   rhx keyrack unlock --owner ehmpath --env prep
   npx declastruct plan  --wish 'provision/cloudflare/resources.mail.dns.ts'
   npx declastruct apply --wish 'provision/cloudflare/resources.mail.dns.ts'
   ```
   (cloudflare apply uses the api token, not an aws profile — no sts guard needed here.)

⛳ the `nheuron.com` zone shows 6 new records, all **DNS-only** (grey cloud, `proxied: false`):
1 MX, 1 SPF TXT, 3 DKIM CNAMEs, 1 DMARC TXT.

---

## phase 8 — verify + run the live loop 🤖

1. **await dns propagation.** ses moves the identity from `unresolved` to verified once the dkim
   cnames propagate — minutes to a few hours. re-check in the ses console until it reads
   verified.

2. auth-check the mailbox identity:
   ```sh
   AWS_PROFILE=nheuron-prep aws sts get-caller-identity
   ```

3. 🧑 send a test email **to** `jelly@one.nheuron.com` from your own address (email #4).

4. 🤖 **read it back** — this is the command that closes r008 blocker.1:
   ```sh
   rhx keyrack unlock --owner ehmpath --env prep
   rhx gather.mail --from ses --address jelly@one.nheuron.com --since 2026-09-01
   ```
   ⛳ your test email appears, parsed (from, subject, snippet).

5. 🤖 **reply as jelly** — the send half, r008 blocker.2 — via the `setReplyViaSes`
   communicator (from `jelly@one.nheuron.com` to your address).
   ⛳ your address receives jelly's reply.

⛳ **done.** the whole loop runs on the real mailbox — deliverable (c). the two blocked r008
points are now closeable: re-run the credential-gated acceptance proof, then re-arrive the
`5.1.execution.from_vision` stone.

---

## keyrack values that must match (silent-mismatch guard)

these are read by the ses adapter at gather time and must equal the constants baked into the
provision code (`provision/resources.common.mail.ts`). a mismatch fails quietly — the gather
reads an empty or wrong bucket with no loud error.

| keyrack key (env `prep`) | must equal |
|---|---|
| `SES_MAIL_BUCKET` | `nheuron-mail-inbound-one` |
| `SES_REGION` | `us-east-1` |
| `SES_CONFIG_SET` | `nheuron-mail-events` |

set them once (phase 7 unlock is a good moment) and confirm they match before phase 8 step 4.
