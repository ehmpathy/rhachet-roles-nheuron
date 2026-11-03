/**
 * .what = read every queued item through `read`, at most `bound` in flight at once
 * .why = three walks need this same discipline: the ses body read (`getAllMailFromSes`), the
 *   cache body read (`getAllCachedMails`), and the gmail batch walk (`getAllMailFromGmail`,
 *   bound 1 for its rate limit). the hazard the first two
 *   guard is identical in shape — a bare `Promise.all` over a set that GROWS FOREVER, which
 *   opens one connection or one file descriptor per item and fails only once a mailbox is
 *   busy, the worst moment to find it (`rule.forbid.behavior-hazards`).
 *
 *   they are not two similar loops; they are one loop over two resources. so the extraction
 *   is what `rule.prefer.wet-over-dry` asks for rather than what it warns against — and it
 *   buys a property a second copy could never buy: the bound becomes **testable in one
 *   place**, with a plain in-memory reader, instead of through a monkeypatch of `fs` or the
 *   aws sdk in each caller.
 *
 * .note = ORDER IS PRESERVED. batches are taken in queue order and concatenated in order, so
 *   a caller may rely on the output order to match the input's. `getSortedMails` downstream
 *   leans on exactly that for a stable tie-break.
 *
 * .note = the accumulator stays immutable (`rule.require.immutable-vars`), which is why this
 *   recurses rather than pushes.
 */
export const getAllInBoundedBatches = async <TQueued, TFound>(input: {
  queued: TQueued[];
  bound: number;
  read: (item: TQueued) => Promise<TFound>;
}): Promise<TFound[]> => {
  const walkFrom = async (input2: {
    queued: TQueued[];
    found: TFound[];
  }): Promise<TFound[]> => {
    if (input2.queued.length === 0) return input2.found;

    const batch = input2.queued.slice(0, input.bound);
    const rest = input2.queued.slice(input.bound);

    const read = await Promise.all(batch.map(input.read));

    return walkFrom({ queued: rest, found: [...input2.found, ...read] });
  };

  return walkFrom({ queued: input.queued, found: [] });
};
