import { given, then, when } from 'test-fns';

import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { getSyncStatsWithoutCursor } from './getSyncStatsWithoutCursor';

describe('getSyncStatsWithoutCursor', () => {
  given('[case1] the stats of a filtered run, with a cursor', () => {
    const stats = new GatheredMailSyncStats({
      mailFoundUptil: new Date('2026-11-24T05:57:44.000Z'),
      mailFoundQuant: 7,
      mailSyncedQuant: 3,
    });

    when('[t0] the cursor is withheld', () => {
      const result = getSyncStatsWithoutCursor({ stats });

      then('the cursor is null, so the shared cursor is not advanced', () => {
        expect(result.mailFoundUptil).toBeNull();
      });

      then('the counts pass through untouched', () => {
        expect(result.mailFoundQuant).toEqual(7);
        expect(result.mailSyncedQuant).toEqual(3);
      });
    });
  });
});
