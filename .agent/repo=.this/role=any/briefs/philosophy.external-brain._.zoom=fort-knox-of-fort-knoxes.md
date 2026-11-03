# philosophy: the external brain — zoom: a fort knox made of fort knoxes

> a zoom-in on `philosophy.external-brain`. the parent states *what* an external brain is;
> this one zooms on the **lockdown** — why isolation is the most important property of the
> substrate, and why it must nest.

## .the stakes are categorically different

an external brain is not a database with sensitive rows. it is **a copy of a person's
cognition** — their mail, their patterns, their half-formed thoughts, their reach.

so a breach is not "some records leaked." a breach is *someone has a copy of your mind.*

| a normal system leaks | an external brain leaks |
|-----------------------|-------------------------|
| records about people | the person themself |
| what you did | how you think |
| recoverable by rotation | unrotatable — you cannot rotate a memory |
| bounded by the table | unbounded — it collects from everywhere by design |

the parent philosophy's own goal makes this worse, not better: **maximum bandwidth** means the
brain deliberately holds more, from more sources, more continuously. every increment of
bandwidth is an increment of blast radius. the two pull against each other, and lockdown is
what lets bandwidth rise without the risk that rises with it.

so: **the lockdown is the most important part.** not a feature of the substrate — the
precondition for it to deserve your cognition at all.

## .fort knox is not enough — it must nest

a single hardened perimeter fails the way all single perimeters fail: once inside, the
attacker has it all. one vault means one breach ends the story.

so the design is **a fort knox made up of fort knoxes**. each vault is itself a vault of
vaults. isolation recurses, so a breach at any depth is bounded by the walls beneath it.

```
the org            ← its own aws organization; a blast wall around all of it
 └── the account   ← its own aws account per env; a breach in prep cannot reach prod
      └── the domain   ← a dedicated subdomain; the apex and its other mail stay untouched
           └── the mailbox  ← one named address, not a catch-all; reads only its own mail
                └── the grant   ← least-privilege iam; read that prefix, send as that domain
                     └── the content  ← secrets obfuscated even inside the vault
```

each layer is a boundary an attacker must defeat **independently**. compromise the mailbox and
you still lack the account. compromise the account and you still lack the org. no single
failure is total, because no single wall is the only wall.

## .this is why the choices look paranoid

read every isolation decision in this repo as a wall in that nest — not caution for its own
sake:

| the choice | the wall it builds |
|------------|--------------------|
| a **separate aws org + account triplet** for nheuron | the brain's infra shares no blast radius with any other project |
| **prod / prep** split, mail lands in prep | a compromise of the demonstration cannot reach real cognition |
| a **dedicated subdomain**, never the apex | the apex mx and its other mail stay out of reach |
| **one named mailbox**, not a domain catch-all | reads exactly its own mail, never the domain's |
| **least-privilege inline grant** (read one prefix, send as one domain) | a stolen credential still cannot roam |
| **keyrack-only credentials**, never a literal or a committed `.env` | one place to rotate, one place to audit, none to leak |
| the gatherer's **security obfuscation** (mfa codes, resets, tokens) | even a legitimate read of the vault does not surface the crown jewels |

the last row is the pattern's own proof: the gatherer already shows only the *existence* of a
security-sensitive mail, never its content. that is a fort knox **inside** the mailbox — the
innermost vault, built before this philosophy was written down.

## .it must be yours, or it is not a vault

`._.zoom=wetware-bandwidth` names the Accelerando caution: continuity that deep makes the
substrate carry real weight. lockdown is the other half of that same claim.

a vault someone else holds the key to is not your vault. so the substrate is plain files, open
roles, and infra you own outright — portable, inspectable, forkable. an external brain rented
from a party who can read it, subpoena it, train on it, or revoke it has failed the lockdown
test no matter how strong its walls look from outside.

## .how to apply it

when you add a component that touches the brain, ask:

1. **what is the blast radius if this is compromised?** if the answer reaches past one vault,
   add a wall.
2. **does this widen an extant boundary, or add a new one?** prefer a new nested vault to a
   larger single one.
3. **is the easy path the isolated path?** if isolation takes extra effort, it will erode —
   make the safe arrangement the default (`rule.require.safe-by-default`).

the anti-pattern to refuse: convenience that dissolves a wall. a shared account "just for now",
a catch-all "so we do not miss mail", a broad grant "to unblock the test". each trades a
permanent wall for a temporary ease, and the trade is never worth it here.

## .the caveat

nested vaults cost real friction: more accounts, more credentials, more apply steps. that cost
is accepted **for the brain**, not adopted as a house style for all software. the justification
is the stakes at the top of this brief — a copy of a person's cognition. where those stakes are
absent, this much nest is over-built.

## .see also

- `philosophy.external-brain` — the parent: what an external brain is
- `philosophy.external-brain._.zoom=wetware-bandwidth` — the seam this lockdown protects; the
  bandwidth it must not become an excuse to narrow
- `rule.require.credentials-from-keyrack` — the credential wall, in rule form
- `rule.require.safe-by-default` (ergonomist) — the easy path must be the isolated path
