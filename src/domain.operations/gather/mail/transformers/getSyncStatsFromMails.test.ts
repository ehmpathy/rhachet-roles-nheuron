import { given, then, when } from 'test-fns';

import { GatherContactRef } from '@src/domain.objects/GatherContactRef';
import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import {
  getLatestMailDate,
  getSyncStatsFromMails,
} from './getSyncStatsFromMails';

/**
 * .what = build a GatheredMail that holds only the field these transformers read
 * .why = both operate on deliveredAt alone, so the rest is inert scaffold
 */
const asMailAt = (input: { at: string }): GatheredMail =>
  new GatheredMail({
    exid: `inbound/${input.at}`,
    ceiver: new GatheredMailRepo({
      mechanism: 'ses',
      address: 'jelly@one.nheuron.com',
    }),
    sender: new GatherContactRef({
      mechanism: 'ses',
      address: 'alice@example.com',
    }),
    subject: 'test',
    snippet: 'test',
    body: 'test',
    deliveredAt: new Date(input.at),
    labels: [],
    attachments: [],
    isObfuscated: false,
  });

describe('getLatestMailDate', () => {
  given('[case1] an empty set of mails', () => {
    when('[t0] the latest date is read', () => {
      then('yields null, so no cursor is claimed', () => {
        expect(getLatestMailDate({ mails: [] })).toBeNull();
      });
    });
  });

  given('[case2] mails out of chronological order', () => {
    const mails = [
      asMailAt({ at: '2026-09-02T00:00:00.000Z' }),
      asMailAt({ at: '2026-09-05T00:00:00.000Z' }),
      asMailAt({ at: '2026-09-01T00:00:00.000Z' }),
    ];

    when('[t0] the latest date is read', () => {
      then('yields the max, never the last in the list', () => {
        expect(getLatestMailDate({ mails })).toEqual(
          new Date('2026-09-05T00:00:00.000Z'),
        );
      });
    });
  });
});

describe('getSyncStatsFromMails', () => {
  given('[case1] an empty set of mails', () => {
    when('[t0] stats are built', () => {
      const stats = getSyncStatsFromMails({ mails: [] });

      then('the cursor is null rather than a date', () => {
        expect(stats.mailFoundUptil).toBeNull();
      });

      then('both quants are zero', () => {
        expect(stats.mailFoundQuant).toEqual(0);
        expect(stats.mailSyncedQuant).toEqual(0);
      });
    });
  });

  given('[case2] three mails', () => {
    const mails = [
      asMailAt({ at: '2026-09-01T00:00:00.000Z' }),
      asMailAt({ at: '2026-09-05T00:00:00.000Z' }),
      asMailAt({ at: '2026-09-03T00:00:00.000Z' }),
    ];

    when('[t0] stats are built', () => {
      const stats = getSyncStatsFromMails({ mails });

      then('the cursor is the newest delivery time', () => {
        expect(stats.mailFoundUptil).toEqual(
          new Date('2026-09-05T00:00:00.000Z'),
        );
      });

      then('both quants count every mail', () => {
        expect(stats.mailFoundQuant).toEqual(3);
        expect(stats.mailSyncedQuant).toEqual(3);
      });
    });
  });
});
