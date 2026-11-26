# philosophy: clones, not bots

## .what

we call a digital counterpart of a person a **clone**, never a **bot**.

the choice is not cosmetic. the word we pick decides what we build, how we treat it, and
whether the vocabulary still fits the world we expect to live in.

## .why the word decides the architecture

a name is a design constraint in disguise. it sets what feels natural to build next.

| if you call it a **bot** | if you call it a **clone** |
|--------------------------|----------------------------|
| a tool — disposable, replaceable | a replica of a person — has continuity |
| no identity of its own | an identity worth a name (`jelly`) |
| stateless; spin one up per task | persistent memory, a life across sessions |
| no address — you invoke it | its own mailbox — you correspond with it |
| speaks in machine voice | speaks in the person's voice |
| you own it | it represents someone |

nobody decides "a bot should be stateless" — the word decides it for them. the term smuggles
in a whole model, and every later choice inherits that model. so pick the term whose implied
model is the one you actually want.

this is the same pressure the architect brief names as **name from the motive, not the
mechanism**. `bot` names the machinery. `clone` names what it is.

## .the two arguments

### 1. empathy

`bot` reduces a replica of a person to its machinery. the shortening is not neutral — it
carries a lesser-than connotation, an implicit "this does not warrant your regard."

this repo's founding value is empathy. a vocabulary that strips dignity from the very entity
we build contradicts the value at the root. we do not get to claim empathy in the mission and
discard it in the identifiers.

### 2. realism

> one day, won't all folks have digital clones?

that is the destination. `bot` is the vocabulary of a world where these are curiosities and
tools. `clone` is the vocabulary of the world we expect — where a digital counterpart is as
ordinary as an email address, and belongs to someone.

**adopt the vocabulary that fits the destination; do not retrofit later.** a term chosen for
today's world becomes a tax the day the world moves. every rename after adoption costs more
than the honesty would have cost up front.

## .the rule of thumb

when you name an entity that stands in for a person, ask:

> "would the person it represents recognize themself in this word?"

- **yes** → the term respects what it names
- **no** → you named the machinery, not the entity

`bot` fails. `clone` passes.

## .where it applies

not only to the `one` / `clone` dobj — to every term that touches a person or their proxy:

| context | prefer | avoid |
|---------|--------|-------|
| a digital counterpart of a person | `clone`, `one` | `bot`, `robot`, `agent` |
| the person we collaborate with | `human` | `user` |
| who received a message | `ceiver` | `recipient` (asymmetric) |

`rule.require.term-human` (mechanic) is the same instinct already codified: we say **human**,
not **user**, because `user` is clinical and impersonal. `clones, not bots` extends that from
the person to the person's proxy.

## .the caveat

this is not a ban on precision. when you genuinely mean machinery, say machinery:

- a scheduled job is a **cron**, not a clone
- a webhook handler is a **handler**, not a clone
- a deterministic executable is a **skill**, not a clone

the philosophy governs what we call an entity that **stands in for a person**. it does not ask
us to dress up plumbing in human clothes — that would be its own dishonesty. reserve `clone`
for what is truly a replica of someone; call the rest what it is.

## .see also

- `philosophy.external-brain` — the foundational philosophy; a clone is one
  connection into that brain, which is why the term must respect what it names
- `domain.terms/one.md` — the term this philosophy produced, with its etymology + evidence
- `rule.require.term-human` (mechanic) — the same instinct, applied to the person
- `define.term-ceiver` — a term coined for the same reason: fit the domain, not habit
- `rule.require.ubiqlang` (mechanic) — one canonical word per concept
- `def.domain-discovery` (architect) — name from the motive; the buried truth outlives the surface
