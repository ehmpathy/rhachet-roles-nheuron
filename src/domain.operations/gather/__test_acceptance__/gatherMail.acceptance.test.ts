import * as fs from 'fs/promises';
import { BadRequestError } from 'helpful-errors';
import * as path from 'path';
import { given, then, useBeforeAll, when } from 'test-fns';

import { execSync } from 'node:child_process';

/**
 * .what = extract exit code and stderr from execSync error
 * .why = isolate error extraction to reduce cognitive complexity
 */
const getExecError = (error: unknown): { exitCode: number; stderr: string } => {
  // guard: not an object
  if (!error || typeof error !== 'object') {
    return { exitCode: 0, stderr: '' };
  }

  // extract via immutable construction
  const exitCode = 'status' in error ? (error.status as number) : 0;
  const stderr = 'stderr' in error ? (error.stderr as string) : '';

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
 * .what = acceptance tests for gather.mail cli
 * .why = verify cli works via built artifact
 */
describe('gather.mail', () => {
  given('[case1] help flag', () => {
    when('[t0] --help is passed', () => {
      then('displays help message', () => {
        const result = execSync(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))" -- --help',
          { encoding: 'utf8' },
        );
        expect(result).toContain('gather.mail');
        expect(result).toContain('--from');
        expect(result).toContain('--address');
        expect(result).toContain('--since');
        expect(result).toContain('--format');
        expect(result).toContain('--help');
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case2] absent required args', () => {
    when('[t0] no --from provided', () => {
      then('exits with error code 2', () => {
        const result = execAndCapture(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))"',
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('--from is required');
        expect(result.stderr).toMatchSnapshot();
      });
    });

    when('[t1] --from provided but no --address', () => {
      then('exits with error code 2', () => {
        const result = execAndCapture(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail',
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('--address is required');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  given('[case3] invalid mechanism', () => {
    when('[t0] unsupported mechanism provided', () => {
      then('exits with error code 2', () => {
        const result = execAndCapture(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from slack --address test@example.com',
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("invalid mechanism 'slack'");
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  given('[case4] invalid format', () => {
    when('[t0] unsupported format provided', () => {
      then('exits with error code 2', () => {
        const result = execAndCapture(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address test@gmail.com --format xml',
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("invalid format 'xml'");
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  given('[case5] not authenticated (auth check exercises)', () => {
    when('[t0] no token exists for address', () => {
      then('exits with clear error and hint', () => {
        const result = execAndCapture(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address no-token-test@example.com',
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('not authenticated');
        // the hint points at the service-account keyrack path, never the dead
        // `gather.auth --from gmail` flow (which now throws) — see r002 nitpick.1
        expect(result.stderr).toContain('GMAIL_SERVICE_ACCOUNT_JSON');
        expect(result.stderr).toContain('keyrack unlock');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  given(
    '[case6] positive path constraint: gmail api requires real credentials',
    () => {
      /**
       * .note = this test demonstrates that gather.mail reaches the Gmail API
       *         after auth check passes. with a fake token, the API returns
       *         an error. this proves the full flow path works correctly.
       *
       *         a truly positive path (mail returned) requires real credentials
       *         which cannot be automated in CI. manual test instructions below.
       *
       *         to verify positive path manually (gmail authenticates via a
       *         keyrack service account, NOT a browser oauth grant — that flow
       *         no longer exists and `gather.auth --from gmail` exits 2):
       *         1. fill the service account: rhx keyrack fill --owner ehmpath --env test
       *            (GMAIL_SERVICE_ACCOUNT_JSON + GMAIL_SERVICE_ACCOUNT_SUBJECT)
       *         2. unlock it: rhx keyrack unlock --owner ehmpath --env test
       *         3. run: rhx gather.mail --from gmail --address your@gmail.com
       *         4. observe mail output in tree format
       */
      const testAddress = 'test-api-attempt@example.com';

      /**
       * .what = compute token cache path for test
       * .why = enables pre-seed tokens for acceptance tests
       */
      const getTokenPath = (): string => {
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
          `address=${testAddress}.json`,
        );
      };

      /**
       * .what = seed token file for acceptance test setup
       * .why = enables test of mail fetch path without real credentials
       */
      const seedToken = async (): Promise<void> => {
        const tokenPath = getTokenPath();
        const tokenDir = path.dirname(tokenPath);

        await fs.mkdir(tokenDir, { recursive: true });
        await fs.writeFile(
          tokenPath,
          JSON.stringify(
            {
              mechanism: 'gmail',
              address: testAddress,
              accessToken: 'fake-test-token-for-api-path-verification',
              refreshToken: 'fake-refresh-token',
              expiresAt: new Date(Date.now() + 3600 * 1000).toJSON(),
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
      const cleanupToken = async (): Promise<void> => {
        const tokenPath = getTokenPath();
        try {
          await fs.unlink(tokenPath);
        } catch (error) {
          // allowlist ENOENT ONLY — an absent token is the expected state on a first run.
          // every other error means cleanup did NOT happen, which leaves a stale token for
          // the next case to trip over. a bare `catch {}` hid that (rule.forbid.failhide)
          if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
        }
      };

      // seed fake token before test, cleanup after
      useBeforeAll(async () => {
        await seedToken();
        return async () => cleanupToken();
      });

      when('[t0] authenticated with fake token (gmail api rejects)', () => {
        then('exits with api error (proves full flow path)', () => {
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address ${testAddress}`,
          );
          // gmail api should reject fake token
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toMatchSnapshot();
        });
      });
    },
  );

  given('[case7] positive path: real gmail api via service account', () => {
    /**
     * .what = test positive path with real gmail api via service account
     * .why = proves mail collection works end-to-end
     *
     * requires:
     * - GMAIL_SERVICE_ACCOUNT_JSON: service account credentials
     * - GMAIL_SERVICE_ACCOUNT_SUBJECT: workspace email to impersonate
     *
     * setup:
     * 1. follow howto.create-gmail-service-account.[guide].md
     * 2. run: rhx keyrack fill --owner ehmpath --env test
     * 3. run: rhx keyrack unlock --owner ehmpath --env test
     *
     * ⚠️ .note = this case once wrapped itself in `when.runIf(hasCredentials)`, so an absent
     *   credential SKIPPED it and the suite went green while the only positive path in the
     *   whole file had never run. that is the exact shape `rule.forbid.failhide` names a
     *   blocker ("silent skip") and `rule.require.failfast` forbids ("absent resource =
     *   unacceptable"), and `philosophy.verification-strictness` grades a credential excuse
     *   a blocker rather than a deferral.
     *
     *   so it now THROWS. a red suite that names the exact fill command is honest; a green
     *   suite that proved naught is a lie about coverage.
     */
    const getGmailSubjectOrThrow = (): string => {
      const serviceAccountJson = process.env.GMAIL_SERVICE_ACCOUNT_JSON;
      const subject = process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT;

      // `BadRequestError` is this repo's caller-must-fix class (exit 2) — the
      // `ConstraintError` of `rule.require.failfast`, by the name helpful-errors ships
      if (!serviceAccountJson || !subject)
        throw new BadRequestError(
          'the gmail service account is required for the positive-path acceptance case',
          {
            present: {
              GMAIL_SERVICE_ACCOUNT_JSON: !!serviceAccountJson,
              GMAIL_SERVICE_ACCOUNT_SUBJECT: !!subject,
            },
            why: 'this is the ONLY case that proves gmail collection actually works; skipped, the suite claims a coverage it does not hold',
            hint: 'local: rhx keyrack unlock --owner ehmpath --env test. ci: add both keys to .github/workflows/test.yml `secrets:` (see howto.create-gmail-service-account)',
          },
        );

      return subject;
    };

    when('[t0] service account authenticates to gmail api', () => {
      then('returns mail in tree format', () => {
        const subject = getGmailSubjectOrThrow();
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address ${subject}`,
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('gather.mail');
        // snapshot the structure (content varies)
        expect(result.stdout).toMatchSnapshot();
      });

      then('returns mail in json format', () => {
        const subject = getGmailSubjectOrThrow();
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address ${subject} --format json`,
        );
        expect(result.exitCode).toBe(0);
        // verify valid json output
        const parsed = JSON.parse(result.stdout);
        expect(Array.isArray(parsed.mails)).toBe(true);
        expect(result.stdout).toMatchSnapshot();
      });
    });
  });

  /**
   * .what = the `--from ses` contract, for the path a human reaches WITHOUT live aws
   * .why = ses is the mechanism this behavior adds, and until this case existed every
   *   acceptance case drove `--from gmail` — so the new branch shipped with no snapshot of
   *   what a human actually sees (`rule.require.contract-snapshot-exhaustiveness`).
   *
   * .note = this is the teeth for the ses half of `getAuthenticatedOrThrow`. its hint once
   *   read `run 'gather.auth --from ses' to authenticate` — a command that REFUSES ses with
   *   'ses needs no auth flow'. so the error named a fix that could not fix it, which is
   *   worse than an error with no hint at all (`rule.require.errors-name-the-fix`).
   *
   * .note = the live read (a real mailbox, real mail) is blocked on the human-only apply and
   *   is tracked as the one unticked verification in the yield.
   */
  given('[case8] ses collection with no aws configured', () => {
    when('[t0] SES_MAIL_BUCKET and SES_REGION are absent', () => {
      then('exits 2 and names the keyrack unlock, never gather.auth', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from ses --address jelly@one.nheuron.com`,
          { env: getEnvWithoutSes() },
        );
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('not authenticated');
        expect(result.stderr).toContain('AWS_PROFILE');
        expect(result.stderr).toContain('rhx keyrack unlock');
        // the gmail fix must NOT leak into the ses error — `gather.auth --from ses` throws
        expect(result.stderr).not.toContain(
          "gather.auth --from ses' to authenticate",
        );
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  /**
   * .what = clamps that a filter ses cannot honor is REFUSED at the cli, not dropped
   * .why = the unit clamp proves `getSesMailAdapter` throws; these prove the throw actually
   *   reaches a human. the whole defect was that a filter looked accepted end-to-end, so the
   *   end-to-end path is the one that must show the refusal.
   *
   * .note = these need no aws at all — both guards fire before `getSesConfig()`, so each case
   *   drives the real cli against a real absent-config env and STILL fails on the filter.
   *   that is also what they clamp: the filter refusal must PRECEDE the credential complaint.
   */
  given('[case9] a --query against ses, which cannot honor one', () => {
    when('[t0] gather.mail is invoked with --query', () => {
      then('exits 2 and refuses the flag, rather than return it all', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from ses --address jelly@one.nheuron.com --query "from:boss@company.com"`,
          { env: getEnvWithoutSes() },
        );

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('cannot honor --query');
        // ⚠️ otherwise the human is sent to fill a keyrack key when their real mistake
        // was a flag ses cannot serve
        expect(result.stderr).not.toContain('SES_MAIL_BUCKET');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  given('[case10] a /labels= scope against ses', () => {
    when('[t0] gather.mail is invoked with a scoped address', () => {
      then('exits 2 and names the suffix to drop', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from ses --address "jelly@one.nheuron.com/labels=work"`,
          { env: getEnvWithoutSes() },
        );

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('cannot honor a /labels= scope');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });
});
