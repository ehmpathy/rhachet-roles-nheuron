# F6 — the inbound bucket name carries no account discriminator

## the fork, stated fairly

an s3 bucket name is **globally unique across all of aws**, so its shape is a real decision. two
of this behavior's own inputs specify it differently, and they disagree:

| input | the name it specifies |
|-------|----------------------|
| `howto.provision-ses-email-infra` (the handoff brief) | `ses-mail-inbox-<slug>-<accountId>` — an account discriminator, explicitly |
| the declastruct-aws demo the vision said to mirror | `ehmpathy-mail-inbound-demo` — no discriminator |

the implementation took the demo's shape: `MAIL_BUCKET = 'nheuron-mail-inbound-one'`.

| option | argument for |
|--------|-------------|
| **no discriminator** (taken) | mirrors the demo, which the vision named as the template; the name stays a constant a human can read, write, and fill into `SES_MAIL_BUCKET` without a lookup |
| `<name>-<accountId>` | globally collision-proof; and — the sharper argument — it makes the **F5 wrong-account apply recoverable** rather than permanent |

## read beside F5, which is where the real weight sits

read alone this is a name preference. read beside F5 it is not.

`MAIL_BUCKET` is a fixed global name. so if the mail wish applies under the wrong `AWS_PROFILE`
(the F5 hazard), the **root account claims that exact name**, globally and permanently. the
correct account can then never create it: a later apply into `nheuron-prep` fails with
`BucketAlreadyExists` until a human deletes the bucket in the wrong account.

with an account suffix, the same mistake is a plain orphan — a bucket obviously named for the
root — and the correct account's apply still succeeds on the first try.

⇒ so the suffix would not *prevent* F5's mistake. it would make it **cheap to recover from**,
which is the next best outcome and is a `rule.prefer.prevent-over-correct` rung the current
shape forgoes.

## taken, and why at the time

**no discriminator.** the stone's charge is to execute the vision, and the vision names the demo
as the template to mirror — twice, and by file path. where the handoff brief and the demo
disagree, the demo is the artifact the vision pointed at.

the friction argument I first reached for turned out to be **weak, and I record that honestly**:
I assumed a derived name would burden the human, then checked the handoff order and found
`SES_MAIL_BUCKET` is filled *after* the mail wish applies anyway. so the suffix costs the human
approximately no extra work. the real reason this stayed is the vision's instruction, not
ergonomics.

## rework, and why

**clean.** `name: \`${MAIL_BUCKET}-${account}\`` in `getResourcesOfMail` (which already takes
`account`), the two arn template strings beside it, the readme's `must equal` row, and the
provision test's expected values. one function, one doc table, one test.

## confidence

**75%.** the fork is genuinely close, and my first stated reason for the choice did not survive
its own check — a signal to weigh, not to hide.

what keeps me at "taken": the vision named the demo as the template, and a divergence from it
belongs to the wisher rather than to me mid-drive. what pulls the other way: this is the only
change that would make F5's failure recoverable, and F5 is the severest hazard in the stack.

⇒ **F5 and F6 should be ruled on together.** if the council takes F5's code guard, F6 matters
much less; if it declines F5, F6 becomes the cheapest mitigation left.

## where

- `provision/resources.common.mail.ts` — `MAIL_BUCKET`
- `provision/aws.mail/account=prep/resources.mail.ts` — the bucket + policy + grant arns
- `provision/aws.mail/account=prep/readme.md` — the `must equal` row
- `.agent/repo=.this/role=any/briefs/howto.provision-ses-email-infra.md` — the input diverged from

## the verdict

open — awaits the fulcrum council.
