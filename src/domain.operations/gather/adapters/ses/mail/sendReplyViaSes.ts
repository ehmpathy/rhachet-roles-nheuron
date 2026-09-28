import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';

import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';

import { getSesConfig } from '../getSesConfig';
import { asRawMimeMessage } from './asRawMimeMessage';

/**
 * .what = send a mail from a mailbox on the verified ses domain
 * .why = the respond path — the clone answers from the same address it reads.
 *        `ses:SendRawEmail` is the one call the least-privilege grant allows, and
 *        the grant scopes its `ses:FromAddress` to the mail domain.
 *
 * .note = auth is plain iam. the aws sdk reads the AWS_PROFILE credentials that
 *         keyrack placed in the env, so this takes no token.
 *
 * .note = this is the ses V1 send api, used against a v2-verified identity. that
 *         combination is deliberate and works — v1 and v2 share one set of
 *         identities. it is also LOAD-BEARING: the least-privilege grant allows the
 *         v1 action `ses:SendRawEmail`. a swap to the v2 `SendEmailCommand` needs
 *         the action `ses:SendEmail`, so a swap made without that grant edit fails
 *         with AccessDenied at send time rather than at compile time.
 *
 * ⚠️ .note = NOT IDEMPOTENT — the one such operation in this behavior. a second call
 *         with identical input sends a SECOND mail; the recipient sees two. this is
 *         intrinsic, not an oversight: `SendRawEmail` takes no idempotency key (unlike
 *         stripe's charge api), and a send has no natural key to upsert on, so neither
 *         rung of `rule.require.idempotent-operations` is reachable. the mutation is
 *         an append to the world.
 *
 *         THE VERB CARRIES THAT. it is `send*`, never `set*`:
 *         `rule.require.get-set-gen-verbs` declares `set` an idempotent upsert, so a
 *         `setReplyViaSes` would have promised at every call site the one guarantee
 *         this cannot keep. `send` is the domain's own imperative — the same carve-out
 *         the brief grants `dispatchTask` / `enqueueTask` — and it reads as an append
 *         rather than a converge.
 *
 *         SO: a caller must NOT blind-retry this. wrap it in a caller-side guard that
 *         records what was already sent — a per-mail sent-marker beside the cache — or
 *         accept a duplicate on every retry. it is deliberately left uncomposed today
 *         (no cli surface calls it) so that guard is designed WITH its first caller
 *         rather than guessed at now.
 */
export const sendReplyViaSes = async (
  input: {
    /**
     * the mailbox to send as — must sit on the verified ses domain
     */
    from: string;

    /**
     * who receives the reply
     */
    to: string;

    /**
     * the subject line
     */
    subject: string;

    /**
     * the plain-text body
     */
    body: string;

    /**
     * the Message-ID of the mail this answers, if it answers one. threads the
     * reply via In-Reply-To + References so a mail client nests it correctly.
     */
    inReplyTo: string | null;
  },
  context: { log: GatherLogMethods },
): Promise<{ messageId: string }> => {
  const { log } = context;

  const config = getSesConfig();

  // the config set is send-only, so `getSesConfig` leaves it null rather than gate the
  // read path on it. the send is where it becomes required — and it is required rather
  // than optional because a send without it emits no bounce or complaint event, and a
  // silently unobserved send is worse than one that refused (rule.forbid.failhide)
  if (!config.configSet)
    BadRequestError.throw('ses config set absent, cannot send', {
      expected: ['SES_CONFIG_SET'],
      why: 'ses binds a configuration set per-send; without one, no bounce, complaint, or delivery event is emitted',
      hint: 'run: rhx keyrack unlock --owner ehmpath --env prep',
    });

  const ses = new SESClient({ region: config.region });

  const raw = asRawMimeMessage({
    from: input.from,
    to: input.to,
    subject: input.subject,
    body: input.body,
    inReplyTo: input.inReplyTo,
  });

  log.debug('ses.sendReply: send', {
    from: input.from,
    to: input.to,
    inReplyTo: input.inReplyTo,
  });

  // name the config set on the send. ses binds a configuration set PER-SEND — an
  // identity carries no default — so a send that omits it emits no bounce,
  // complaint, or delivery event, and the declared cloudwatch destination would
  // sit silent while every send looked fine.
  const response = await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(raw, 'utf-8') },
      ConfigurationSetName: config.configSet,
    }),
  );

  if (!response.MessageId)
    throw new UnexpectedCodePathError('ses send returned no message id', {
      from: input.from,
      to: input.to,
      hint: 'a successful SendRawEmail always carries a MessageId',
    });

  log.debug('ses.sendReply: sent', { messageId: response.MessageId });

  return { messageId: response.MessageId };
};
