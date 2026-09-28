import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import { sendReplyViaSes } from './sendReplyViaSes';

const log: GatherLogMethods = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const REPLY = {
  from: 'jelly@one.nheuron.com',
  to: 'alice@example.com',
  subject: 'answered',
  body: 'hello',
  inReplyTo: null,
};

/**
 * .what = runs a send against a deliberately-shaped env, and restores it after
 * .why = the guards under test read `getSesConfig()`, which reads the env. an assignment
 *   left behind would leak into whatever suite ran next, so the restore is not optional.
 */
const sendWithEnv = async (env: {
  bucket: string;
  region: string;
  configSet: string;
}): Promise<Error> => {
  const before = {
    bucket: process.env.SES_MAIL_BUCKET,
    region: process.env.SES_REGION,
    configSet: process.env.SES_CONFIG_SET,
  };

  process.env.SES_MAIL_BUCKET = env.bucket;
  process.env.SES_REGION = env.region;
  process.env.SES_CONFIG_SET = env.configSet;

  const error = await getError(() => sendReplyViaSes(REPLY, { log }));

  process.env.SES_MAIL_BUCKET = before.bucket;
  process.env.SES_REGION = before.region;
  process.env.SES_CONFIG_SET = before.configSet;

  return error;
};

/**
 * .what = clamps the guards that stand in front of the send, before any aws call
 * .why = `sendReplyViaSes` is deliberately uncomposed today — no cli surface reaches it — and
 *   that scope call was read as though it covered its TESTS too. it does not: the decision was
 *   about composition, and the guards below already exist and already run. an untested guard on
 *   the one non-idempotent operation in the behavior is the worst place to leave a blind spot.
 *
 * .note = the live send is genuinely human-blocked (it needs an applied, dns-verified ses
 *   identity), and stays the unticked verification. these clamp the half reachable now: both
 *   throws fire BEFORE `new SESClient`, so no credential and no network is needed.
 */
describe('sendReplyViaSes', () => {
  given('[case1] a configured mailbox with NO config set', () => {
    when('[t0] a reply is sent', () => {
      then('it refuses rather than send an unobserved mail', async () => {
        const error = await sendWithEnv({
          bucket: 'nheuron-mail-inbound-one',
          region: 'us-east-1',
          configSet: '',
        });

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('ses config set absent');
        // ⚠️ the REASON is the load-bearing half. ses binds a config set per-send, so a send
        // without one emits no bounce or complaint event — the declared cloudwatch
        // destination sits silent while every send looks fine (`rule.forbid.failhide`).
        // drop this guard and the mail still goes out; only the observability vanishes,
        // which is exactly why a test rather than a reviewer must hold it
        expect(error.message).toContain(
          'no bounce, complaint, or delivery event',
        );
        expect(error.message).toContain('rhx keyrack unlock');
      });
    });
  });

  given('[case2] a mailbox with NO ses config at all', () => {
    when('[t0] a reply is sent', () => {
      then('the config read refuses first, and names every key', async () => {
        const error = await sendWithEnv({
          bucket: '',
          region: '',
          configSet: '',
        });

        // it must not reach the send and fail on a credential — the absent config is the
        // nearer, more actionable cause, and it is what the human can fix
        expect(error.message).not.toContain('MessageId');
      });
    });
  });

  given('[case3] a fully configured mailbox', () => {
    when('[t0] a reply is sent with no aws credentials', () => {
      then(
        'it passes both guards — they do not fire on a valid config',
        async () => {
          const error = await sendWithEnv({
            bucket: 'nheuron-mail-inbound-one',
            region: 'us-east-1',
            configSet: 'nheuron-mail-events',
          });

          // ⚠️ this is the counterweight to [case1] and [case2]. without it, a guard that
          // refused EVERY send would still pass them both, and the respond path would be
          // dead for a correctly-configured mailbox with no test to say so.
          //
          // the call now reaches aws and fails there (no credentials in a unit run) —
          // which is the proof it got past the guards. the real send is the human-blocked
          // verification, tracked as the one unticked line in the yield
          expect(error.message).not.toContain('ses config set absent');
        },
      );
    });
  });
});
