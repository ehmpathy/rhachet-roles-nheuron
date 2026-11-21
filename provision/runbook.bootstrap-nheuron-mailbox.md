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

## the settled rules (do not relitigate)

- **region = `us-east-1`, always.** the console opens in the last region you used, and
  Identity Center binds to the region it is enabled in — a move means delete and re-create.
  every nheuron resource lives in `us-east-1` (`MAIL_REGION` in
  `provision/resources.common.mail.ts`). every region-scoped link here embeds `region=us-east-1`;
  never use a bare console link for identity center, ses, or s3.
- **declastruct owns all sso state.** permission sets, users, and account assignments are
  declared in `provision/aws.auth/account=.root/resources.admin.sso.ts`, the same shape as
  ahbode/infrastructure. the only sso clicks a human makes are the phase 3 bootstrap — one user,
  one `emergency-admin` permission set, one assignment to root — because no wish can run before a
  login exists. the wish adopts those three by name and owns them from then on.
- **credentials come from keyrack.** no `aws configure sso` by hand; the root profile is
  `AWS_PROFILE` in keyrack env `sudo` (vault `aws.config`).
- **personal emails never land in git.** account root emails and the sso user email live in
  keyrack only.

---

## phase 3 — bootstrap the first sso login 🧑

the one sso step a human owns. all later sso state is declared.

1. ⚠️ confirm the console region reads **N. Virginia (us-east-1)**, then enable Identity Center:
   https://us-east-1.console.aws.amazon.com/singlesignon/home?region=us-east-1#/enable-iam-identity-center
   - identity source = **AWS Organizations**
2. **Users → Add user**
   - username: `vlad`
   - email: the address you want for sso
   - first and last name
   - skip groups, then **Add user**
3. **Permission sets → Create permission set**
   - **Predefined → AdministratorAccess**
   - name: **`emergency-admin`**, exactly that — the wish finds it by this name
   - session duration **1 hour**, then **Create**
4. **AWS accounts → select `nheuron-root` → Assign users or groups**
   - pick `vlad`, pick `emergency-admin`, then **Submit**
5. accept the invitation email: set a password, set up mfa for the sso user.
6. register the root profile in keyrack. it asks for the access portal url (identity center
   settings → **AWS access portal URL**, `https://d-….awsapps.com/start`) and walks the login:
   ```sh
   rhx keyrack set --key AWS_PROFILE --owner ehmpath --env sudo --vault aws.config
   ```
   - sso region = `us-east-1` · client region = `us-east-1` (no other value)
   - account = `nheuron-root`, role = `emergency-admin`

⛳ the identity center instance lives in `us-east-1` and the profile lands in root:
```sh
rhx keyrack unlock --owner ehmpath --env sudo --key AWS_PROFILE
aws sts get-caller-identity                       # Account = nheuron-root's id
aws sso-admin list-instances --region us-east-1   # lists exactly one instance
```

---

## phase 4 — apply the root wishes: accounts, then sso 🤖

1. the member emails (`NHEURON_PROD_ACCOUNT_EMAIL`, `NHEURON_PREP_ACCOUNT_EMAIL`) and the sso
   user email live in keyrack env `prep`. fill any absent one:
   ```sh
   rhx keyrack fill --owner ehmpath --env prep
   ```
   > these throw at module load if absent — the wish refuses to plan without them.

2. ⚠️ **guard: confirm you are the root before you apply.** `aws sts get-caller-identity` must
   read nheuron-root's id. the wish learns the management-account id FROM these credentials, so
   a wrong profile silently builds the org under the wrong account.

3. plan, read the diff, then apply — accounts first (the sso assignments target them):
   ```sh
   npx declastruct plan  --wish 'provision/aws.auth/account=.root/resources.accounts.ts'
   npx declastruct apply --wish 'provision/aws.auth/account=.root/resources.accounts.ts'
   npx declastruct plan  --wish 'provision/aws.auth/account=.root/resources.admin.sso.ts'
   npx declastruct apply --wish 'provision/aws.auth/account=.root/resources.admin.sso.ts'
   ```
   - an account made by hand from the organizations console is found by its email and left
     as is; the plan may show a tag diff only.

⛳ the organizations console shows `nheuron-root`, `nheuron-prod`, `nheuron-prep` · identity
center shows `vlad` assigned to all three.

---

## phase 5 — register the `nheuron-prep` profile 🤖

the mail wish applies INTO `nheuron-prep`. its assignment came from phase 4; only the keyrack
profile is left:
```sh
rhx keyrack set --key AWS_PROFILE --owner ehmpath --env prep --vault aws.config
```
- sso region = `us-east-1` · client region = `us-east-1`
- account = `nheuron-prep`

⛳ `aws sts get-caller-identity` under the prep profile reads the `nheuron-prep` id.

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

⛳ the ses console (https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/identities)
shows identity `one.nheuron.com` with `verificationStatus: unresolved` (it
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
   cnames propagate — minutes to a few hours. re-check in the ses console
   (https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/identities) until it reads
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

5. 🤖 **reply as jelly** — the send half, r008 blocker.2 — via the `sendReplyViaSes`
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
