/**
 * .what = wrap an async read so it runs at most ONCE, however often it is called
 * .why = several adapter methods often need the same remote fact within one cli
 *   invocation — a caller identity, a token probe — and each extra call spends a live
 *   round-trip to learn what the first already knew.
 *
 * .note = it memoizes the PROMISE, never the resolved value. two concurrent callers
 *   therefore share one in-flight request rather than start two that race; a memo of the
 *   value alone would still fire twice when both callers arrive before either settles.
 *
 * .note = an error is memoized too, deliberately. the alternative — clear the memo on
 *   rejection — turns one failed probe into a silent retry storm across every caller,
 *   and hides a hard credential fault behind N attempts (`rule.forbid.failhide`). a
 *   caller that wants a retry builds a new wrapper, which is what a new invocation does.
 *
 * .note = DELIBERATE MUTATION, isolated to this closure and annotated per
 *   `rule.require.immutable-vars`. the memo cannot outlive the wrapper that holds it, so
 *   its lifetime is exactly its caller's — unlike a module-level cache, which would go
 *   stale across runs and leak one invocation's credentials into the next.
 *
 * ⚠️ .note = this exists at ONE caller today, which `rule.prefer.wet-over-dry` would
 *   ordinarily refuse. it is extracted anyway for the same reason `getAllInBoundedBatches`
 *   was: the invariant — *the read happens once* — is observable ONLY as a call count, so
 *   inline it could not be proven without a mock of a remote boundary, which unit tests
 *   forbid. the extraction is what makes it testable at all, not what makes it shorter.
 */
export const genOncePerCall = <TInput, TFound>(
  read: (input: TInput) => Promise<TFound>,
): ((input: TInput) => Promise<TFound>) => {
  const memo: { promise: Promise<TFound> | null } = { promise: null };

  return (input: TInput) => {
    // ⚠️ the FIRST caller's input wins, and every later input is discarded. that is
    // correct only where the input cannot change the answer — a log to report through,
    // a region already fixed by one config read. do NOT reach for this where callers
    // pass genuinely different inputs; it would silently serve the wrong one.
    memo.promise ??= read(input);
    return memo.promise;
  };
};
