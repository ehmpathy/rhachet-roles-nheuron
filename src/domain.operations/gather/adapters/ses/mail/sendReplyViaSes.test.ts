import type { SendRawEmailCommand } from '@aws-sdk/client-ses';
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
 * .what = put an env key back to a prior value, or remove it when it had none
 * .why = `process.env.X = undefined` stores the STRING `'undefined'`, which is truthy — so a
 *   bare restore of an unset key leaks a fake config into every later suite in the worker
 */
const setEnvOrDel = (input: {
  key: string;
  value: string | undefined;
}): void => {
  if (input.value === undefined) {
    delete process.env[input.key];
    return;
  }
  process.env[input.key] = input.value;
};

/**
 * .what = a fake ses transport that records each command and answers with a message id
 * .why = injected via `context.sdkSes`, so no case crosses the aws network boundary
 */
const asFakeSes = (): {
  sdkSes: {
    send: (command: SendRawEmailCommand) => Promise<{ MessageId: string }>;
  };
  commandsSeen: SendRawEmailCommand[];
} => {
  const commandsSeen: SendRawEmailCommand[] = [];
  const sdkSes = {
    send: async (command: SendRawEmailCommand) => {
      commandsSeen.push(command);
      return { MessageId: 'fake-message-id' };
    },
  };
  return { sdkSes, commandsSeen };
};

/**
 * .what = runs a send against a deliberately-shaped env and a fake transport, then restores
 * .why = the guards under test read `getSesConfig()`, which reads the env. an assignment
 *   left behind would leak into whatever suite ran next, so the restore sits in a `finally`.
 */
const sendWithEnv = async (input: {
  env: { bucket: string; region: string; configSet: string };
  fakeSes: ReturnType<typeof asFakeSes>;
}): Promise<{ messageId: string }> => {
  const before = {
    bucket: process.env.SES_MAIL_BUCKET,
    region: process.env.SES_REGION,
    configSet: process.env.SES_CONFIG_SET,
  };

  process.env.SES_MAIL_BUCKET = input.env.bucket;
  process.env.SES_REGION = input.env.region;
  process.env.SES_CONFIG_SET = input.env.configSet;

  try {
    return await sendReplyViaSes(REPLY, {
      log,
      sdkSes: input.fakeSes.sdkSes,
    });
  } finally {
    setEnvOrDel({ key: 'SES_MAIL_BUCKET', value: before.bucket });
    setEnvOrDel({ key: 'SES_REGION', value: before.region });
    setEnvOrDel({ key: 'SES_CONFIG_SET', value: before.configSet });
  }
};

/**
 * .what = clamps the guards that stand in front of the send, and the command the send emits
 * .why = `sendReplyViaSes` is deliberately uncomposed today — no cli surface reaches it — and
 *   that scope call was read as though it covered its TESTS too. it does not: the decision was
 *   about composition, and the guards below already exist and already run. an untested guard on
 *   the one non-idempotent operation in the behavior is the worst place to leave a blind spot.
 *
 * .note = every case injects a fake transport, so no case reaches aws. the real send needs an
 *   applied, dns-verified ses identity; it lives in `sendReplyViaSes.integration.test.ts`
 *   behind `TEST_LIVE=ses`.
 */
describe('sendReplyViaSes', () => {
  given('[case1] a configured mailbox with NO config set', () => {
    when('[t0] a reply is sent', () => {
      then('it refuses rather than send an unobserved mail', async () => {
        const fakeSes = asFakeSes();
        const error = await getError(() =>
          sendWithEnv({
            env: {
              bucket: 'nheuron-mail-inbound-one',
              region: 'us-east-1',
              configSet: '',
            },
            fakeSes,
          }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('ses config set absent');
        // ⚠️ the REASON is the half that matters. ses binds a config set per-send, so a send
        // without one emits no bounce or complaint event — the declared cloudwatch
        // destination sits silent while every send looks fine (`rule.forbid.failhide`).
        // drop this guard and the mail still goes out; only the observability vanishes,
        // which is exactly why a test rather than a reviewer must hold it
        expect(error.message).toContain(
          'no bounce, complaint, or delivery event',
        );
        expect(error.message).toContain('rhx keyrack unlock');
        expect(fakeSes.commandsSeen).toHaveLength(0);
      });
    });
  });

  given('[case2] a mailbox with NO ses config at all', () => {
    when('[t0] a reply is sent', () => {
      then('the config read refuses first, before any send', async () => {
        const fakeSes = asFakeSes();
        const error = await getError(() =>
          sendWithEnv({
            env: { bucket: '', region: '', configSet: '' },
            fakeSes,
          }),
        );

        // it must not reach the send — the absent config is the nearer, more actionable
        // cause, and it is what the human can fix
        expect(error).toBeInstanceOf(BadRequestError);
        expect(fakeSes.commandsSeen).toHaveLength(0);
      });
    });
  });

  given('[case3] a fully configured mailbox', () => {
    when('[t0] a reply is sent', () => {
      // ⚠️ this is the counterweight to [case1] and [case2]. without it, a guard that refused
      // EVERY send would still pass them both, and the respond path would be dead for a
      // correctly-configured mailbox with no test to say so.
      then('it passes both guards and returns the message id', async () => {
        const fakeSes = asFakeSes();
        const result = await sendWithEnv({
          env: {
            bucket: 'nheuron-mail-inbound-one',
            region: 'us-east-1',
            configSet: 'nheuron-mail-events',
          },
          fakeSes,
        });
        expect(result).toEqual({ messageId: 'fake-message-id' });
      });

      then('the send names the config set, once', async () => {
        const fakeSes = asFakeSes();
        await sendWithEnv({
          env: {
            bucket: 'nheuron-mail-inbound-one',
            region: 'us-east-1',
            configSet: 'nheuron-mail-events',
          },
          fakeSes,
        });
        expect(fakeSes.commandsSeen).toHaveLength(1);
        expect(fakeSes.commandsSeen[0]?.input.ConfigurationSetName).toBe(
          'nheuron-mail-events',
        );
      });
    });
  });
});
