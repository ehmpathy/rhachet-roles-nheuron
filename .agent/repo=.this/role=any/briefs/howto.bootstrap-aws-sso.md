# howto.bootstrap-aws-sso

## .what

the one by-hand sso step for a fresh aws organization: the floor a human lays so a declastruct
wish can log in. all sso state past this floor is declared, never clicked.

## .the settled rules

- **region = `us-east-1`, always.** identity center binds to the region it is enabled in; a move
  means delete and re-create. the console opens in the last region used, so use only
  region-pinned links (`https://us-east-1.console.aws.amazon.com/...?region=us-east-1`).
- **the floor is three objects**: one user, one `emergency-admin` permission set, one assignment
  of that pair to the management account. no wish can run before a login exists, so a human
  makes these three; the sso wish adopts them by name and owns them from then on.
- **declastruct owns all other sso state** — permission sets, users, assignments to every member
  account — in `provision/aws.auth/account=.root/resources.admin.sso.ts`, the same shape as
  ahbode/infrastructure. never add sso state by hand past the floor.
- **the profile lives in keyrack** (`AWS_PROFILE`, env `sudo`, vault `aws.config`), never a
  hand `aws configure sso`.
- **the sso email never lands in git**; keyrack holds it.

## .the clicks

in identity center: https://us-east-1.console.aws.amazon.com/singlesignon/home?region=us-east-1

0. ⚠️ confirm the region selector reads **N. Virginia (us-east-1)**, then **Enable**
   (identity source = **AWS Organizations**)
1. **Users → Add user**
   - username: `vlad`
   - email: the address you want for sso
   - first and last name
   - skip groups, then **Add user**
2. **Permission sets → Create permission set**
   - **Predefined → AdministratorAccess**
   - name: **`emergency-admin`**, exactly that — the wish finds it by this name
   - session duration **1 hour**, then **Create**
3. **AWS accounts → select the management account (`nheuron-root`) → Assign users or groups**
   - pick `vlad`, pick `emergency-admin`, then **Submit**
4. accept the invitation email: set a password, set up mfa for the sso user
5. register the profile in keyrack — it asks for the **AWS access portal URL** (identity center
   settings, `https://d-….awsapps.com/start`) and walks the login:
   ```sh
   rhx keyrack set --key AWS_PROFILE --owner ehmpath --env sudo --vault aws.config
   ```
   sso region + client region = `us-east-1`; account = the management account, role =
   `emergency-admin`

## .see also

- `provision/runbook.bootstrap-nheuron-mailbox.md` phase 3 — this floor in the full nheuron run
- `provision/aws.auth/account=.root/bootstrap.md` — the account + org floor beneath it
- `rule.require.credentials-from-keyrack` — why the profile lives in keyrack
