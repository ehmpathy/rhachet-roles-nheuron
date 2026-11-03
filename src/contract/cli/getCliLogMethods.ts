import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

/**
 * .what = the log methods a skill entrypoint hands to its operations
 * .why = stdout is the product of a skill: the tree, or a json document a caller parses.
 *   `console` writes `debug` and `info` to stdout, so a log line lands inside that product
 *   and a `--format json` run no longer parses. every level goes to stderr instead; warn and
 *   error always, debug and info only when asked for, so a bare run shows its output alone
 */
export const getCliLogMethods = (
  input: { isVerbose: boolean },
  context: { setStderr: (content: string) => void },
): GatherLogMethods => {
  // one line per entry, metadata as json, so a log reads the same at every level
  const asLogLine =
    (level: string) =>
    (message: string, metadata?: Record<string, unknown>): void =>
      context.setStderr(
        `${level}: ${message}${metadata ? ` ${JSON.stringify(metadata)}` : ''}\n`,
      );

  // quiet levels write naught unless verbose was asked for
  const noop = (): void => undefined;

  return {
    debug: input.isVerbose ? asLogLine('debug') : noop,
    info: input.isVerbose ? asLogLine('info') : noop,
    warn: asLogLine('warn'),
    error: asLogLine('error'),
  };
};
