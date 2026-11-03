import { given, then, when } from 'test-fns';

import { asCacheSafeExid } from './asCacheSafeExid';

describe('asCacheSafeExid', () => {
  given('[case1] a gmail exid, which carries no separator', () => {
    when('[t0] it is encoded', () => {
      then('it passes through unchanged', () => {
        // gmail exids are already filename-safe, so the encode must be a no-op for
        // them — otherwise every prior gmail cache file would be orphaned by a rename
        expect(asCacheSafeExid({ exid: '18c4f2a9b3d1e7f0' })).toBe(
          '18c4f2a9b3d1e7f0',
        );
      });
    });
  });

  given('[case2] a ses exid, which is an s3 key', () => {
    when('[t0] it is encoded', () => {
      then('the path separator is gone', () => {
        const encoded = asCacheSafeExid({
          exid: 'inbound/n2q8k4vd1p7r3m6s9t0u',
        });
        expect(encoded).not.toContain('/');
        expect(encoded).toBe('inbound%2Fn2q8k4vd1p7r3m6s9t0u');
      });
    });
  });

  given('[case3] two exids that a lossy swap would collide', () => {
    // teeth: this is the claim the encode is CHOSEN for. a `replace('/', '_')` maps
    // both of these to `a_b`, so one mail would overwrite the other in the cache with
    // no error at all. the encode must be injective, and this is what says so.
    const encodedA = asCacheSafeExid({ exid: 'a/b' });
    const encodedB = asCacheSafeExid({ exid: 'a_b' });

    when('[t0] both are encoded', () => {
      then('they stay distinct', () => {
        expect(encodedA).not.toBe(encodedB);
      });

      then('neither holds a separator', () => {
        expect(encodedA).not.toContain('/');
        expect(encodedB).not.toContain('/');
      });
    });
  });

  given('[case4] characters a filesystem reserves', () => {
    const encoded = asCacheSafeExid({ exid: 'a:b?c*d"e<f>g|h/i' });

    when('[t0] each is encoded', () => {
      then('every separator and windows-reserved char is gone, bar one', () => {
        // `encodeURIComponent` leaves the unreserved marks `!'()*-._~` alone, so `*`
        // is the ONE windows-reserved character that survives. asserted here rather
        // than papered over: an aspirational assertion would have read as a guarantee
        // this function does not make.
        expect(encoded).not.toMatch(/[:?"<>|/]/);
      });

      then('`*` survives, and that is harmless here', () => {
        // no mechanism produces it — a ses exid is an s3 key over an alphanumeric
        // message id, a gmail exid is hex — and the reader matches filenames with
        // `startsWith`/`endsWith` on a flat `readdir`, never with a glob. so `*` is
        // out of reach of both the producer and the consumer.
        expect(encoded).toContain('*');
      });
    });
  });
});
