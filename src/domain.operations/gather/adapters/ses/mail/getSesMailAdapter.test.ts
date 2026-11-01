import { given, then, when } from 'test-fns';

import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

import { getSesMailAdapter } from './getSesMailAdapter';

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
 * .what = clamps that ses REFUSES a filter it cannot honor, rather than drops it
 * .why = `--query` and `/labels=` were once parsed at the cli and discarded before any adapter
 *   saw them, so a filtered gather returned the WHOLE mailbox with exit 0. gmail's half of that
 *   repair is clamped by `asGmailQuery.test.ts`; this is the ses half, which had none.
 *
 * .note = ses genuinely CANNOT honor either — its inbound side is an s3 prefix of raw rfc822,
 *   with no search index and no label concept. so its correct answer is a loud refusal. a
 *   quiet acceptance would be the same lie in a new place (`rule.forbid.failhide`).
 *
 * .note = the refusal is a PURE read, never a throw from inside `getAllMail`. that is what
 *   lets the orchestrator consult it before the auth check — an acceptance case proved the
 *   cost of the alternative: an unauthenticated human who typed `--query` was told
 *   "not authenticated, run keyrack unlock", which repairs no part of an unservable flag.
 */
describe('getSesMailAdapter.getFilterRefusal', () => {
  const readRefusal = (
    filter: GatherMailFilter,
  ): { what: string; why: string; hint: string } | null =>
    getSesMailAdapter().getFilterRefusal({ filter });

  given('[case1] a --query', () => {
    when('[t0] the filter is read', () => {
      then('it refuses, and names what to do instead', () => {
        const refusal = readRefusal({
          query: 'from:boss@company.com',
          labels: [],
        });

        expect(refusal?.what).toContain('cannot honor --query');
        // the refusal names the fix, never just the symptom
        expect(refusal?.hint).toContain('--since');
      });
    });
  });

  given('[case2] a /labels= scope', () => {
    when('[t0] the filter is read', () => {
      then('it refuses, rather than return the whole mailbox', () => {
        const refusal = readRefusal({ query: null, labels: ['work'] });

        expect(refusal?.what).toContain('cannot honor a /labels= scope');
        expect(refusal?.why).toContain('labels are a gmail concept');
      });
    });
  });

  given('[case3] both a --query and a /labels= scope', () => {
    when('[t0] the filter is read', () => {
      then(
        'the query is named first — one refusal, never a merged blur',
        () => {
          const refusal = readRefusal({
            query: 'has:attachment',
            labels: ['a'],
          });

          expect(refusal?.what).toContain('cannot honor --query');
        },
      );
    });
  });

  given('[case4] no filter at all', () => {
    when('[t0] the filter is read', () => {
      then('null comes back — the guards do NOT fire spuriously', () => {
        // ⚠️ without this case, a member that refused EVERY call would still pass case1–case3,
        // and `gather.mail --from ses` would be dead for every human
        expect(readRefusal({ query: null, labels: [] })).toEqual(null);
      });
    });
  });

  given('[case5] a purity claim the orchestrator depends on', () => {
    // save, blank, and restore the env around the case. `afterAll` runs however the case
    // exits, and an unset key is deleted, never assigned — `process.env.X = undefined`
    // stores the truthy string 'undefined' and leaks it to every later suite in the worker
    const envPrior = {
      bucket: process.env.SES_MAIL_BUCKET,
      region: process.env.SES_REGION,
    };
    beforeAll(() => {
      process.env.SES_MAIL_BUCKET = '';
      process.env.SES_REGION = '';
    });
    afterAll(() => {
      setEnvOrDel({ key: 'SES_MAIL_BUCKET', value: envPrior.bucket });
      setEnvOrDel({ key: 'SES_REGION', value: envPrior.region });
    });

    when('[t0] the filter is read with NO ses config in the env', () => {
      then('it still answers — it reads no env and opens no client', () => {
        const refusal = readRefusal({ query: 'has:attachment', labels: [] });

        // the contract says PURE, and the orchestrator calls this BEFORE it authenticates.
        // reach for `getSesConfig()` inside it and this goes red rather than silently
        // re-introduce the credential misdirection
        expect(refusal?.what).toContain('cannot honor --query');
      });
    });
  });
});
