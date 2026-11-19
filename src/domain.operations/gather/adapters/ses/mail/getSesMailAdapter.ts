import { S3Client } from '@aws-sdk/client-s3';
import type { PaginationInput } from 'pagination-fns';

import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import type { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import type { GatherMailAdapter } from '@src/domain.objects/GatherMailAdapter';
import { getMailsWithinRange } from '@src/domain.operations/gather/mail/transformers/getMailsWithinRange';
import { getSyncStatsFromMails } from '@src/domain.operations/gather/mail/transformers/getSyncStatsFromMails';

import { getSesConfig } from '../getSesConfig';
import { asGatheredMailsFromSes } from './asGatheredMailsFromSes';
import { getAllMailFromSes } from './getAllMailFromSes';

/**
 * .what = ses adapter for the GatherMailAdapter interface
 * .why = enables gather.mail --from ses via the adapter pattern
 *
 * .note = auth is plain iam. the aws sdk reads the AWS_PROFILE credentials keyrack
 *         placed in the env, so the interface's accessToken is unused here.
 *
 * .note = the bucket + region arrive from the keyrack env via getSesConfig, so no
 *         path here is anchored to a cwd.
 */
export const getSesMailAdapter = (): GatherMailAdapter => {
  return {
    mechanism: 'ses',

    getAllMail: async (
      input: {
        in: {
          repo: GatheredMailRepo;
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
      const gathered = asGatheredMailsFromSes({
        objects,
        ceiverAddress: repo.address,
      });

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
