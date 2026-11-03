# one

## .what

**one** = a clone. one neuron connection into the external brain.

a `one` is a single digital clone of a person — and the one link that connects that person to
the rest of the external brain. the word is the domain's own contraction of **clone**.

shape: `[noun]` — a domain object (dobj). plural `ones`.

## .etymology

| step | derivation |
|------|------------|
| `clone` | the established term — a digital replica of a person |
| drop `cl` | `~~cl~~one` |
| `one` | what remains — and it already denotes *a single unit* |

the contraction is not arbitrary: the residue carries its own truth. **one** clone. **one**
neuron. **one** connection. the word says what it is twice over.

| sense | how it reads |
|-------|--------------|
| clone | a `one` IS a clone — the term is the contraction |
| one neuron | a single synapse in `nheuron` |
| one connection | the single link into the rest of the external brain |

so `jelly@one.nheuron.com` reads: *jelly, a clone, one connection into the external brain.*

## .why clone, not bot

> the full argument lives in `philosophy.clones-not-bots`. summarized here because
> it is the reason this term exists at all.

the term we rejected matters as much as the one we kept.

| term | verdict | why |
|------|---------|-----|
| **clone** / **one** | adopted | empathetic and realistic — names a replica of a person |
| `bot` | rejected | names a mechanism; carries a mechanical, lesser-than connotation |
| `robot` | rejected | same as `bot`, longer |
| `agent` | rejected | overloaded — an agent is a role a clone can hold, not what it is |

two reasons, and the second is the decisive one:

1. **empathy** — `bot` reduces a clone to its machinery. a clone is a replica of a *person*,
   and the vocabulary should carry that respect rather than strip it.
2. **realism** — one day most folks will have a digital clone. that is the world the term must
   fit. `bot` is the word of a world where these are tools; `clone` is the word of the world we
   expect. adopt the vocabulary that fits the destination, do not retrofit later.

> a term that names the surface decays with it; a term that names the buried truth outlives
> every rewrite. `bot` names the mechanism. `clone` names what it is.

## .evidence

**domain-expert narrative** — the wisher, on why `clone` beats `bot`:

> "feels like clone is more empathetic and realistic than bot"
>
> "after all, one day, won't all folks have digital clones?"

and on what `one` denotes:

> "clone → one" · "it's one nheuron connection" · "that connects you to the rest of the
> external brain"

**precedent** — `clone` is already the established dobj across the ehmpathy ecosystem; the
canonical verb brief uses it as its worked example (`genClone({ zone, address, config })`,
`setClone({ zone, role, brain, index })`, `getAllClonesForZone({ zone })`,
`getOneCloneSlug({ role, index })`). `one` is a contraction of an extant term, not a new
concept — so it adds no synonym at the dobj layer.

**first use** — the `one.nheuron.com` mail subdomain, whose mailbox `jelly@one.nheuron.com` is
the demonstration of the ses gatherer behavior. see
`.behavior/v2026_07_30.collect-from-ses/1.vision.yield.md`.

## .usage

```
one.nheuron.com          # the subdomain where ones are reachable
jelly@one.nheuron.com    # jelly, a one, at nheuron
```

the subdomain label names the **kind of entity** whose mailboxes live there — the same move
declastruct-aws made with `demo.ehmpathy.com` (purpose, not mechanism).

## .invariants

- `one` and `clone` name the SAME concept — never treat them as two concepts
- prefer `clone` in prose and code identifiers (it is unambiguous); reserve `one` for where
  brevity earns its keep, such as a dns label or an address
- never use `bot`, `robot`, or `agent` as a synonym for a clone
- `one` is never a numeral in this domain — a count is a `count`, an index is an `index`

## .the caveat

outside nheuron, `one` reads as a numeral first. `jelly@one.nheuron.com` may parse as
"instance #1" to a stranger. we accept that cost: ubiqlang holds that the domain's own word
wins over a generic outsider label, and this brief is what keeps the term documented rather
than folklore.

## .see also

- `philosophy.external-brain` — what a `one` connects you TO
- `philosophy.clones-not-bots` — the worldview that produced this term
- `define.term-ceiver` — the peer coined term (sender / ceiver)
- `rule.require.ubiqlang` (mechanic) — one canonical word per concept
- `rule.require.persist-domain-term-evidence` (architect) — why this file exists
- `rule.forbid.ambiguous-labels` (ergonomist) — the numeral-read caveat above
- `.behavior/v2026_07_30.collect-from-ses/1.vision.yield.md` — the first use
