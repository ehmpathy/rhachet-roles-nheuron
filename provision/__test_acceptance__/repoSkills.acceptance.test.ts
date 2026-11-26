import { given, then, useBeforeAll, when } from 'test-fns';

import { spawnSync } from 'node:child_process';
import {
  isProvisionLiveTargeted,
  type ProvisionLiveMechanism,
} from '../getPlanOfWishLive';

// a live plan and a roundtrip poll each outlast the default hook timeout
jest.setTimeout(300_000);

/**
 * .what = the credential-free surfaces of this repo's own operator skills: help, and the
 *   refusal a bare call meets
 * .why = these skills (`.agent/repo=.this/role=any/skills/`) are how a human provisions, checks,
 *   and proves the mailbox. their live paths need aws credentials, but help and the arg
 *   refusals do not — so those are pinned here, where a drift in a help block or a refusal
 *   render goes red rather than ships unseen
 *
 * .note = `.agent/` is excluded from jest's testMatch (it holds symlinks into role packages),
 *   so the suite lives beside the provision wishes these skills drive
 */
const SKILLS_DIR = '.agent/repo=.this/role=any/skills';

/**
 * .what = run one repo skill with bash, capture both streams and the exit code
 * .why = the skills print their refusal tree on stdout and exit 2; a capture that kept only
 *   stderr on failure would see none of it
 */
const runSkill = (input: {
  skill: string;
  args: string[];
}): { exitCode: number | null; stdout: string; stderr: string } => {
  const result = spawnSync(
    'bash',
    [`${SKILLS_DIR}/${input.skill}.sh`, ...input.args],
    {
      encoding: 'utf8',
      // the sandbox's env, never the worker's (see gatherMail.acceptance execAndCapture)
      env: process.env,
    },
  );
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

/**
 * .what = each skill, and the first refusal a bare call meets
 * .why = every refusal below fires in arg validation, before any keyrack or aws call
 */
const SKILLS: { skill: string; refusal: string }[] = [
  { skill: 'mail.dns.records.get', refusal: 'invalid or absent --env' },
  { skill: 'mail.identity.status.get', refusal: 'invalid or absent --env' },
  { skill: 'mail.roundtrip.prove', refusal: 'invalid or absent --env' },
  { skill: 'aws.caller.get', refusal: '--env' },
  { skill: 'provision.member', refusal: '--wish' },
  { skill: 'provision.root', refusal: '--wish' },
  { skill: 'package.patch', refusal: 'absent required arg: --package' },
  { skill: 'test.live', refusal: 'absent required arg: --live' },
];

/**
 * .what = each further refusal a caller can meet, past the bare call
 * .why = a bad value is a different render than an absent one; each fires in arg validation,
 *   before any keyrack or aws call, so each is pinned with no credential
 */
const REFUSALS: { skill: string; args: string[]; refusal: string }[] = [
  {
    skill: 'mail.dns.records.get',
    args: ['--env', 'bogus'],
    refusal: 'invalid or absent --env: bogus',
  },
  {
    skill: 'mail.roundtrip.prove',
    args: ['--env', 'prep'],
    refusal: 'invalid or absent --address',
  },
  {
    skill: 'aws.caller.get',
    args: ['--env', 'prep', '--expect', 'bogus'],
    refusal: 'invalid expect: bogus',
  },
  {
    skill: 'provision.member',
    args: [
      '--wish',
      'provision/aws.mail/account=prep/resources.mail.ts',
      '--env',
      'prep',
      '--mode',
      'bogus',
    ],
    refusal: 'invalid or absent --mode: bogus',
  },
  {
    skill: 'provision.root',
    args: [
      '--wish',
      'provision/aws.budget/account=.root/resources.ts',
      '--mode',
      'bogus',
    ],
    refusal: 'invalid or absent --mode: bogus',
  },
  {
    skill: 'package.patch',
    args: ['--package', 'declastruct-aws', '--mode', 'open'],
    refusal: '--package needs an exact version',
  },
  {
    skill: 'test.live',
    args: ['--live', 'ses,bogus'],
    refusal: 'unknown live gate: bogus',
  },
  {
    skill: 'aws.caller.get',
    args: ['--env', 'bogus'],
    refusal: 'invalid env: bogus',
  },
  {
    skill: 'aws.caller.get',
    args: ['--env'],
    refusal: 'pass one of sudo, prep, prod, test',
  },
  {
    skill: 'aws.caller.get',
    args: ['--env', 'prep', '--bogus', 'x'],
    refusal: 'unknown argument: --bogus',
  },
  {
    skill: 'mail.dns.records.get',
    args: ['--env', 'prep', '--format', 'bogus'],
    refusal: 'invalid --format: bogus',
  },
  {
    skill: 'mail.dns.records.get',
    args: ['--env', 'prep', '--bogus', 'x'],
    refusal: 'unknown argument: --bogus',
  },
  {
    skill: 'mail.identity.status.get',
    args: ['--env', 'prep', '--bogus', 'x'],
    refusal: 'unknown argument: --bogus',
  },
  {
    skill: 'mail.roundtrip.prove',
    args: ['--env', 'prep', '--bogus', 'x'],
    refusal: 'unknown argument: --bogus',
  },
  {
    skill: 'provision.member',
    args: [
      '--wish',
      'provision/aws.mail/account=prep/resources.mail.ts',
      '--env',
      'bogus',
      '--mode',
      'plan',
    ],
    refusal: 'invalid or absent --env: bogus',
  },
  {
    skill: 'provision.member',
    args: [
      '--wish',
      'provision/aws.mail/account=prep/resources.mail.ts',
      '--env',
      'prep',
      '--mode',
      'plan',
      '--bogus',
      'x',
    ],
    refusal: 'unknown argument: --bogus',
  },
  {
    skill: 'provision.member',
    args: [
      '--wish',
      'provision/aws.mail/account=prep/resources.mail.ts',
      '--env',
      'prep',
      '--mode',
      'apply',
      '--plan',
      '.temp/absent.plan.json',
    ],
    refusal: 'plan not found: .temp/absent.plan.json',
  },
  {
    skill: 'provision.root',
    args: ['--wish', 'provision/absent/resources.ts', '--mode', 'plan'],
    refusal: 'wish not found: provision/absent/resources.ts',
  },
  {
    skill: 'provision.root',
    args: [
      '--wish',
      'provision/aws.budget/account=.root/resources.ts',
      '--mode',
      'plan',
      '--bogus',
      'x',
    ],
    refusal: 'unknown argument: --bogus',
  },
  {
    skill: 'provision.root',
    args: [
      '--wish',
      'provision/aws.budget/account=.root/resources.ts',
      '--mode',
      'apply',
      '--plan',
      '.temp/absent.plan.json',
    ],
    refusal: 'plan not found: .temp/absent.plan.json',
  },
  {
    skill: 'package.patch',
    args: ['--package', 'declastruct-aws@1.13.0', '--mode', 'bogus'],
    refusal: 'invalid mode: bogus',
  },
  {
    skill: 'package.patch',
    args: ['--package', 'declastruct-aws@1.13.0'],
    refusal: 'absent required arg: --mode',
  },
  {
    skill: 'package.patch',
    args: ['--package', 'declastruct-aws@1.13.0', '--mode', 'open', '--bogus'],
    refusal: 'unknown argument: --bogus',
  },
];

/**
 * .what = mask the bytes of a live run that vary per run or name a person or an account
 * .why = a snapshot must hold the SHAPE a human reads, never an account id, an sso session
 *   name (a person's handle), a message id, or a timer
 */
const asMaskedLiveOutput = (input: { text: string }): string =>
  input.text
    .replace(/\b\d{12}\b/g, '<account>')
    .replace(/(assumed-role\/[^/\s]+?)_[0-9a-f]{16}\//g, '$1_<hash>/')
    .replace(/(assumed-role\/[^/\s]+\/)\S+/g, '$1<session>')
    .replace(/\b[a-z0-9]{32}\b/g, '<dkim>')
    .replace(/roundtrip-\S+/g, 'roundtrip-<probe>')
    .replace(/(sent: )\S+/g, '$1<message-id>')
    .replace(/\d+(\.\d+)?s\b/g, '<n>s');

/**
 * .what = the summary tree a skill prints last, from its last mascot line on
 * .why = a plan streams spinner frames and per-resource diffs above its summary; the summary
 *   is the contract a human reads, the stream above it is progress
 */
const asSummaryTree = (input: { text: string }): string =>
  input.text.slice(input.text.lastIndexOf('🐈'));

/**
 * .what = each read-only skill's positive path, run live against the prep mailbox
 * .why = the help and refusals above prove a skill parses its args; only a live run proves the
 *   render a human acts on. each of these reads aws (and the roundtrip sends one probe to the
 *   mailbox itself), so each runs under `TEST_LIVE=ses` and fails loud when its slot is locked
 *
 * .note = `provision.root` plans as the management account, so its positive path rides the
 *   `aws.accounts` gate, the one that opens every root-session case. `package.patch` writes
 *   an edit dir and a `patches/*.patch`, so its positive path changes repo state and is proven
 *   by the patches it already produced. `test.live`'s positive path is every suite run the
 *   verification yield cites
 */
const LIVE_POSITIVES: {
  skill: string;
  args: string[];
  contains: string;
  summaryOnly: boolean;
  gate: ProvisionLiveMechanism;
  account: 'prep' | 'management';
}[] = [
  {
    skill: 'aws.caller.get',
    args: ['--env', 'prep', '--org', 'nheuron'],
    contains: 'account:',
    summaryOnly: false,
    gate: 'ses',
    account: 'prep',
  },
  {
    skill: 'mail.dns.records.get',
    args: ['--env', 'prep'],
    contains: 'one.prep.nheuron.com',
    summaryOnly: false,
    gate: 'ses',
    account: 'prep',
  },
  {
    skill: 'mail.dns.records.get',
    args: ['--env', 'prep', '--format', 'bind'],
    contains: 'one.prep.nheuron.com',
    summaryOnly: false,
    gate: 'ses',
    account: 'prep',
  },
  {
    skill: 'mail.identity.status.get',
    args: ['--env', 'prep'],
    contains: 'every domain verified',
    summaryOnly: false,
    gate: 'ses',
    account: 'prep',
  },
  {
    skill: 'provision.root',
    args: [
      '--wish',
      'provision/aws.budget/account=.root/resources.ts',
      '--mode',
      'plan',
    ],
    contains: 'planned →',
    summaryOnly: true,
    gate: 'aws.accounts',
    account: 'management',
  },
  {
    skill: 'provision.member',
    args: [
      '--wish',
      'provision/aws.mail/account=prep/resources.mail.ts',
      '--env',
      'prep',
      '--org',
      'nheuron',
      '--mode',
      'plan',
    ],
    contains: 'planned →',
    summaryOnly: true,
    gate: 'ses',
    account: 'prep',
  },
  {
    skill: 'mail.roundtrip.prove',
    args: ['--env', 'prep', '--address', 'jelly@one.prep.nheuron.com'],
    contains: 'roundtrip proven',
    summaryOnly: false,
    gate: 'ses',
    account: 'prep',
  },
];

describe('repo skills', () => {
  REFUSALS.forEach(({ skill, args, refusal }, index) => {
    given(`[refusal${index + 1}] ${skill} ${args.join(' ')}`, () => {
      when('[t0] it is called', () => {
        const result = runSkill({ skill, args });

        then('it refuses with exit 2 and names the bad value', () => {
          expect(result.exitCode).toBe(2);
          expect(result.stdout + result.stderr).toContain(refusal);
        });

        then('the refusal surface is pinned', () => {
          expect({
            stdout: result.stdout,
            stderr: result.stderr,
          }).toMatchSnapshot();
        });
      });
    });
  });

  LIVE_POSITIVES.forEach(
    ({ skill, args, contains, summaryOnly, gate, account }, index) => {
      given.runIf(isProvisionLiveTargeted({ mechanism: gate }))(
        `[live${index + 1}] ${skill} ${args.join(' ')} (TEST_LIVE=${gate})`,
        () => {
          when(`[t0] it runs against the live ${account} account`, () => {
            // held under a key: the shared value is a proxy
            const scene = useBeforeAll(async () => ({
              result: runSkill({ skill, args }),
            }));

            then('it exits 0 and prints its result', () => {
              // the whole output rides the diff on failure, so a red run names its own cause
              expect({
                exitCode: scene.result.exitCode,
                stdout: scene.result.stdout,
                stderr: scene.result.stderr,
              }).toMatchObject({ exitCode: 0 });
              expect(scene.result.stdout).toContain(contains);
            });

            then('no account id or person handle survives the mask', () => {
              const masked = asMaskedLiveOutput({ text: scene.result.stdout });
              expect(masked).not.toMatch(/\b\d{12}\b/);
              expect(masked).not.toMatch(
                /assumed-role\/[^/\s]+\/(?!<session>)/,
              );
            });

            then('the result surface is pinned, masked', () => {
              const text = summaryOnly
                ? asSummaryTree({ text: scene.result.stdout })
                : scene.result.stdout;
              expect(asMaskedLiveOutput({ text })).toMatchSnapshot();
            });
          });
        },
      );
    },
  );

  SKILLS.forEach(({ skill, refusal }, index) => {
    given(`[case${index + 1}] ${skill}`, () => {
      when('[t0] help is asked for', () => {
        const result = runSkill({ skill, args: ['--help'] });

        then('it exits 0 and names the skill and its usage', () => {
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(skill);
          expect(result.stdout).toContain('usage');
        });

        then('the help surface is pinned', () => {
          expect(result.stdout).toMatchSnapshot();
        });
      });

      when('[t1] it is called with no args', () => {
        const result = runSkill({ skill, args: [] });

        then('it refuses with exit 2 and names what is absent', () => {
          expect(result.exitCode).toBe(2);
          expect(result.stdout + result.stderr).toContain(refusal);
        });

        then('the refusal surface is pinned', () => {
          expect({
            stdout: result.stdout,
            stderr: result.stderr,
          }).toMatchSnapshot();
        });
      });
    });
  });
});
