import { UnexpectedCodePathError } from 'helpful-errors';

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * .what = the live mechanisms a `TEST_LIVE` flag may name for a provision wish
 */
export type ProvisionLiveMechanism = 'ses' | 'cloudflare' | 'aws.accounts';

/**
 * .what = whether the `TEST_LIVE` flag targets this live provider
 * .why = a provision plan reads every declared resource from the real provider, which needs
 *   credentials ci never holds. the case runs when a human names the mechanism; once named,
 *   an absent credential fails the plan loud — the flag is a demand for proof, never a skip.
 *   the contract: `.agent/repo=.this/role=any/briefs/howto.run-live-mail-tests.md`.
 */
export const isProvisionLiveTargeted = (input: {
  mechanism: ProvisionLiveMechanism;
}): boolean =>
  (process.env.TEST_LIVE ?? '')
    .split(',')
    .map((part) => part.trim())
    .includes(input.mechanism);

/**
 * .what = a change the live plan proposed for one declared resource
 */
export interface PlanChangeLive {
  forResource: { class: string; slug: string };
  action: string;
}

/**
 * .what = run `declastruct plan` for a wish against the live provider, and read the plan back
 * .why = the plan is the real call: for each declared resource, the provider's dao reads the
 *   remote state and diffs it against the declared one. a plan that completes proves the
 *   credentials, the provider, and every declared shape round-trip against the real service
 *
 * .note = runs the cli rather than an in-process call, so the case exercises the exact path a
 *   human runs (`npx declastruct plan --wish …`), keyrack source and all
 */
export const getPlanOfWishLive = (input: {
  wish: string;
}): { changes: PlanChangeLive[] } => {
  const into = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'provision-plan-live-')),
    'plan.json',
  );

  // run the plan; a non-zero exit throws here with the cli's own stderr attached
  execSync(`npx declastruct plan --wish '${input.wish}' --into '${into}'`, {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    timeout: 300_000,
  });

  // read the plan back; an absent file means the cli exited 0 without a plan
  if (!fs.existsSync(into))
    UnexpectedCodePathError.throw('declastruct plan wrote no plan file', {
      wish: input.wish,
      into,
    });
  return JSON.parse(fs.readFileSync(into, 'utf-8'));
};
