import { given, then, useBeforeAll, when } from 'test-fns';

import { getAllInBoundedBatches } from './getAllInBoundedBatches';

/**
 * .what = a reader that records the deepest concurrency it ever saw
 * .why = the bound changes WHEN reads happen, never how many — so a call count proves
 *   approximately none of it. in-flight DEPTH is the only place the bound is observable,
 *   and an in-memory reader can measure it exactly, with no fs and no sdk to stand in for.
 *
 * .note = each read yields to the macrotask queue before it settles. without that yield
 *   every read would finish before the next began and the peak would read 1 whether the walk
 *   were bounded or not — a probe that passes under the defect, which is no probe at all
 *   (`rule.require.clamp-edge-cases`).
 */
const getDepthProbe = (): {
  read: (item: number) => Promise<number>;
  peak: () => number;
  total: () => number;
} => {
  const state = { now: 0, peak: 0, total: 0 };

  return {
    read: async (item: number) => {
      state.now += 1;
      state.total += 1;
      state.peak = Math.max(state.peak, state.now);

      // yield, so concurrent reads genuinely overlap in flight
      await new Promise((done) => setTimeout(done, 0));

      state.now -= 1;
      return item * 2;
    },
    peak: () => state.peak,
    total: () => state.total,
  };
};

/**
 * .what = clamps the concurrency bound both callers of this walk rely on
 * .why = ⚠️ the ses body read and the cache body read each walk a set that GROWS FOREVER —
 *   the s3 inbound prefix and the local mail cache. an unbounded `Promise.all` over either
 *   opens one connection or one file descriptor per mail the mailbox has EVER held, and the
 *   fault is load-dependent, so it surfaces only once a mailbox is busy
 *   (`rule.forbid.behavior-hazards`).
 *
 *   the discipline is pinned HERE rather than in each caller because a bound is only
 *   observable as in-flight depth, and depth cannot be measured through a real `fs` or a
 *   real s3 without a monkeypatch that lies (an earlier probe of exactly that shape measured
 *   a peak of 0 — it proved the patch, never the code).
 */
describe('getAllInBoundedBatches', () => {
  given('[case1] 100 items and a bound of 16', () => {
    const scene = useBeforeAll(async () => {
      const probe = getDepthProbe();
      const found = await getAllInBoundedBatches({
        queued: Array.from({ length: 100 }, (_unused, index) => index),
        bound: 16,
        read: probe.read,
      });
      return { found, peak: probe.peak(), total: probe.total() };
    });

    when('[t0] the walk runs', () => {
      then('at most 16 reads are ever in flight at once', () => {
        // ⚠️ the teeth. swap the walk back to a bare `Promise.all` and this peaks at 100
        expect(scene.peak).toBeLessThanOrEqual(16);
      });

      then(
        'more than one read IS in flight — the bound is not a serial loop',
        () => {
          // the other way to fail: a bound honored as 1 passes the check above and makes every
          // caller pay N sequential waits. the bound is a max, never a schedule
          expect(scene.peak).toBeGreaterThan(1);
        },
      );

      then(
        'every item is read exactly once — the bound costs no completeness',
        () => {
          // a bound that dropped or double-read items would be a worse defect than the one it
          // fixes. this is the half that makes the pair one claim rather than two
          expect(scene.total).toEqual(100);
          expect(scene.found).toHaveLength(100);
        },
      );

      then('the output order matches the input order', () => {
        // ⚠️ load-bearing. `getSortedMails` leans on a stable order for its tie-break, and
        // batch concatenation is the only reason order survives a concurrent read
        expect(scene.found.slice(0, 5)).toEqual([0, 2, 4, 6, 8]);
        expect(scene.found[99]).toEqual(198);
      });
    });
  });

  given('[case2] fewer items than the bound', () => {
    const scene = useBeforeAll(async () => {
      const probe = getDepthProbe();
      const found = await getAllInBoundedBatches({
        queued: [1, 2, 3],
        bound: 16,
        read: probe.read,
      });
      return { found, peak: probe.peak() };
    });

    when('[t0] the walk runs', () => {
      then('all three run together — a small set pays no batch cost', () => {
        expect(scene.peak).toEqual(3);
      });

      then('every item still comes back', () => {
        expect(scene.found).toEqual([2, 4, 6]);
      });
    });
  });

  given('[case3] an empty queue', () => {
    const scene = useBeforeAll(async () => {
      const probe = getDepthProbe();
      const found = await getAllInBoundedBatches({
        queued: [] as number[],
        bound: 16,
        read: probe.read,
      });
      return { found, total: probe.total() };
    });

    when('[t0] the walk runs', () => {
      then('it returns empty rather than throw', () => {
        // an empty cache is the FIRST-RUN state, not an error — every caller meets it once
        expect(scene.found).toEqual([]);
      });

      then('not one read is attempted', () => {
        expect(scene.total).toEqual(0);
      });
    });
  });
});
