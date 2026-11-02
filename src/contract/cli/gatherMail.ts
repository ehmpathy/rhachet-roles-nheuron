import { BadRequestError } from 'helpful-errors';

import {
  isGatheredMailMechanism,
  VALID_MECHANISMS,
} from '@src/domain.objects/GatheredMailMechanism';
import { setGatheredMails } from '@src/domain.operations/gather/mail/setGatheredMails';

import { asCliArgOptions } from './asCliArgOptions';
import { getCliLogMethods } from './getCliLogMethods';
import { getExitCodeForError } from './getExitCodeForError';
import { getIsHelpAsked } from './getIsHelpAsked';
import {
  isGatherOutputFormat,
  VALID_OUTPUT_FORMATS,
} from './isGatherOutputFormat';

/**
 * .what = prints help message for gather.mail
 * .why = enables users to discover available options
 */
const printHelp = (): void => {
  console.log(
    `
gather.mail - collect mail from authenticated source

usage:
  gather.mail.sh [options]

options:
  --from <mechanism>   mail source: gmail, ses (required)
  --address <email>    email address to collect from (required)
  --since <date>       only list mail since this date (ISO format)
                       default: the prior run's cursor — so a bare re-run
                       collects, and lists, only what arrived since it.
                       pass --since explicitly to re-scan a wider window.
                       it narrows what you SEE on both mechanisms, but only
                       narrows what GMAIL fetches — see below.
  --query <query>      search query to filter mail (gmail only — ses refuses it)
  --format <format>    output format: tree, json (default: tree)
  -h, --help           show this help message

  what each mechanism can filter on:
    gmail   --since, --query (gmail search syntax), and an --address
            scoped as user@gmail.com/labels=work,urgent
    ses     --since only. ses mail is read from an s3 prefix of raw rfc822,
            which has no search index and no labels, so it REFUSES a --query
            or a /labels= scope rather than ignore one.

  what a scoped run costs:
    a --query or /labels= run is never served FROM the cache and never
    incremental — it re-fetches its whole range on every call, and lists
    only what it matched. what it fetched is still kept in the cache, so
    the "cached:" count may grow. a bare run is served from the cache and
    incremental. the output names which one you got, on its "scope:" line.

  what --since costs, per mechanism:
    gmail   pushed into the api query as an "after:" term, so the remote
            never sends the older mail — you pay for the window alone.
    ses     applied locally, AFTER the walk. s3 filters on key prefix only,
            so there is no date bound to push down: every object under the
            inbound prefix is listed, read, and parsed first. the walk is
            capped instead — past 200 pages it REFUSES rather than return
            a partial mailbox as a whole one.

examples:
  gather.mail.sh --from gmail --address user@gmail.com
  gather.mail.sh --from gmail --address user@gmail.com --since 2024-01-01
  gather.mail.sh --from gmail --address user@gmail.com --query "from:boss@company.com"
  gather.mail.sh --from gmail --address user@gmail.com/labels=work,urgent
  gather.mail.sh --from gmail --address user@gmail.com --format json
  gather.mail.sh --from ses --address jelly@one.nheuron.com --since 2026-08-01
`.trim(),
  );
};

/**
 * .what = parses cli args into this skill's options object
 * .why = the argv-to-pairs mechanism is shared (`asCliArgOptions`); WHICH flags this skill
 *   takes stays declared here, so the contract reads at the entrypoint that owns it
 */
const parseArgs = (
  argv: string[],
): {
  from: string | undefined;
  address: string | undefined;
  since: string | undefined;
  query: string | undefined;
  format: string | undefined;
} => {
  const options = asCliArgOptions({
    argv,
    // the option contract for gather.mail — a flag outside this set is a typo, and
    // asCliArgOptions refuses it loudly rather than let the run collect the whole
    // mailbox unfiltered at exit 0. `help` is here for defense; getIsHelpAsked
    // intercepts it before parseArgs, so it never reaches this validation.
    allowed: ['from', 'address', 'since', 'query', 'format', 'help'],
  });

  return {
    from: options.from,
    address: options.address,
    since: options.since,
    query: options.query,
    format: options.format,
  };
};

/**
 * .what = cli entrypoint for gather.mail skill
 * .why = enables shell invocation via package-level import
 *
 * @returns the exit code the caller should exit with — 0 ok, 2 caller-must-fix,
 *   1 unexpected (`rule.require.exit-code-semantics`).
 *
 * .note = it RETURNS the code rather than calls `process.exit` itself. this is an
 *   exported library entrypoint, so a `process.exit` here would kill the host process of
 *   any caller that imports it as a function — a hard, irreversible side effect invisible
 *   from the signature. the shell wrapper (`gather.mail.sh`) owns that decision, which is
 *   where a process's lifetime belongs.
 */
export const gatherMail = async (): Promise<number> => {
  // handle --help flag
  if (getIsHelpAsked({ argv: process.argv })) {
    printHelp();
    return 0;
  }

  try {
    // parse args — inside the try, so an unknown flag refuses via the exit-code path
    const options = parseArgs(process.argv);

    // guard: required args
    if (!options.from) {
      throw new BadRequestError('--from is required', {
        hint: 'run with --help for usage',
      });
    }

    if (!options.address) {
      throw new BadRequestError('--address is required', {
        hint: 'run with --help for usage',
      });
    }

    // guard: valid mechanism (type guard narrows type)
    if (!isGatheredMailMechanism(options.from)) {
      throw new BadRequestError(`invalid mechanism '${options.from}'`, {
        validMechanisms: VALID_MECHANISMS,
        hint: 'run with --help for usage',
      });
    }

    // guard: valid format (type guard narrows type)
    const format = options.format ?? 'tree';
    if (!isGatherOutputFormat(format)) {
      throw new BadRequestError(`invalid format '${format}'`, {
        validFormats: VALID_OUTPUT_FORMATS,
        hint: 'run with --help for usage',
      });
    }

    // invoke setGatheredMails (options.from is now narrowed to GatheredMailMechanism)
    await setGatheredMails(
      {
        mechanism: options.from,
        address: options.address,
        since: options.since ?? null,
        query: options.query ?? null,
        format,
      },
      {
        log: getCliLogMethods(
          { isVerbose: process.env.LOG_LEVEL === 'debug' },
          { setStderr: (content: string) => process.stderr.write(content) },
        ),
        setStdout: (content: string) => process.stdout.write(content),
        cwd: process.cwd(),
      },
    );
    return 0;
  } catch (error) {
    // failloud: report the error, then hand back the code it earns
    return getExitCodeForError(
      { error },
      { setStderr: (content) => console.error(content) },
    );
  }
};
