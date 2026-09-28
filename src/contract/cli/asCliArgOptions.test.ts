import { getError, given, then, when } from 'test-fns';

import { asCliArgOptions } from './asCliArgOptions';

/**
 * .what = clamps the two subtle parts of the argv parse: the eval-mode slice offset and the
 *   flag/value boundary
 * .why = this logic sat duplicated, byte-for-byte, in `gatherAuth` and `gatherMail`, with a
 *   unit test in neither. so a fix to one copy left the other wrong, silently — a mis-sliced
 *   argv does not error, it just drops the first flag. lifted to one module, it gets one
 *   suite that both callers inherit.
 */
describe('asCliArgOptions', () => {
  given(
    '[case1] argv from a shell wrapper (`node -e "…" -- --from gmail`)',
    () => {
      when('[t0] parsed', () => {
        then('the `--` separator is dropped and both flags are read', () => {
          const options = asCliArgOptions({
            argv: ['node', '--from', 'gmail', '--address', 'a@b.com'],
          });
          expect(options).toEqual({ from: 'gmail', address: 'a@b.com' });
        });
      });
    },
  );

  given(
    '[case2] argv from a normal entrypoint (`node cli.js --from ses`)',
    () => {
      when('[t0] parsed', () => {
        then('the entrypoint path is sliced off, never read as a flag', () => {
          const options = asCliArgOptions({
            argv: ['node', '/path/to/cli.js', '--from', 'ses'],
          });
          expect(options).toEqual({ from: 'ses' });
        });
      });
    },
  );

  given('[case3] a flag whose value is another flag', () => {
    when('[t0] parsed', () => {
      then(
        'the valueless flag is dropped, never given the next flag as its value',
        () => {
          const options = asCliArgOptions({
            argv: ['node', '--verbose', '--from', 'gmail'],
          });
          // `--verbose` takes no value, so it must NOT swallow `--from`
          expect(options).toEqual({ from: 'gmail' });
        },
      );
    });
  });

  given('[case4] a final flag with no value at all', () => {
    when('[t0] parsed', () => {
      then('it is dropped rather than mapped to undefined', () => {
        const options = asCliArgOptions({
          argv: ['node', '--from', 'ses', '--orphan'],
        });
        expect(options).toEqual({ from: 'ses' });
      });
    });
  });

  given('[case5] an argv with no flags', () => {
    when('[t0] parsed', () => {
      then('an empty record comes back, never a throw', () => {
        expect(asCliArgOptions({ argv: ['node'] })).toEqual({});
      });
    });
  });

  given('[case6] a caller that declares an allowed set', () => {
    when('[t0] every flag is in the set', () => {
      then('parses as usual', () => {
        const options = asCliArgOptions({
          argv: ['node', '--from', 'gmail', '--since', '2026-01-01'],
          allowed: ['from', 'since'],
        });
        expect(options).toEqual({ from: 'gmail', since: '2026-01-01' });
      });
    });

    when('[t1] a typo puts a flag OUTSIDE the set (with a value)', () => {
      then(
        'refuses loudly, states the unknown flag and the allowed set',
        async () => {
          // the real-world harm: `--qurey x` would otherwise parse into the record,
          // go unread, and the run would collect the WHOLE mailbox at exit 0
          const error = await getError(async () =>
            asCliArgOptions({
              argv: ['node', '--qurey', 'from:boss@co.com'],
              allowed: ['from', 'query'],
            }),
          );
          expect(error.message).toContain("unknown flag '--qurey'");
        },
      );
    });

    when('[t2] the unknown flag carries NO value (a valueless typo)', () => {
      then('still refuses — it is not silently dropped', async () => {
        // teeth: the pair extractor drops a valueless flag at the end, so a check on
        // the parsed record alone would MISS this. drop the `allowed` guard and this
        // case goes green (the record parse never sees the orphan) — that is the red.
        const error = await getError(async () =>
          asCliArgOptions({
            argv: ['node', '--from', 'gmail', '--verbsoe'],
            allowed: ['from'],
          }),
        );
        expect(error.message).toContain("unknown flag '--verbsoe'");
      });
    });

    when('[t3] no allowed set is passed', () => {
      then('the parse stays lenient, never a throw on an unknown flag', () => {
        // the shared mechanism path: cases 1-5 pass no allowed set and must not throw
        expect(asCliArgOptions({ argv: ['node', '--extra', 'goes'] })).toEqual({
          extra: 'goes',
        });
      });
    });
  });
});
