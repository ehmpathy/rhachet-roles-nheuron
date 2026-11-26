import type { STSClient } from '@aws-sdk/client-sts';
import { getError, given, then, useThen, when } from 'test-fns';

import { getOneSesCallerIdentity } from './getOneSesCallerIdentity';

/**
 * .what = an sts client fake whose one send either resolves or rejects
 * .why = the communicator's two branches turn on what sts returns; a fake injected via the
 *   input is the dependency-injection seam, never a module mock
 */
const asFakeSts = (input: { send: () => Promise<unknown> }): STSClient =>
  ({ send: input.send }) as unknown as STSClient; // fake: only `send` is read

/**
 * .what = an aws sdk error with a given name
 * .why = the allowlist reads `error.name`, so the fake must carry the sdk's exact name
 */
const asSdkError = (input: { name: string }): Error =>
  Object.assign(new Error(`fake ${input.name}`), { name: input.name });

const log = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('getOneSesCallerIdentity', () => {
  given('[case1] sts names an account and an arn', () => {
    when('[t0] the identity is read', () => {
      const identity = useThen('it resolves', async () =>
        getOneSesCallerIdentity(
          {
            sts: asFakeSts({
              send: async () => ({
                Account: '123456789012',
                Arn: 'arn:aws:sts::123456789012:assumed-role/power/human',
              }),
            }),
          },
          { log },
        ),
      );

      then('it returns both', () => {
        expect(identity).toEqual({
          account: '123456789012',
          arn: 'arn:aws:sts::123456789012:assumed-role/power/human',
        });
      });
    });
  });

  // each name the allowlist reads as "not authenticated", never "broken"
  const CREDENTIAL_FAULTS = [
    'CredentialsProviderError',
    'InvalidClientTokenId',
    'ExpiredToken',
    'UnrecognizedClientException',
  ];

  given('[case2] sts rejects with a credential fault', () => {
    CREDENTIAL_FAULTS.forEach((name) => {
      when(`[t0] the fault is ${name}`, () => {
        // asserted in place: a shared `useThen` result is a proxy, which cannot carry a null
        then('it returns null, which reads as anonymous', async () => {
          const identity = await getOneSesCallerIdentity(
            {
              sts: asFakeSts({
                send: async () => {
                  throw asSdkError({ name });
                },
              }),
            },
            { log },
          );
          expect(identity).toBeNull();
        });
      });
    });
  });

  given('[case3] sts rejects with a fault outside the allowlist', () => {
    when('[t0] the fault is a network timeout', () => {
      then(
        'it rethrows, so a network fault never reads as anonymous',
        async () => {
          // ⚠️ the teeth: a widened allowlist would swallow this and report 'anonymous'
          const error = await getError(
            getOneSesCallerIdentity(
              {
                sts: asFakeSts({
                  send: async () => {
                    throw asSdkError({ name: 'TimeoutError' });
                  },
                }),
              },
              { log },
            ),
          );
          expect(error.name).toEqual('TimeoutError');
        },
      );
    });
  });

  given('[case4] sts succeeds but names no account', () => {
    when('[t0] the identity is read', () => {
      then(
        'it throws, since an unlock cannot fix a malformed response',
        async () => {
          const error = await getError(
            getOneSesCallerIdentity(
              {
                sts: asFakeSts({
                  send: async () => ({
                    Arn: 'arn:aws:sts::123456789012:assumed-role/x/y',
                  }),
                }),
              },
              { log },
            ),
          );
          expect(error.message).toContain('named no account or arn');
        },
      );
    });
  });
});
