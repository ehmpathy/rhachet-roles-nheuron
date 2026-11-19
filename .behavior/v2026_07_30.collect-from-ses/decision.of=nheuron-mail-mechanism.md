# decision: nheuron mail is ses only

ruled by the commander, 2026-11-17 16:55Z. gmail is no option for nheuron mail, wherever a prior
artifact on this route or branch implies one.

## .the decision

nheuron mail sends and reads through **aws ses** alone. no google workspace, no gmail api, no
gmail service account stands behind any nheuron mailbox.

the ses path exists for this reason. it needs no oauth, no per-mailbox delegation, and no token
that expires: iam via `AWS_PROFILE` from keyrack.

## .what it binds

| seat | binds to |
|---|---|
| a nheuron mailbox (e.g. `jelly@one.nheuron.com`) | `--from ses`, on the infra in `provision/` |
| the live path to a real mailbox | `blocker/account-setup.md` tracks B–E, in order |
| the gmail mechanism on this branch | cut (fulcrum F18, ruled by the commander). `--from` takes `ses` alone |
| a later seat that meets `--from gmail` in an archived route or review | history, never an option for nheuron mail |

## .rejected

- **gmail via a workspace service account** — needs a google workspace domain, domain-wide
  delegation, and a second credential surface. ses covers send and read on a domain nheuron owns.

## .see also

- `.seeds/inventory.of=seeds.case=S1-nheuron-mail-is-ses-only.md` — the verdict as given
- `.seeds/inventory.of=seeds.case=S2-cut-every-gmail-path.md` — the cut as given
- `.fulcrums/inventory.of=fulcrums.case=F18-gmail-code-keep-or-cut.md` — the code question, ruled cut
- `.fulcrums/inventory.of=fulcrums.case=F19-gmail-cut-reaches-query-and-labels.md` — how far the cut reaches
- `blocker/account-setup.md` — the live path
