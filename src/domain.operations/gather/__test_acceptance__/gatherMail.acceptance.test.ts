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
 * .what = the env a gmail case runs under: the current env with the service account cleared
 * .why = a present service account short-circuits gmail auth to `authenticated` before the
 *   token cache is read, so a human with an unlocked test keyrack would flip every gmail
 *   negative-path verdict. clear it, and the verdict comes from the code, never the machine
 */
const getEnvWithoutGmail = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GMAIL_SERVICE_ACCOUNT_JSON: '',
  GMAIL_SERVICE_ACCOUNT_SUBJECT: '',
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
 * .what = whether the `TEST_LIVE` flag targets the live api of one mechanism
 * .why = a live case needs real credentials and a real mailbox, which ci never holds. it runs
 *   only when a human names its mechanism (`TEST_LIVE=gmail,ses`); absent the flag, it skips
 *   by name. once targeted, absent credentials still throw: the flag is a demand for proof
 */
const isLiveTargeted = (input: { mechanism: 'gmail' | 'ses' }): boolean =>
  (process.env.TEST_LIVE ?? '')
    .split(',')
    .map((part) => part.trim())
    .includes(input.mechanism);

/**
 * .what = replace every leaf of a live value with a placeholder that names its type
 * .why = a live mail's exid, dates, sender, subject, labels all vary run to run. the snapshot
 *   must pin the STRUCTURE the contract emits (every key, every nest), never the content
 */
const asMaskedLeaves = (input: { value: unknown }): unknown => {
  if (Array.isArray(input.value)) return '<array>';
  if (input.value === null) return null;
  if (typeof input.value === 'object')
    return Object.fromEntries(
      Object.entries(input.value).map(([key, value]) => [
        key,
        asMaskedLeaves({ value }),
      ]),
    );
  return `<${typeof input.value}>`;
};

/**
 * .what = mask a live `gather.mail --format json` document for a stable snapshot
 * .why = keeps the scope (deterministic for a bare run), masks the stats, and reduces the mail
 *   list to its first mail's masked shape — the mail count varies with the live mailbox
 */
const asMaskedGatherMailJson = (input: { stdout: string }): unknown => {
  const parsed = JSON.parse(input.stdout);
  return {
    scope: parsed.scope,
    stats: asMaskedLeaves({ value: parsed.stats }),
    mails: parsed.mails
      .slice(0, 1)
      .map((mail: unknown) => asMaskedLeaves({ value: mail })),
  };
};

/**
 * .what = mask a live `gather.mail` tree for a stable snapshot
 * .why = keeps every header branch, masks the counts and the scope, and reduces the mail list
 *   to its first mail with date, sender, and subject masked
 */
const asMaskedGatherMailTree = (input: { stdout: string }): string => {
  const lines = input.stdout.split('\n');
  const mailsAt = lines.findIndex((line) => line.includes('└─ mails'));
  const header = (mailsAt === -1 ? lines : lines.slice(0, mailsAt + 1)).map(
    (line) =>
      line
        .replace(/(listed|synced|cached): \d+/, '$1: <number>')
        .replace(/scope: .*/, 'scope: <scope>'),
  );
  const mailFirst = (
    mailsAt === -1 ? [] : lines.slice(mailsAt + 1, mailsAt + 3)
  ).map((line) =>
    line
      .replace(/\d{4}-\d{2}-\d{2} \| \S+/, '<date> | <sender>')
      .replace(/└─ (?!<date>).*$/, '└─ <subject>'),
  );
  return [...header, ...mailFirst].join('\n');
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

    when('[t1] -h is passed', () => {
      then('displays the same help, which names the -h alias', () => {
        const resultShort = execSync(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))" -- -h',
          { encoding: 'utf8' },
        );
        const resultLong = execSync(
          'node -e "import(\'rhachet-roles-nheuron/cli/gatherMail\').then(m => m.gatherMail()).then(c => process.exit(c))" -- --help',
          { encoding: 'utf8' },
        );
        expect(resultShort).toContain('-h, --help');
        expect(resultShort).toEqual(resultLong);
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
          { env: getEnvWithoutGmail() },
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
       *         a truly positive path (mail returned) needs real credentials, so it
       *         lives in [case7], behind `TEST_LIVE=gmail`.
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
            { env: getEnvWithoutGmail() },
          );
          // gmail api should reject fake token
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toMatchSnapshot();
        });
      });
    },
  );

  /**
   * .what = positive path against the real gmail api, via service account
   * .why = proves mail collection works end-to-end
   *
   * run it:
   * 1. follow `.agent/repo=.this/role=any/briefs/howto.create-gmail-service-account.md`
   * 2. rhx keyrack unlock --owner ehmpath --env test
   * 3. TEST_LIVE=gmail npm run test:acceptance
   *
   * .note = the gate is the named flag, never the presence of a credential. absent the flag, the
   *   case skips by name and ci stays green; targeted with no credential, it throws. so a skip
   *   always reads as "not asked", never as "asked, and the key was absent"
   */
  given.runIf(isLiveTargeted({ mechanism: 'gmail' }))(
    '[case7] positive path: real gmail api via service account (TEST_LIVE=gmail)',
    () => {
      /**
       * .what = the workspace address the service account impersonates
       * .why = a targeted live case with no credential must fail loud, never pass vacuous
       */
      const getGmailSubjectOrThrow = (): string => {
        const serviceAccountJson = process.env.GMAIL_SERVICE_ACCOUNT_JSON;
        const subject = process.env.GMAIL_SERVICE_ACCOUNT_SUBJECT;

        // `BadRequestError` is this repo's caller-must-fix class (exit 2) — the
        // `ConstraintError` of `rule.require.failfast`, by the name helpful-errors ships
        if (!serviceAccountJson || !subject)
          throw new BadRequestError(
            'TEST_LIVE=gmail targets the live gmail case, but the service account is absent',
            {
              present: {
                GMAIL_SERVICE_ACCOUNT_JSON: !!serviceAccountJson,
                GMAIL_SERVICE_ACCOUNT_SUBJECT: !!subject,
              },
              hint: 'rhx keyrack unlock --owner ehmpath --env test (see howto.create-gmail-service-account), or drop gmail from TEST_LIVE',
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
          // snapshot the structure; the live content is masked, since it varies run to run
          expect(
            asMaskedGatherMailTree({ stdout: result.stdout }),
          ).toMatchSnapshot();
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
          // snapshot the structure; the live content is masked, since it varies run to run
          expect(
            asMaskedGatherMailJson({ stdout: result.stdout }),
          ).toMatchSnapshot();
        });
      });
    },
  );

  /**
   * .what = positive path against the real ses mailbox `jelly@one.nheuron.com`
   * .why = proves the ses read works end-to-end on the applied mailbox (r008 blocker.1, ses half)
   *
   * run it:
   * 1. apply the mailbox: `.behavior/v2026_07_30.collect-from-ses/blocker/account-setup.md` tracks B–D
   * 2. rhx keyrack unlock --owner ehmpath --env prep
   * 3. AWS_PROFILE=nheuron-prep TEST_LIVE=ses npm run test:acceptance
   *
   * .note = same gate as [case7]: the named flag, never the presence of a credential
   */
  given.runIf(isLiveTargeted({ mechanism: 'ses' }))(
    '[case11] positive path: real ses mailbox (TEST_LIVE=ses)',
    () => {
      /**
       * .what = the applied mailbox address, once its config is present
       * .why = a targeted live case with no mailbox config must fail loud, never skip quietly
       */
      const getSesAddressOrThrow = (): string => {
        // reject a targeted run with no mailbox config
        if (!process.env.SES_MAIL_BUCKET || !process.env.SES_REGION)
          throw new BadRequestError(
            'TEST_LIVE=ses targets the live ses case, but the mailbox config is absent',
            {
              present: {
                SES_MAIL_BUCKET: !!process.env.SES_MAIL_BUCKET,
                SES_REGION: !!process.env.SES_REGION,
                AWS_PROFILE: !!process.env.AWS_PROFILE,
              },
              hint: 'rhx keyrack unlock --owner ehmpath --env prep, with AWS_PROFILE=nheuron-prep, or drop ses from TEST_LIVE',
            },
          );

        return 'jelly@one.nheuron.com';
      };

      // the live run sends a test mail first (account-setup step E1), so an empty read is a
      // failure here: the vision's read move is "each mail appears, parsed"
      when('[t0] gather.mail reads the applied mailbox', () => {
        then('returns each mail parsed, with sender and subject', () => {
          const address = getSesAddressOrThrow();
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from ses --address ${address} --format json`,
          );
          expect(result.exitCode).toBe(0);
          const parsed = JSON.parse(result.stdout);
          expect(parsed.mails.length).toBeGreaterThan(0);
          parsed.mails.forEach(
            (mail: { sender: { address: string }; subject: string }) => {
              expect(mail.sender.address).toMatch(/@/);
              expect(typeof mail.subject).toBe('string');
            },
          );
          // snapshot the structure; the live content is masked, since it varies run to run
          expect(
            asMaskedGatherMailJson({ stdout: result.stdout }),
          ).toMatchSnapshot();
        });

        then('returns the same mailbox as a tree', () => {
          const address = getSesAddressOrThrow();
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from ses --address ${address} --since 2026-01-01`,
          );
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(
            `gather.mail --from ses --address ${address}`,
          );
          expect(
            asMaskedGatherMailTree({ stdout: result.stdout }),
          ).toMatchSnapshot();
        });
      });
    },
  );

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
   * .note = the live read (a real mailbox, real mail) is [case11], behind `TEST_LIVE=ses`.
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

  given('[case12] a typo in a flag name', () => {
    when('[t0] gather.mail is invoked with --qurey', () => {
      then('exits 2, names the unknown flag and the allowed set', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address test@gmail.com --qurey "from:boss@company.com"`,
        );

        // exit 2 (caller-must-fix), never the exit 1 of an unhandled rejection
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("unknown flag '--qurey'");
        expect(result.stderr).toContain('run with --help for usage');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  /**
   * .what = the three input refusals a human meets on a typo: a scope segment with no '=', a
   *   scope key we cannot honor, and an unreadable --since
   * .why = each is clamped at the unit grain, but only the cli proves the human reads it as
   *   `✋ ConstraintError:` on stderr with its hint, at exit 2, before any credential is asked
   *   for. each runs with no gmail credential, so a refusal that slid behind the auth guard
   *   would surface here as `not authenticated` and go red
   */
  given('[case13] an address scope segment with no =', () => {
    when(
      '[t0] gather.mail is invoked with --address vlad@example.com/inbox',
      () => {
        then('exits 2 and names the key=value shape', () => {
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address "vlad@example.com/inbox"`,
            { env: getEnvWithoutGmail() },
          );

          expect(result.exitCode).toBe(2);
          expect(result.stderr).toContain(
            "address scope segment 'inbox' is not a key=value pair",
          );
          expect(result.stderr).toContain('scope segments look like labels=');
          expect(result.stderr).toMatchSnapshot();
        });
      },
    );
  });

  given('[case14] an address scope key we cannot honor', () => {
    when(
      '[t0] gather.mail is invoked with --address vlad@example.com/folder=inbox',
      () => {
        then('exits 2 and names the keys it can honor', () => {
          const result = execAndCapture(
            `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address "vlad@example.com/folder=inbox"`,
            { env: getEnvWithoutGmail() },
          );

          expect(result.exitCode).toBe(2);
          expect(result.stderr).toContain(
            'address scope has a key we cannot honor',
          );
          expect(result.stderr).toContain('drop it, or use one of: labels');
          expect(result.stderr).toMatchSnapshot();
        });
      },
    );
  });

  given('[case15] an unreadable --since', () => {
    when('[t0] gather.mail is invoked with --since yesterday', () => {
      then('exits 2 and names an iso date, before any auth check', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --from gmail --address vlad@example.com --since yesterday`,
          { env: getEnvWithoutGmail() },
        );

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('--since is not a date we can read');
        expect(result.stderr).toContain('use an ISO date');

        // ⚠️ the teeth — the date refusal comes first, never a credential detour
        expect(result.stderr).not.toContain('not authenticated');
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });

  /**
   * .what = the argv exactly as `rhx gather.mail` delivers it
   * .why = rhachet appends `--skill`, `--repo`, `--role` to every skill call. the other cases
   *   call the entrypoint bare, so none saw the strict flag allowlist refuse `--skill` — every
   *   real `rhx gather.mail` call exited 2 on 'unknown flag' while this suite stayed green
   */
  given('[case16] the passthrough flags rhachet appends', () => {
    when('[t0] gather.mail runs as `rhx gather.mail` would call it', () => {
      then('reads its own flags and reaches the auth check', () => {
        const result = execAndCapture(
          `node -e "import('rhachet-roles-nheuron/cli/gatherMail').then(m => m.gatherMail()).then(c => process.exit(c))" -- --skill gather.mail --repo nheuron --role gatherer --from ses --address jelly@one.nheuron.com`,
          { env: getEnvWithoutSes() },
        );

        // ⚠️ the teeth — the passthrough is dropped, so the run gets past the parse
        expect(result.stderr).not.toContain('unknown flag');
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('not authenticated');
        expect(result.stderr).toContain(
          'rhx keyrack unlock --owner ehmpath --env prep',
        );
        // the exact human surface on the rhx path: identical to [case8], the bare call
        expect(result.stderr).toMatchSnapshot();
      });
    });
  });
});
