# runbook: bootstrap jelly's mailboxes (prep + prod)

follow this top to bottom. each line is either a url to open, a command to run, or a value to
fill. every apply runs through `rhx provision.root` or `rhx provision.member`, whose account
guard stops the one un-recoverable mistake (apply the mail wish under the wrong account).

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
rhx aws.caller.get --env sudo --expect management   # nheuron-root's id, manages the org
```

---

## phase 4 — apply the root wishes: accounts, then sso 🤖

1. the member emails (`NHEURON_PROD_ACCOUNT_EMAIL`, `NHEURON_PREP_ACCOUNT_EMAIL`) and the sso
   user email live in keyrack env `sudo`, set by name:
   ```sh
   rhx keyrack set --owner ehmpath --env sudo --key NHEURON_PROD_ACCOUNT_EMAIL
   ```
   > these throw at module load if absent — the wish refuses to plan without them.

2. plan, read the diff, then apply — accounts first (the sso assignments target them).
   `rhx provision.root` refuses before any declastruct call unless env `sudo` lands in the
   management account; `--key` hands each sudo email the wish reads:
   ```sh
   rhx provision.root --wish provision/aws.auth/account=.root/resources.accounts.ts --key NHEURON_PROD_ACCOUNT_EMAIL --key NHEURON_PREP_ACCOUNT_EMAIL --mode plan
   rhx provision.root --wish provision/aws.auth/account=.root/resources.accounts.ts --key NHEURON_PROD_ACCOUNT_EMAIL --key NHEURON_PREP_ACCOUNT_EMAIL --mode apply
   ```
   then the same pair for `resources.admin.sso.ts`.
   - an account made by hand from the organizations console is found by its email and left
     as is; the plan may show a tag diff only.

⛳ the organizations console shows `nheuron-root`, `nheuron-prod`, `nheuron-prep` · identity
center shows `vlad` assigned to all three.

---

## phase 5 — register the `nheuron-prep` and `nheuron-prod` profiles 🧑

one mailbox per member account: prep (`jelly@one.prep.nheuron.com`, the one tests run against)
and prod (`jelly@one.prod.nheuron.com`, plus its alias `jelly@one.nheuron.com`). each profile
lives in the **nheuron** org slot, apart from the shared ehmpathy slots:
```sh
rhx keyrack set --owner ehmpath --org nheuron --env prep --key AWS_PROFILE --vault aws.config
rhx keyrack set --owner ehmpath --org nheuron --env prod --key AWS_PROFILE --vault aws.config
```
- sso region = `us-east-1` · client region = `us-east-1`
- account = `nheuron-prep` / `nheuron-prod` · role = **`everyday-power`**
  - it reads every iam role and writes only `role/nheuron-mail-*`, which is all the mail wish
    declares (`roleEverydayPowerPolicyBundle` in `aws.auth/account=.root/resources.admin.sso.ts`)
  - the sso wish of phase 4 must be applied with that bundle first; before it, the plan halts
    at `iam:GetRole` AccessDenied

the mailbox keys per env (values: see the table at the end):
```sh
rhx keyrack set --owner ehmpath --org nheuron --env <env> --key SES_MAIL_BUCKET
rhx keyrack set --owner ehmpath --org nheuron --env <env> --key SES_REGION
rhx keyrack set --owner ehmpath --org nheuron --env <env> --key SES_CONFIG_SET
```

⛳ `rhx aws.caller.get --env <env> --org nheuron --expect member` reads each member account id.

---

## phase 6 — apply each mail wish 🤖

⚠️ **this is the worst-miss trap.** applied under the management account, a mailbox lands
there and the second vault wall dissolves; the bucket name is global, so the only fix is a full
teardown. `rhx provision.member` refuses before any declastruct call unless the slot lands in a
member account.

per env, prep first:

1. plan, read the diff (identity per domain → bucket → bucket-policy → rule-set → rule → role
   + inline grant → config-set + event-dest → account-details):
   ```sh
   rhx provision.member --wish provision/aws.mail/account=prep/resources.mail.ts --env prep --org nheuron --mode plan
   ```
2. apply the reviewed plan:
   ```sh
   rhx provision.member --wish provision/aws.mail/account=prep/resources.mail.ts --env prep --org nheuron --mode apply
   ```
3. repeat both with `prep` → `prod`.

⛳ each identity reads `verificationStatus: unresolved` until the dns lands · each env's bucket
exists.

---

## phase 7 — enter the dns records 🧑

the robot holds no credential on the zone. each run reads the dkim tokens live from the env's
identities and prints every record, from the same derivation the declared dns wish uses:
```sh
rhx mail.dns.records.get --env prep
rhx mail.dns.records.get --env prod
```
enter each in the `nheuron.com` zone, proxy **off**.

⛳ the zone holds 6 records per domain, 18 in all, every one **DNS-only** (grey cloud): per
domain 1 MX, 1 SPF TXT, 3 DKIM CNAMEs, 1 DMARC TXT.

> the declared path (`provision/cloudflare/resources.mail.dns.ts`) stays applyable for a
> zone-scoped token; see `provision/cloudflare/readme.md`.

---

## phase 8 — verify + run the live loop 🤖

1. **await dns propagation.** ses moves each identity from `unresolved` to verified once its dkim
   cnames propagate — minutes to a few hours. the env's plan reads them back.

2. 🤖 **prep: the live suites.** `TEST_LIVE=ses` sources the nheuron prep slot:
   - integration: the live plan, the keyrack ↔ constants clamp, and a send from jelly to jelly
     (verified via the domain, so it clears the ses sandbox with no outside address on record)
   - acceptance: `gather.mail` reads the prep mailbox

3. 🤖 **prod: the round trip on the public address.** send as `jelly@one.nheuron.com` to itself,
   then read it back:
   ```sh
   rhx keyrack unlock --owner ehmpath --org nheuron --env prod
   rhx gather.mail --from ses --address jelly@one.nheuron.com --since 2026-11-01
   ```

4. 🧑 send a test email **to** `jelly@one.nheuron.com` from your own address — the external
   inbound half. it appears on the next `gather.mail`.

⛳ **done.** both mailboxes run the whole loop — deliverable (c). replies to an outside address
wait on the sandbox exit (resource 8), which aws reviews out of band.

---

## keyrack values that must match (silent-mismatch guard)

these are read by the ses adapter at gather time and must equal the constants baked into the
provision code (`provision/resources.common.mail.ts`). a mismatch fails quietly — the gather
reads an empty or wrong bucket with no loud error.

| keyrack key (org `nheuron`) | env `prep` | env `prod` |
|---|---|---|
| `SES_MAIL_BUCKET` | `nheuron-mail-inbound-one-prep` | `nheuron-mail-inbound-one-prod` |
| `SES_REGION` | `us-east-1` | `us-east-1` |
| `SES_CONFIG_SET` | `nheuron-mail-events` | `nheuron-mail-events` |

phase 5 sets them; `provision/resources.common.mail.integration.test.ts` clamps the prep three
under `TEST_LIVE=ses`.