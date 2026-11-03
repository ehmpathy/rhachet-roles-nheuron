import { BadRequestError } from 'helpful-errors';
import { given, then, useThen, when } from 'test-fns';

import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import { sendReplyViaSes } from './sendReplyViaSes';

const log: GatherLogMethods = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * .what = whether the `TEST_LIVE` flag targets the live ses api
 * .why = a live send needs an applied, dns-verified ses identity, which ci never holds. it runs
 *   only when a human names the mechanism (`TEST_LIVE=ses`); absent the flag, it skips by name.
 *   once targeted, an absent credential still throws: the flag is a demand for proof.
 *
 * .note = a local copy of the acceptance suite's own check (two test-only callers; the
 *   wet-over-dry threshold). the contract both follow lives in
 *   `.agent/repo=.this/role=any/briefs/howto.run-live-mail-tests.md`.
 */
const isLiveTargeted = (input: { mechanism: 'gmail' | 'ses' }): boolean =>
  (process.env.TEST_LIVE ?? '')
    .split(',')
    .map((part) => part.trim())
    .includes(input.mechanism);

/**
 * .what = the mailbox the live send runs from — and to
 * .why = a self-send needs no second recipient: ses in sandbox accepts a verified identity as
 *   the recipient, and the mail lands in the same inbound store a `TEST_LIVE=ses` read proves
 */
const getSesMailboxOrThrow = (): string => {
  if (
    !process.env.SES_MAIL_BUCKET ||
    !process.env.SES_REGION ||
    !process.env.SES_CONFIG_SET
  )
    BadRequestError.throw(
      'TEST_LIVE=ses targets the live send, but ses is not configured',
      {
        expected: ['SES_MAIL_BUCKET', 'SES_REGION', 'SES_CONFIG_SET'],
        hint: 'run: rhx keyrack unlock --owner ehmpath --env prep (and AWS_PROFILE=nheuron-prep)',
      },
    );
  return 'jelly@one.nheuron.com';
};

/**
 * .what = the live send path, against the applied ses identity
 * .why = the vision commits that send works from the mailbox identity. the unit suite clamps
 *   only the guards in front of the send; this proves the send itself.
 *
 * ⚠️ .note = NOT idempotent: each run sends one real mail. that is the point of the case, and
 *   why it runs only when a human names it.
 */
describe('sendReplyViaSes', () => {
  given.runIf(isLiveTargeted({ mechanism: 'ses' }))(
    '[case1] positive path: a real send from the mailbox (TEST_LIVE=ses)',
    () => {
      when('[t0] the mailbox sends a reply to itself', () => {
        const result = useThen('ses accepts the send', async () => {
          const mailbox = getSesMailboxOrThrow();
          return sendReplyViaSes(
            {
              from: mailbox,
              to: mailbox,
              subject: `nheuron live send ${new Date().toISOString()}`,
              body: 'a live send from the TEST_LIVE=ses suite. safe to ignore.',
              inReplyTo: null,
            },
            { log },
          );
        });

        then('ses returns a message id', () => {
          expect(result.messageId).toMatch(/\S+/);
        });
      });
    },
  );
});
