import { given, then, when } from 'test-fns';

import { execSync } from 'node:child_process';

/**
 * .what = extract exit code and stderr from execSync error
 * .why = isolate error extraction to reduce cognitive complexity
 */
const getExecError = (error: unknown): { exitCode: number; stderr: string } => {
  // guard: a spawn failure or a signal kill carries no numeric status — the command never
  // reported an exit, so rethrow it rather than pass it off as a clean exit 0
  if (
    !error ||
    typeof error !== 'object' ||
    !('status' in error) ||
    typeof error.status !== 'number'
  )
    throw error;

  // extract via immutable construction
  const exitCode = error.status;
  const stderr = 'stderr' in error ? String(error.stderr) : '';

  return { exitCode, stderr };
};

/**
 * .what = the env a ses case runs under: the current env with every ses key cleared
 * .why = the ses cases assert the NOT-CONFIGURED contract, so they must not depend on
 *   whether the human who runs them happens to hold an unlocked prep keyrack. without this
 *   the same case passes on ci and fails on a configured laptop — a test whose verdict comes
 *   from the machine rather than the code (`rule.require.hermetic-tests`)
 */
const getEnvWithoutSes = (): NodeJS.ProcessEnv => ({
  ...process.env,
  SES_MAIL_BUCKET: '',
  SES_REGION: '',
  SES_CONFIG_SET: '',
});

/**
 * .what = execute command and return result (success or error)
 * .why = enables const assignment instead of let + try/catch mutation
 */
const execAndCapture = (
  cmd: string,
  options?: { env: NodeJS.ProcessEnv },
): { exitCode: number; stdout: string; stderr: string } => {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(options?.env ? { env: options.env } : {}),
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    const { exitCode, stderr } = getExecError(error);
    return { exitCode, stdout: '', stderr };
  }
};

/**
 * .what = acceptance tests for gather.auth cli
 * .why = verify cli works via built artifact
 */
describe('gather.auth', () => {
  given('[case1] help flag', () => {
    when('[t0] --help is passed', () => {
      then('displays help message', () => {
        const result = execSync(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherAuth\').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --help',
          { encoding: 'utf8' },
        );
        expect(result).toContain('gather.auth');
        expect(result).toContain('--from');
        expect(result).toContain('--help');
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case2] absent required args', () => {
    when('[t0] no --from provided', () => {
      then('exits with error code 2', () => {
        const result = execAndCapture(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherAuth\').then(m => m.gatherAuth()).then(c => process.exit(c))"',
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('--from is required');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  given('[case3] invalid mechanism', () => {
    when('[t0] unsupported mechanism provided', () => {
      then('exits with error code 2', () => {
        const result = execAndCapture(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherAuth\').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from slack',
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("invalid mechanism 'slack'");
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  /**
   * .what = the `--from ses` contract, for the paths a human reaches WITHOUT live aws
   * .why = these are the CREDENTIAL-FREE half of the ses contract, and they are complete
   *   for that half: `--from ses` needs no token cache, so its not-configured behavior is
   *   fully determined by an absent `SES_MAIL_BUCKET`/`SES_REGION`. the live half (a real
   *   mailbox read, a real send) runs only where `TEST_LIVE` names it (fulcrum F8).
   *
   * .note = [case4] is the teeth. it caught TWO wrong hints that unit tests could not: both
   *   `getAuthStatusDisplay` and `getAuthenticatedOrThrow` told an anonymous ses human to
   *   "run gather.auth", a command that REFUSES ses with 'ses needs no auth flow'. a hint
   *   that names a command which rejects you is worse than no hint at all.
   */
  given('[case4] ses status check with --address (no aws configured)', () => {
    when('[t0] SES_MAIL_BUCKET and SES_REGION are absent', () => {
      then('shows anonymous status and names the keyrack unlock', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from ses --address jelly@one.nheuron.com`,
          { env: getEnvWithoutSes() },
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('boop! auth needed');
        expect(result.stdout).toContain('status: anonymous');
        expect(result.stdout).toContain('jelly@one.nheuron.com');
        // the fix must be the one that WORKS for ses — never `gather.auth --from ses`,
        // which throws 'ses needs no auth flow'
        expect(result.stdout).toContain('rhx keyrack unlock');
        expect(result.stdout).toMatchSnapshot();
      });
    });
  });

  given('[case5] ses auth flow (there is none)', () => {
    when('[t0] --from ses provided without --address', () => {
      then('exits 2 and points at keyrack rather than an auth flow', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from ses`,
          { env: getEnvWithoutSes() },
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('ses needs no auth flow');
        expect(result.stderr).toContain('rhx keyrack unlock');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  given('[case6] a typo in a flag name', () => {
    when('[t0] gather.auth is invoked with --adress', () => {
      then('exits 2, names the unknown flag and the allowed set', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from ses --adress test@example.com`,
        );

        // exit 2 (caller-must-fix), never the exit 1 of an unhandled rejection
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("unknown flag '--adress'");
        expect(result.stderr).toContain('run with --help for usage');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  /**
   * .what = the argv exactly as `rhx gather.auth` delivers it
   * .why = rhachet appends `--skill`, `--repo`, `--role` to every skill call. the other cases
   *   here call the entrypoint bare, so none of them saw that the strict flag allowlist refused
   *   `--skill` — every real `rhx gather.auth` call exited 2 while this suite stayed green
   */
  given('[case7] the passthrough flags rhachet appends', () => {
    when('[t0] gather.auth runs as `rhx gather.auth` would call it', () => {
      then(
        'exits 0, reads its own flags, and ends its output with a newline',
        () => {
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --skill gather.auth --repo nheuron --role gatherer --from ses --address jelly@one.nheuron.com`,
            { env: getEnvWithoutSes() },
          );
          expect(result.stderr).not.toContain('unknown flag');
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain('gather.auth --from ses');
          expect(result.stdout).toContain('address: jelly@one.nheuron.com');
          // the shell prompt must start on its own line, never glued to the hint
          expect(result.stdout.endsWith('\n')).toBe(true);
          // the exact human surface on the rhx path: identical to [case4], the bare call
          expect(result.stdout).toMatchSnapshot();
        },
      );
    });
  });
});
