# F16 — the error header named two classes: `✋ ConstraintError: BadRequestError: …`

| field | value |
|---|---|
| rework | clean |
| status | taken: (b), fixed in 5.3 |
| confidence | 90% |
| where | `src/contract/cli/asErrorHeaderDetail.ts`, `src/contract/cli/getExitCodeForError.ts`, the stderr entries of both acceptance snapshots |

## .the fork

5.3 has-ergonomics-validated scored the captured stderr against `def.ergonomic`. every refusal
opened `✋ ConstraintError: BadRequestError: <what>`. `rule.require.qualified-error-headers`
wants `✋ ConstraintError: <what>`; the inner class is a second label a human must skip.

- **(a) keep it** — `helpful-errors` 1.5.3 has no `ConstraintError` and writes the thrown
  class into `.message`. ratified by the i003 peers that raised the header blocker
- **(b) cut the inner class in the cli** — `asErrorHeaderDetail` drops a
  `${constructor.name}: ` prefix from the message, only where the message opens with it
- **(c) upgrade `helpful-errors` to 1.7.6 and throw `ConstraintError` / `MalfunctionError`
  natively** — the cause-level fix; rewrites every throw site

## .taken: (b), why

(b) lands in the diff this stone owns: one transformer, one call site, a mechanical rewrite of
the stderr snapshot entries. it degrades safe: a message without the prefix comes back whole,
so a library change leaves today's header, never a broken one. (c) stays the cleaner end state
and is caught as dream `v2026_11_02.gather.upgrade-helpful-errors-for-native-headers`.

## .rework, why clean

no caller parses the stderr text, and exit codes are unchanged. a reversal is the inverse
`sedreplace` and one deleted transformer.

## .confidence, why 90%

clamped at three grains: `asErrorHeaderDetail.test.ts` (5 cases; its first run caught that
helpful-errors leaves `.name` at `'Error'`, so the class is read from the constructor),
`getExitCodeForError.test.ts`, and the built artifact via `rhx`. the residual 10% is the
acceptance stderr rewrite, which ci proves on the next push.

## .verdict

taken in 5.3; open to the council for a reversal.
