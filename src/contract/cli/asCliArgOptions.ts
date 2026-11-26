/**
 * .what = detects if node was invoked via `node -e "code"` (eval mode)
 * .why = in eval mode, argv has no entrypoint path: [node, firstArg, ...]
 *        in normal mode, argv has entrypoint path: [node, file.js, firstArg, ...]
 *        we skip different counts when we slice argv
 */
import { BadRequestError } from 'helpful-errors';

const isNodeEvalMode = (argv: string[]): boolean => {
  const secondArg = argv[1];
  if (!secondArg) return false;
  const looksLikeEntrypointPath =
    /\.(js|ts|mjs|cjs)$/.test(secondArg) || !secondArg.startsWith('--');
  return !looksLikeEntrypointPath;
};

/**
 * .what = the flags rhachet itself appends when `rhx <skill>` invokes a skill
 * .why = they route the call to the skill and are no part of any skill's own contract
 */
const RHACHET_PASSTHROUGH_FLAGS = new Set(['--repo', '--role', '--skill']);

/**
 * .what = drop each rhachet passthrough flag, and its value, from the args
 * .why = `rhx gather.mail --from ses` reaches the skill as `--skill gather.mail --from ses`;
 *   a strict allowlist that sees `--skill` refuses every rhx call. peer skills drop the same
 *   three flags in their own parse
 */
const getArgsWithoutPassthrough = (input: { args: string[] }): string[] =>
  input.args.filter((arg, index) => {
    if (RHACHET_PASSTHROUGH_FLAGS.has(arg)) return false;
    const argPrior = input.args[index - 1];
    return !(argPrior && RHACHET_PASSTHROUGH_FLAGS.has(argPrior));
  });

/**
 * .what = extract key-value pairs from args array
 * .why = immutable transformer for arg parse
 */
const getAllArgPairs = (input: {
  args: string[];
}): Array<{ key: string; value: string }> => {
  return input.args.reduce<Array<{ key: string; value: string }>>(
    (acc, arg, index) => {
      if (!arg?.startsWith('--')) return acc;

      const key = arg.slice(2);
      const value = input.args[index + 1];

      // skip if no value or value is another flag
      if (!value || value.startsWith('--')) return acc;

      return [...acc, { key, value }];
    },
    [],
  );
};

/**
 * .what = cast a raw `process.argv` into the `--flag value` options it carries
 * .why = every skill entrypoint under `contract/cli` parses argv the same way, and the two
 *   subtle parts — the eval-mode slice offset and the flag/value boundary — are exactly the
 *   parts that must not drift. `gatherAuth` and `gatherMail` each held a byte-identical copy,
 *   so a fix to either left the other wrong (`rule.prefer.most-common-denominator`: lifted to
 *   the common ancestor of its two callers, `contract/cli`).
 *
 * .note = it returns the raw record rather than a per-skill shape. each entrypoint still
 *   declares its OWN option contract inline by which keys it reads, so the shared piece is
 *   the mechanism (how argv becomes pairs) and never the contract (which flags a skill takes)
 *   — the contract stays local, where `rule.forbid.io-as-interfaces` wants it.
 *
 * .note = `allowed` is the per-skill contract, passed IN by the entrypoint that owns it. when
 *   present, any flag not in the set throws a `BadRequestError` that names it. an unknown flag
 *   would otherwise parse into the record, go unread, and the run would proceed at exit 0 — so
 *   `gather.mail --qurey x` returns the WHOLE mailbox, a success that lies about what it
 *   filtered (`rule.forbid.failhide`, `rule.require.failfast`). when `allowed` is absent, the
 *   parse stays lenient — the shared mechanism tests exercise that path alone.
 */
export const asCliArgOptions = (input: {
  argv: string[];
  allowed?: string[];
}): Record<string, string> => {
  const skipCount = isNodeEvalMode(input.argv) ? 1 : 2;
  const args = getArgsWithoutPassthrough({
    args: input.argv.slice(skipCount).filter((arg) => arg !== '--'),
  });

  // refuse an unknown flag LOUDLY when the caller declares its allowed set.
  // this catches a typo'd flag whether or not it carried a value, so a valueless
  // `--qurey` cannot slip past the pair extractor below and vanish.
  if (input.allowed) {
    const allowed = new Set(input.allowed);
    const unknown = args
      .filter((arg) => arg.startsWith('--') && arg.length > 2)
      .map((arg) => arg.slice(2))
      .find((key) => !allowed.has(key));
    if (unknown !== undefined)
      throw new BadRequestError(`unknown flag '--${unknown}'`, {
        allowedFlags: input.allowed.map((key) => `--${key}`),
        hint: 'run with --help for usage; a typo returns no error otherwise',
      });
  }

  // extract pairs via immutable reduce
  const pairs = getAllArgPairs({ args });

  // build options object via reduce (immutable)
  return pairs.reduce<Record<string, string>>(
    (acc, pair) => ({ ...acc, [pair.key]: pair.value }),
    {},
  );
};
