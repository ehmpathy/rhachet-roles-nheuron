import { BadRequestError } from 'helpful-errors';

import {
  isGatheredMailMechanism,
  VALID_MECHANISMS,
} from '@src/domain.objects/GatheredMailMechanism';
import { setGatherAuth } from '@src/domain.operations/gather/auth/setGatherAuth';

import { asCliArgOptions } from './asCliArgOptions';
import { getExitCodeForError } from './getExitCodeForError';
import { getIsHelpAsked } from './getIsHelpAsked';

/**
 * .what = prints help message for gather.auth
 * .why = enables users to discover available options
 *
 * ⚠️ .note = the help must advertise ONLY paths that work. it once led with
 *   `--from gmail   # start oauth flow`, and that command throws 'oauth flow not yet
 *   implemented' — so the first example in the help was a hard stop. help that sends a
 *   human at a broken path is worse than help that omits the path
 *   (`rule.require.errors-name-the-fix`, `rule.forbid.surprises`).
 */
const printHelp = (): void => {
  console.log(
    `
gather.auth - report auth status for mail collection

usage:
  gather.auth.sh --from <mechanism> [--address <email>]

options:
  --from <mechanism>   mail source: gmail, ses (required)
  --address <email>    email address to check status for (optional)
  --help               show this help message

examples:
  gather.auth.sh --from gmail --address user@gmail.com  # check auth status
  gather.auth.sh --from ses --address you@your.domain   # check the AWS_PROFILE identity

how each mechanism authenticates:
  gmail  a service account from keyrack (GMAIL_SERVICE_ACCOUNT_JSON + _SUBJECT), or a
         cached oauth token. either way, credentials come from keyrack:
           rhx keyrack unlock --owner ehmpath --env test
  ses    plain iam — the AWS_PROFILE keyrack places in the env. no token, no expiry:
           rhx keyrack unlock --owner ehmpath --env prep

note:
  NEITHER mechanism has an interactive auth flow today. \`--from ses\` has none by design
  (iam needs no grant); \`--from gmail\` without --address is NOT YET IMPLEMENTED and will
  exit 2. to authenticate, unlock the credentials above — then use --address to confirm.
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
} => {
  const options = asCliArgOptions({
    argv,
    // the option contract for gather.auth — a flag outside this set is a typo, and
    // asCliArgOptions refuses it loudly. `help` is here for defense; getIsHelpAsked
    // intercepts it before parseArgs, so it never reaches this validation.
    allowed: ['from', 'address', 'help'],
  });

  return {
    from: options.from,
    address: options.address,
  };
};

/**
 * .what = cli entrypoint for gather.auth skill
 * .why = enables shell invocation via package-level import
 *
 * @returns the exit code the caller should exit with — 0 ok, 2 caller-must-fix,
 *   1 unexpected (`rule.require.exit-code-semantics`).
 *
 * .note = it RETURNS the code rather than calls `process.exit` itself. this is an
 *   exported library entrypoint, so a `process.exit` here would kill the host process of
 *   any caller that imports it as a function — a hard, irreversible side effect invisible
 *   from the signature. the shell wrapper (`gather.auth.sh`) owns that decision, which is
 *   where a process's lifetime belongs.
 */
export const gatherAuth = async (): Promise<number> => {
  // handle --help flag
  if (getIsHelpAsked({ argv: process.argv })) {
    printHelp();
    return 0;
  }

  // parse args
  const options = parseArgs(process.argv);

  try {
    // guard: required args
    if (!options.from) {
      throw new BadRequestError('--from is required', {
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

    // invoke setGatherAuth (options.from is now narrowed to GatheredMailMechanism)
    await setGatherAuth(
      {
        mechanism: options.from,
        address: options.address ?? null,
      },
      {
        log: console,
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
