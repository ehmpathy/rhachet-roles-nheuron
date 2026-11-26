# F17 — an obfuscated mail's absent body reads as the obfuscation literal, not null

rework: clean · status: ruled: (a) revert (director) · confidence: 90%

## .the fork

`getMailDisplay.test.ts` once asserted that an obfuscated mail with a `null` body keeps `body: null`.
this behavior's 5.1 execution reversed it: the body now reads `MAIL_CONTENT_OBFUSCATED`, same as the
subject and the snippet.

- (a) keep `null` — the display passes through absence
- (b) replace it — every content field of an obfuscated mail reads one literal

## .taken: (b), why

- the gatherer contract: for a security-sensitive mail, only its existence shows, never its
  content (`role=gatherer` readme, `.security`)
- a `null` among three replaced fields tells a reader THIS mail differed from its peers. that is a
  partial disclosure, of the kind obfuscation exists to prevent
- the single source of obfuscation, `getMailContentVisible`, already replaces all three fields
  uniformly (`getMailContentVisible.test.ts`, "the replacement is uniform across all three"). the
  display carried a second copy that drifted from it; a 5.1 architecture review found the drift
- the test comment records the reversal and its reason at the assertion

## .rework, why clean

one branch in `getMailDisplay` and one assertion. no caller branches on `body === null` for an
obfuscated mail.

## .confidence, why not higher

`rule.forbid.test-intent-violations` asks for explicit approval of a reversed assertion. the reason
is recorded; the approval is the council's to give. peer r7 (5.3 i001) raised it on exactly that
ground.

## .where

- `src/domain.operations/gather/mail/transformers/getMailDisplay.ts`
- `src/domain.operations/gather/mail/transformers/getMailDisplay.test.ts` (the ⚠️ comment)

## .verdict

**ruled by the director (2026-11-02): revert — (a).** an obfuscated mail with no body reads
`null`; the prior assertion returns. preserve prior behavior unless the wish asked to change it,
and this wish did not.

applied at both seats of the one fact, since the adapters obfuscate at ingest through the single
source: `getMailContentVisible` keeps a `null` body as `null` (subject and snippet still
replaced), and `getMailDisplay.test.ts` asserts `preserves null body` again.
`getMailContentVisible.test.ts` [case3][t1] now asserts the same.
