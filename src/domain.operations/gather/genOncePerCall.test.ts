import { given, then, when } from 'test-fns';

import { genOncePerCall } from './genOncePerCall';

/**
 * .what = a read that counts how many times it was actually invoked
 * .why = the whole invariant here is a CALL COUNT, so the probe must expose one
 */
const getCountedRead = <T>(input: { returns: T; delayMs?: number }) => {
  const state: { calls: number } = { calls: 0 };

  const read = async (): Promise<T> => {
    state.calls += 1;
    if (input.delayMs)
      await new Promise((done) => setTimeout(done, input.delayMs));
    return input.returns;
  };

  return { read, state };
};

describe('genOncePerCall', () => {
  given('[case1] a wrapped read, called many times in sequence', () => {
    when('[t0] it is awaited three times', () => {
      then('the wrapped read runs exactly ONCE', async () => {
        const { read, state } = getCountedRead({ returns: 'identity' });
        const readOnce = genOncePerCall(read);

        await readOnce({});
        await readOnce({});
        await readOnce({});

        expect(state.calls).toEqual(1);
      });

      then('every call yields the same value', async () => {
        const { read } = getCountedRead({ returns: 'identity' });
        const readOnce = genOncePerCall(read);

        expect([
          await readOnce({}),
          await readOnce({}),
          await readOnce({}),
        ]).toEqual(['identity', 'identity', 'identity']);
      });
    });
  });

  given('[case2] a wrapped read, called concurrently before it settles', () => {
    when('[t0] three callers arrive while the first is in flight', () => {
      then(
        'the read still runs ONCE — the promise is memoized, not the value',
        async () => {
          const { read, state } = getCountedRead({
            returns: 'identity',
            delayMs: 20,
          });
          const readOnce = genOncePerCall(read);

          // all three start BEFORE any awaits, so a value-memo would fire three reads
          await Promise.all([readOnce({}), readOnce({}), readOnce({})]);

          expect(state.calls).toEqual(1);
        },
      );
    });
  });

  given('[case3] a wrapped read that rejects', () => {
    when('[t0] it is called twice', () => {
      then('the failure is memoized too — no silent retry storm', async () => {
        const state: { calls: number } = { calls: 0 };
        const readOnce = genOncePerCall(async () => {
          state.calls += 1;
          throw new Error('credentials rejected');
        });

        await expect(readOnce({})).rejects.toThrow('credentials rejected');
        await expect(readOnce({})).rejects.toThrow('credentials rejected');

        expect(state.calls).toEqual(1);
      });
    });
  });

  given('[case4] two separate wrappers over the same read', () => {
    when('[t0] each is called once', () => {
      then(
        'they do NOT share a memo — the lifetime is the wrapper, never global',
        async () => {
          const { read, state } = getCountedRead({ returns: 'identity' });

          await genOncePerCall(read)({});
          await genOncePerCall(read)({});

          // ⚠️ this is the clamp against a module-level cache: one invocation's
          // credentials must never leak into the next
          expect(state.calls).toEqual(2);
        },
      );
    });
  });
});
