# F22 — member slot tier for the mail apply

## .the fork

the mail wish declares an iam role + inline grant. bare PowerUserAccess grants no iam, so a plan
under `everyday-power` halts at `iam:GetRole` AccessDenied.

- (a) each member slot points at `emergency-admin`; one slot serves the apply and the live tests
- (b) two slots per env: an admin key for `provision.member`, the power key for tests and gather
- (c) lift iam out of the mail wish into a root-run wish
- (d) widen `everyday-power` with an inline bundle: role reads open, role writes allowlisted by
  name — the ahbode/infrastructure `roleEverydayPowerPolicyBundle` shape

## .taken

(d), ruled by the wisher, with ahbode/infrastructure as the precedent. scope is tighter than
ahbode's `svc-*`: writes reach only `role/nheuron-mail-*`, and AttachRolePolicy is left out, so
the tier cannot attach a managed policy such as AdministratorAccess to a role.

## .rework

clean — one bundle in `resources.admin.sso.ts`; a new role family is a one-line resource add.

## .confidence

85%. the doubt: PutRolePolicy still writes any inline document onto an allowlisted role, so a
holder of `everyday-power` could grant a `nheuron-mail-*` role more than the mail needs. a
permissions boundary condition would close that.

## .verdict

wisher ruled (d) over (a): everyday-power should create roles, with allowlisted privileges.

## .where

`provision/aws.auth/account=.root/resources.admin.sso.ts` ·
`provision/runbook.bootstrap-nheuron-mailbox.md` phase 5
