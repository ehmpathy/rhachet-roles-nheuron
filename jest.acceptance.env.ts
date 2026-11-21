import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import util from 'util';

import { keyrack } from 'rhachet/keyrack';

// eslint-disable-next-line no-undef
jest.setTimeout(90000); // we're calling downstream apis

// set console.log to not truncate nested objects
util.inspect.defaultOptions.depth = 5;

/**
 * .what = verify that we're running from a valid project directory; otherwise, fail fast
 * .why = prevent confusion and hard-to-debug errors from running tests in the wrong directory
 */
if (!existsSync(join(process.cwd(), 'package.json')))
  throw new Error('no package.json found in cwd. are you @gitroot?');

/**
 * .what = verify that the env has sufficient auth to run the tests if aws is used; otherwise, fail fast
 * .why =
 *   - prevent time wasted waiting on tests to fail due to lack of credentials
 *   - prevent time wasted debugging tests which are failing due to hard-to-read missed credential errors
 */
const declapractUsePath = join(process.cwd(), 'declapract.use.yml');
const requiresAwsAuth =
  existsSync(declapractUsePath) &&
  readFileSync(declapractUsePath, 'utf8').includes('awsAccountId');
if (
  requiresAwsAuth &&
  !(process.env.AWS_PROFILE || process.env.AWS_ACCESS_KEY_ID)
)
  throw new Error(
    'no aws credentials present. please authenticate with aws to run acceptance tests',
  );

/**
 * .what = source credentials from keyrack for test env
 * .why = auto-inject the declared keys into process.env, so every credential this suite
 *   reads has one source (`rule.require.credentials-from-keyrack`).
 *
 * .note = `mode: 'lenient'` is deliberate, and it is NOT a licence to skip. the suite spans
 *   two mechanisms — gmail and ses — whose keys are disjoint, so strict mode would fail the
 *   whole run over a key only one of them needs. leniency here moves the demand from the
 *   SOURCE boundary to the USE boundary, where the value is actually needed and where the
 *   error can name which one is absent. this mirrors the provision wishes, which source
 *   lenient and then fail loud in `getProviders` / `getSesConfig` with the exact fix.
 *
 * ⚠️ .note = leniency is sound ONLY where every use boundary fails LOUD, so that is the
 *   invariant this mode depends on: a suite that reads a lenient-sourced key must throw a
 *   `ConstraintError` that names the fix, never skip. `gatherMail.acceptance.test.ts`
 *   [case7] once broke it with a `when.runIf(hasCredentials)` skip — the suite went green
 *   while its only positive path had never run — and now throws. add no new skip here; a
 *   skip converts this leniency into the silent pass `rule.forbid.failhide` grades a blocker.
 */
const keyrackYmlPath = join(process.cwd(), '.agent/keyrack.yml');
if (existsSync(keyrackYmlPath))
  keyrack.source({ env: 'test', owner: 'ehmpath', mode: 'lenient' });
