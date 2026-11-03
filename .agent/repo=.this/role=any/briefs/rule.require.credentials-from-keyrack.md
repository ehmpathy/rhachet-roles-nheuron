# rule.require.credentials-from-keyrack

## .what

every credential this repo consumes — api keys, tokens, aws profiles, oauth secrets, service
account json, passwords — comes **exclusively** from keyrack. keyrack is the one source. no
credential is read from any other place: not a hardcoded literal, not a committed `.env`, not
an ad-hoc `process.env` read of a raw secret, not a config file, not a prompt.

## .why

- **one source, one blast radius** — a single credential store means one place to rotate, one
  place to audit, one place to lock. secrets scattered across `.env` files, configs, and
  literals multiply the surface a leak can escape through.
- **age-encrypted at rest** — keyrack holds secrets encrypted (os.secure / age), never
  plaintext. a raw `.env` or a literal is plaintext on disk and in git history forever.
- **no accidental commits** — a secret that only ever lives in keyrack cannot be committed by
  mistake; a secret in a tracked file eventually is.
- **uniform access** — `rhx keyrack unlock --owner ehmpath --env <env>` is the one motion
  every skill, test, and adapter shares. one mental model, one failure mode, one fix.
- **precedent** — this is how rhachet-roles-ghlitch and the gatherer skills already pull
  `AWS_PROFILE` and other secrets. keyrack-only keeps this repo consistent with that pattern.

## .the rule

| credential source | verdict |
|-------------------|---------|
| keyrack (`rhx keyrack unlock ...` → env at runtime) | required — the only allowed source |
| hardcoded literal in code | forbidden |
| committed `.env` / config file with a secret value | forbidden |
| raw `process.env.SECRET` read of a value not sourced from keyrack | forbidden |
| interactive prompt for a secret | forbidden |
| a third-party sdk's own credential file (e.g. `~/.aws/credentials` read directly) | forbidden — route it through keyrack instead |

## .how

- **declare** each credential in `.agent/keyrack.yml` under the right env (`env.test`,
  `env.prep`, `env.prod`).
- **unlock** at the boundary: `rhx keyrack unlock --owner ehmpath --env <env>` populates the
  env for the process; code reads it from `process.env` only after keyrack put it there.
- **fail loud** when a credential is absent: throw a `ConstraintError` that names the unlock
  command (per `rule.require.failfast`), never a silent skip and never a fallback to another
  source.
- **aws** — the `AWS_PROFILE` comes from keyrack, same as the ghlitch skills; the adapter reads
  the profile from the keyrack-populated env, never from a bare `~/.aws` file it locates itself.

## .the one seam

`process.env.X` is allowed **only** for a value keyrack itself placed there via unlock. the
forbidden case is a `process.env` read of a secret that entered the env by any other route (a
raw shell export, a ci variable set outside keyrack, a `.env` loaded by hand). if you cannot
point to the `.agent/keyrack.yml` entry a value came from, it is not a keyrack credential.

## .enforcement

- a hardcoded secret literal = **blocker**
- a committed file with a secret value (`.env`, config, json) = **blocker**
- a credential read from any source other than keyrack = **blocker**
- a silent fallback to a non-keyrack source when keyrack lacks the credential = **blocker**
- absence of a credential handled by any path other than a loud `ConstraintError` = **blocker**

## .see also

- `howto.keyrack.[lesson]` (mechanic) — the unlock motion + error table
- `rule.require.failfast` — the loud, named error an absent credential must throw
- `howto.provision-ses-email-infra` — the ses mailbox's `AWS_PROFILE` sourced via keyrack
