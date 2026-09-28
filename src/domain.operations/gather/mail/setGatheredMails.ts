import { BadRequestError } from 'helpful-errors';

import type { GatheredMailMechanism } from '@src/domain.objects/GatheredMailMechanism';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import { getAuthAdapterForMechanism } from '@src/domain.operations/gather/adapters/getAuthAdapterForMechanism';
import { getMailAdapterForMechanism } from '@src/domain.operations/gather/adapters/getMailAdapterForMechanism';

import { genAuthReady } from './genAuthReady';
import { setGatheredMailOutput } from './setGatheredMailOutput';
import { setMailsFromAdapter } from './setMailsFromAdapter';
import { getAddressScope } from './transformers/getAddressScope';
import { getAllLabelsFromScope } from './transformers/getAllLabelsFromScope';

/**
 * .what = root dispatcher for gather.mail skill
 * .why = orchestrates address parse + auth + fetch + output
 *
 * narrative steps:
 *   1. getAddressScope → parse address
 *   2. getAuthAdapterForMechanism → select auth adapter
 *   3. getMailAdapterForMechanism → select mail adapter
 *   4. genAuthReady → guard: fail-fast if not authenticated
 *   5. setMailsFromAdapter → fetch mails (uses adapter + cache under the hood)
 *   6. setGatheredMailOutput → format and emit with stats
 */
export const setGatheredMails = async (
  input: {
    mechanism: GatheredMailMechanism;
    address: string;
    since: string | null;
    query: string | null;
    format: 'tree' | 'json';
  },
  context: {
    log: GatherLogMethods;
    setStdout: (content: string) => void;
    cwd: string | null;
  },
): Promise<void> => {
  // parse address, and read the labels its scope carries — an unhonorable scope key throws
  // here rather than widen the result silently
  const addressScope = getAddressScope({ address: input.address });
  const labels = getAllLabelsFromScope({ scope: addressScope.scope });

  // build repo from mechanism + parsed address
  const repo: GatheredMailRepo = {
    mechanism: input.mechanism,
    address: addressScope.address.formed,
  };

  // select adapters
  const authAdapter = getAuthAdapterForMechanism({
    mechanism: input.mechanism,
    cwd: context.cwd,
  });
  const mailAdapter = getMailAdapterForMechanism({
    mechanism: input.mechanism,
    cwd: context.cwd,
  });

  const filter = { query: input.query, labels };

  // ⚠️ refuse an unhonorable filter BEFORE the auth check. no credential makes an unservable
  // flag servable, so if this ran after, an unauthenticated human who typed `--query` against
  // ses would be told "not authenticated: run keyrack unlock" — sent to fix a credential that
  // was never the problem (`rule.require.errors-name-the-fix`). only the adapter knows its
  // mechanism's search language, and `getFilterRefusal` is pure precisely so it can answer here
  const refusal = mailAdapter.getFilterRefusal({ filter });
  if (refusal)
    BadRequestError.throw(refusal.what, {
      filter,
      why: refusal.why,
      hint: refusal.hint,
    });

  // guard: fail-fast if not authenticated; get token for downstream
  const { accessToken } = await genAuthReady(
    { repo, authAdapter },
    { log: context.log },
  );

  // fetch mails. the filter rides ALONG rather than applies here: only the adapter knows
  // its mechanism's search language, and only it can say whether it can honor one.
  // the RANGE is built downstream, where the prior run's cursor is in hand — an absent
  // `--since` falls back to it, which is what makes a bare re-run incremental
  const result = await setMailsFromAdapter(
    { in: { repo, filter }, since: input.since, limit: 500 },
    { mailAdapter, log: context.log, accessToken, cwd: context.cwd },
  );

  // format and emit
  setGatheredMailOutput(
    {
      mails: result.mails,
      stats: result.stats,
      address: addressScope.address.formed,
      filter,
      format: input.format,
    },
    { setStdout: context.setStdout },
  );
};
