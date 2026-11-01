import * as fs from 'fs/promises';
import * as path from 'path';
import { given, then, useBeforeAll, when } from 'test-fns';

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
 * .what = compute token cache path for test
 * .why = enables pre-seed tokens for acceptance tests
 */
const getTokenPath = (input: { address: string }): string => {
  const cwd = process.cwd();
  return path.join(
    cwd,
    '.agent',
    '.cache',
    'repo=nheuron',
    'role=gatherer',
    'skill=gather.auth',
    'tokens',
    'mechanism=gmail',
    `address=${input.address}.json`,
  );
};

/**
 * .what = seed token file for acceptance test setup
 * .why = enables test of auth status without real oauth
 */
const seedToken = async (input: {
  address: string;
  expiresAt: Date;
}): Promise<void> => {
  const tokenPath = getTokenPath({ address: input.address });
  const tokenDir = path.dirname(tokenPath);

  await fs.mkdir(tokenDir, { recursive: true });
  await fs.writeFile(
    tokenPath,
    JSON.stringify(
      {
        mechanism: 'gmail',
        address: input.address,
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: input.expiresAt.toJSON(),
      },
      null,
      2,
    ),
    'utf-8',
  );
};

/**
 * .what = remove token file for test cleanup
 * .why = ensures isolated tests without leftover state
 */
const cleanupToken = async (input: { address: string }): Promise<void> => {
  const tokenPath = getTokenPath({ address: input.address });
  try {
    await fs.unlink(tokenPath);
  } catch (error) {
    // allowlist ENOENT ONLY — cleanup runs both before and after each case, so an absent
    // file on the first pass is the expected state, not a fault. every other error (a
    // permission fault, a directory where a file belongs) means cleanup did NOT happen,
    // which leaves the next case to read a stale token and fail for the wrong reason.
    // a bare `catch {}` hid exactly that (rule.forbid.failhide)
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
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

  given(
    '[case4] status check with --address (positive path: anonymous)',
    () => {
      const testAddress = 'test-anonymous@example.com';

      // cleanup before and after to ensure isolation
      useBeforeAll(async () => {
        await cleanupToken({ address: testAddress });
        return async () => cleanupToken({ address: testAddress });
      });

      when('[t0] no token exists for address', () => {
        then('shows anonymous status', () => {
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from gmail --address ${testAddress}`,
          );
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain('boop! auth needed');
          expect(result.stdout).toContain('status: anonymous');
          expect(result.stdout).toMatchSnapshot();
        });
      });
    },
  );

  given(
    '[case5] status check with --address (positive path: authenticated)',
    () => {
      const testAddress = 'test-authenticated@example.com';

      // seed valid token before test, cleanup after
      useBeforeAll(async () => {
        const futureDate = new Date(Date.now() + 3600 * 1000); // 1 hour from now
        await seedToken({ address: testAddress, expiresAt: futureDate });
        return async () => cleanupToken({ address: testAddress });
      });

      when('[t0] valid token exists for address', () => {
        then('shows authenticated status', () => {
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from gmail --address ${testAddress}`,
          );
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain('boop! auth ready');
          expect(result.stdout).toContain('status: authenticated');
          expect(result.stdout).toContain(testAddress);
          expect(result.stdout).toMatchSnapshot();
        });
      });
    },
  );

  given('[case6] status check with --address (positive path: expired)', () => {
    const testAddress = 'test-expired@example.com';

    // seed expired token before test, cleanup after
    useBeforeAll(async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      await seedToken({ address: testAddress, expiresAt: pastDate });
      return async () => cleanupToken({ address: testAddress });
    });

    when('[t0] expired token exists for address', () => {
      then('shows expired status', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from gmail --address ${testAddress}`,
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('boop! auth expired');
        expect(result.stdout).toContain('status: expired');
        expect(result.stdout).toContain(testAddress);
        expect(result.stdout).toMatchSnapshot();
      });
    });
  });

  given(
    '[case7] gmail auth without --address (there is no interactive flow)',
    () => {
      /**
       * .what = clamps that the refusal names a fix the human can take TODAY
       * .why = this once asserted `oauth flow not yet implemented`, and the error it
       *   asserted went on to say "this will be implemented in genGmailAuth orchestrator" —
       *   a file that does not exist. so the contract, snapshot and all, PROMISED a repair
       *   the human could not make, while the repair that works (a service account) went
       *   unnamed. the test held that misdirection in place rather than caught it.
       *
       * .note = the assertions below are deliberately stronger than the ones they replace.
       *   the old one checked a phrase; these check that the service-account key is named,
       *   that a runnable command is given, and — the teeth — that the dead orchestrator is
       *   NOT named. a test that merely swapped one phrase for another would re-admit the
       *   same class of defect (`rule.require.errors-name-the-fix`).
       */
      when('[t0] --from gmail provided without --address', () => {
        then('exits 2 and names the service-account fix', () => {
          const result = execAndCapture(
            'node -e "import(\'rhachet-roles-nheuron/cli/gatherAuth\').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from gmail',
          );
          expect(result.exitCode).toBe(2);
          expect(result.stderr).toContain('no interactive auth flow');

          // the fix a human can actually run
          expect(result.stderr).toContain('GMAIL_SERVICE_ACCOUNT_JSON');
          expect(result.stderr).toContain('rhx keyrack');

          // ⚠️ the teeth — the fix that never existed must not return
          expect(result.stderr).not.toContain('genGmailAuth');
          expect(result.stderr).not.toContain('not yet implemented');

          expect(result.stderr).toMatchSnapshot();
        });
      });
    },
  );

  /**
   * .what = the `--from ses` contract, for the paths a human reaches WITHOUT live aws
   * .why = ses is the mechanism this behavior adds, and until these cases existed every
   *   acceptance case drove `--from gmail` — so the new branch shipped with no snapshot of
   *   what a human actually sees (`rule.require.contract-snapshot-exhaustiveness`).
   *
   * .note = these are the CREDENTIAL-FREE half of the ses contract, and they are complete
   *   for that half: `--from ses` needs no oauth dance and no token cache, so its
   *   not-configured behavior is fully determined by an absent `SES_MAIL_BUCKET`/`SES_REGION`.
   *   the live half (a real mailbox read, a real send) is blocked on the human-only apply and
   *   is tracked as the one unticked verification in the yield.
   *
   * .note = [case8] is the teeth. it caught TWO wrong hints that unit tests could not: both
   *   `getAuthStatusDisplay` and `getAuthenticatedOrThrow` told an anonymous ses human to
   *   "run gather.auth", a command that REFUSES ses with 'ses needs no auth flow'. a hint
   *   that names a command which rejects you is worse than no hint at all.
   */
  given('[case8] ses status check with --address (no aws configured)', () => {
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

  given('[case9] ses auth flow (there is none)', () => {
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

  given('[case10] a typo in a flag name', () => {
    when('[t0] gather.auth is invoked with --adress', () => {
      then('exits 2, names the unknown flag and the allowed set', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherAuth').then(m => m.gatherAuth()).then(c => process.exit(c))" -- --from gmail --adress test@gmail.com`,
        );

        // exit 2 (caller-must-fix), never the exit 1 of an unhandled rejection
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("unknown flag '--adress'");
        expect(result.stderr).toContain('run with --help for usage');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });
});
