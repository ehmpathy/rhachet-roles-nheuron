import { S3Client } from '@aws-sdk/client-s3';
import type { PaginationInput } from 'pagination-fns';

import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import type {
  GatherMailAdapter,
  GatherMailFilter,
} from '@src/domain.objects/GatherMailAdapter';
import { getMailsWithinRange } from '@src/domain.operations/gather/mail/transformers/getMailsWithinRange';
import { getSyncStatsFromMails } from '@src/domain.operations/gather/mail/transformers/getSyncStatsFromMails';

import { getSesConfig } from '../getSesConfig';
import { getAllMailFromSes } from './getAllMailFromSes';
import { getGatheredMailFromSes } from './getGatheredMailFromSes';

/**
 * .what = ses adapter for the GatherMailAdapter interface
 * .why = enables gather.mail --from ses via the adapter pattern
 *
 * .note = auth is plain iam. the adapter takes no accessToken — the aws sdk reads
 *         the AWS_PROFILE credentials keyrack placed in the env. the interface's
 *         accessToken is therefore unused here, unlike gmail's oauth token.
 *
 * .note = takes no cwd either. the bucket + region arrive from the keyrack env via
 *         getSesConfig, so no path here is anchored to a cwd.
 */
export const getSesMailAdapter = (): GatherMailAdapter => {
  return {
    mechanism: 'ses',

    // ⚠️ SES CANNOT HONOR EITHER FILTER, so it REFUSES them rather than ignores them.
    // the inbound side is an s3 prefix of raw rfc822 — there is no search index to push a
    // query into, and rfc822 has no label concept for a `/labels=` scope to select on.
    // to accept and drop them would hand back the whole mailbox with exit 0, which reads
    // as "your filter matched it all" (rule.forbid.surprises, rule.forbid.failhide)
    getFilterRefusal: (input) => {
      if (input.filter.query !== null)
        return {
          what: 'ses cannot honor --query',
          why: 'ses mail is read from an s3 prefix of raw rfc822; there is no search index to query',
          hint: 'narrow with --since instead, or use --from gmail for a search expression',
        };

      if (input.filter.labels.length > 0)
        return {
          what: 'ses cannot honor a /labels= scope',
          why: 'labels are a gmail concept; rfc822 mail in s3 carries none',
          hint: 'drop the /labels= suffix from --address',
        };

      return null;
    },

    getAllMail: async (
      input: {
        in: {
          repo: GatheredMailRepo;
          filter: GatherMailFilter;
        };
        page: PaginationInput<{ deliveredAt: Date }>;
        exidsKnown: string[];
      },
      adapterContext: { log: GatherLogMethods; accessToken: string },
    ): Promise<{
      mails: GatheredMail[];
      stats: GatheredMailSyncStats;
      page: PaginationInput<{ deliveredAt: Date }> | null;
    }> => {
      const { repo } = input.in;
      const { log } = adapterContext;

      // read bucket + region from the keyrack-populated env
      const config = getSesConfig();

      const s3 = new S3Client({ region: config.region });

      // read every mail object under the inbound prefix that we do NOT already hold.
      // an s3 key IS the mail's exid here, so the caller's cached exids name keys directly —
      // no cast, no second identity. to skip them turns a re-run's cost from O(mailbox)
      // GetObject calls into O(new)
      const { mails: objects } = await getAllMailFromSes(
        {
          bucket: config.bucket,
          prefix: config.prefix,
          s3,
          keysKnown: input.exidsKnown,
        },
        { log },
      );

      // cast each into the domain, keyed by its s3 key
      const gathered = objects.map((object) =>
        getGatheredMailFromSes({
          parsed: object.parsed,
          exid: object.key,
          receivedAt: object.receivedAt,
          ceiverAddress: repo.address,
        }),
      );

      // apply the date range after the read, since s3 cannot filter by date.
      //
      // ⚠️ what comes back is the NEW mail in range, never the whole range — the keys the
      // caller already held were skipped above, so their mail is absent here by design. the
      // caller unions this with its own cache to render the full range
      // (`setMailsFromAdapter`), which is why the skip costs no output.
      const mails = getMailsWithinRange({ mails: gathered, page: input.page });

      log.debug('ses.getAllMail: narrowed by range', {
        readQuant: gathered.length,
        keptQuant: mails.length,
      });

      const stats = getSyncStatsFromMails({ mails });

      // no next page: every object under the prefix was read in one pass
      return { mails, stats, page: null };
    },
  };
};
