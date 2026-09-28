# bootstrap: nheuron-root + the aws organization

## .what

the one step declastruct cannot do for itself: create the `nheuron-root` aws account and its
organization, by hand, once.

each step below this one is declared — `resources.accounts.ts` mints `nheuron-prod` and
`nheuron-prep` as member accounts, and the mail wish applies into prep.

## .why

declastruct cannot mint the organization it authenticates as. an apply must already hold
credentials for a management account before it can declare a member of that account's org. so
the very bottom of the nest is a manual console step, and only that.

this is the outermost wall of the fort-knox nest (`philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes`):
a dedicated organization means nheuron's infra shares no blast radius with any other project.

---

## the steps

### 1. create the `nheuron-root` account

1. sign up at the aws console with a **fresh** email address
   - the root email is the account's natural key; aws forbids reuse across accounts
   - use a plus-addressed or dedicated inbox you control and will not lose
2. name the account **`nheuron-root`**
3. complete the payment + phone verification steps
4. enable **MFA on the root user** first, before any other move

> ⚠️ the root user of an org's management account can act on every member account.
> treat its credentials as the crown jewels: mfa on, no access keys, no daily use.

### 2. create the organization

1. sign in to the `nheuron-root` account
2. go to **AWS Organizations** → **Create an organization**
3. choose **All features** (not consolidated-bill-only) — SCPs and account create both need it

that is the whole manual surface. `resources.accounts.ts` takes it from here.

### 3. fill the account emails into keyrack

the declared member accounts each need a root email, and each must be a **fresh, unused**
address. they never land in git — keyrack is the one source
(`rule.require.credentials-from-keyrack`).

```sh
rhx keyrack fill --owner ehmpath --env prep
#   NHEURON_PROD_ACCOUNT_EMAIL   -> a fresh address for nheuron-prod
#   NHEURON_PREP_ACCOUNT_EMAIL   -> a fresh address for nheuron-prep
```

⚠️ **the two addresses must differ**, and aws reads them case-insensitively — `A@x.com` and
`a@x.com` are one address to aws. a root email is an account's natural key at create time, so
a duplicate does not merely look untidy: aws refuses the second account, and it refuses it
*after* the org exists and the first account is minted. to close a half-provisioned account
takes an aws support ticket.

the wish refuses to import when the two match, so this fails at your terminal rather than
mid-apply. if you see `two declared aws accounts name the same root email`, that is this check.

### 4. apply the account wish, as the root

```sh
rhx keyrack unlock --owner ehmpath --env prep

# 1. CONFIRM THE ACCOUNT FIRST — the code cannot carry this guard
aws sts get-caller-identity
#    read `Account`. it must be nheuron-root's id.

# 2. plan — read what it would mint
npx declastruct plan --wish provision/aws.auth/account=.root/resources.accounts.ts

# 3. then apply
npx declastruct apply --wish provision/aws.auth/account=.root/resources.accounts.ts
```

`AWS_PROFILE` must name a profile for **`nheuron-root`** here. the wish reads the management
account id from those credentials, so a profile for the wrong account declares the wrong org.

⚠️ the guard is manual because it cannot be otherwise: the wish's whole job is to learn the
management account id **from** the credentials, so it has no independent value to check that id
against. that is the same reason the mail wish leaves its account check to a human
(`provision/aws.mail/account=prep/readme.md`), and it is why `AWS_PROFILE` changes between this
step and that one — one key, two accounts, in sequence.

### 5. verify

```
AWS Organizations -> AWS accounts
  nheuron-root   (management)
  nheuron-prod   (member)
  nheuron-prep   (member)
```

each member is reachable by assume of `OrganizationAccountAccessRole` from the root.

---

## what comes next

| step | where |
|------|-------|
| the mail infra (ses + s3 + iam) | `provision/aws.mail/account=prep/readme.md` |
| the mail dns records | `provision/cloudflare/readme.md` |

## .see also

- `resources.accounts.ts` — the declared member accounts this bootstrap enables
- `.behavior/v2026_07_30.collect-from-ses/1.vision.yield.md` — deliverable (a0)
- `philosophy.external-brain._.zoom=fort-knox-of-fort-knoxes` — why the nest starts here
