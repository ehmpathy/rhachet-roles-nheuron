import { given, then, when } from 'test-fns';

import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

import { MAIL_CONTENT_OBFUSCATED } from './getMailContentVisible';
import { getTreeOutput } from './getTreeOutput';

/** the bare run — no query, no labels */
const FILTER_WHOLE: GatherMailFilter = { query: null, labels: [] };

const createMail = (overrides: Partial<GatheredMail> = {}): GatheredMail =>
  new GatheredMail({
    exid: 'msg_123',
    ceiver: new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'test@gmail.com',
    }),
    sender: new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'sender@gmail.com',
    }),
    subject: 'Test Subject',
    snippet: 'Test snippet preview',
    body: 'Full body content',
    deliveredAt: new Date('2024-01-15T12:00:00Z'),
    labels: ['INBOX'],
    attachments: [],
    isObfuscated: false,
    ...overrides,
  });

describe('getTreeOutput', () => {
  given('[case1] a bare run with no mails', () => {
    when('[t0] the tree is formed', () => {
      then('formats header with the scope and the three counts', () => {
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          mailFoundQuant: 42,
          mailSyncedQuant: 10,
        });

        const result = getTreeOutput({
          mails: [],
          stats,
          address: 'vlad@gmail.com',
          mechanism: 'gmail',
          filter: FILTER_WHOLE,
        });

        expect(result).toContain('boop!');
        // the header is a command a human can rerun: --from is required, so it is echoed
        expect(result).toContain(
          'gather.mail --from gmail --address vlad@gmail.com',
        );
        expect(result).toContain('scope: whole mailbox');
        expect(result).toContain('synced: 10');
        expect(result).toContain('cached: 42');

        // ⚠️ `found` said all three of these at once — the cache total, this run's fetch, and
        // the mails listed below it. one label, three sets (`rule.forbid.ambiguous-labels`)
        expect(result).not.toContain('found:');
      });

      then('handles empty mails array', () => {
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          mailFoundQuant: 0,
          mailSyncedQuant: 0,
        });

        const result = getTreeOutput({
          mails: [],
          stats,
          address: 'test@gmail.com',
          mechanism: 'gmail',
          filter: FILTER_WHOLE,
        });

        expect(result).toContain('no mails to display');
      });
    });
  });

  given('[case2] a run narrowed by a filter', () => {
    when('[t0] the tree is formed', () => {
      then('a filtered run states its scope, and counts what it lists', () => {
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          // the cache holds 42 for this address — from every scope ever gathered against it
          mailFoundQuant: 42,
          mailSyncedQuant: 1,
        });

        const result = getTreeOutput({
          mails: [createMail()],
          stats,
          address: 'vlad@gmail.com',
          mechanism: 'gmail',
          filter: { query: 'from:boss@co.com', labels: ['work'] },
        });

        // ⚠️ the teeth. drop the scope line and a human reads `cached: 42` above ONE mail with
        // no way to tell the list was narrowed — the exact misread this line exists to stop
        expect(result).toContain('scope: labels=work query="from:boss@co.com"');
        expect(result).toContain('listed: 1');
        expect(result).toContain('cached: 42');
      });
    });
  });

  given('[case3] an ordinary mail', () => {
    when('[t0] the tree is formed', () => {
      then('formats mail items', () => {
        const mail = createMail();
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: new Date('2024-01-15T12:00:00Z'),
          mailFoundQuant: 1,
          mailSyncedQuant: 1,
        });

        const result = getTreeOutput({
          mails: [mail],
          stats,
          address: 'test@gmail.com',
          mechanism: 'gmail',
          filter: FILTER_WHOLE,
        });

        expect(result).toContain('2024-01-15');
        expect(result).toContain('sender@gmail.com');
        expect(result).toContain('Test Subject');
      });
    });
  });

  given('[case4] an obfuscated mail', () => {
    when('[t0] the tree is formed', () => {
      then('obfuscates sensitive content', () => {
        const mail = createMail({ isObfuscated: true });
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          mailFoundQuant: 1,
          mailSyncedQuant: 1,
        });

        const result = getTreeOutput({
          mails: [mail],
          stats,
          address: 'test@gmail.com',
          mechanism: 'gmail',
          filter: FILTER_WHOLE,
        });

        // ⚠️ pinned to the exported constant, not to a fragment of it. `toContain('OBFUSCATED')`
        // passed against BOTH the single source's literal and a drifted local copy, so it could
        // not tell the two apart — which is how the drift survived to the human's screen
        expect(result).toContain(MAIL_CONTENT_OBFUSCATED);
        expect(result).not.toContain('Test Subject');
      });
    });
  });

  /**
   * .what = snapshots the RENDERED shape, so a human can vibecheck it in a pr
   * .why = every test above asserts on a substring, which proves a field is present and
   *   says naught about how the block reads. the header carries four lines whose whole
   *   job is to be read together — `scope` tells you which slice you got, and
   *   `listed`/`synced`/`cached` are three counts that a single `found:` once conflated.
   *   whether that reads clearly is a judgment only a human makes, from the whole block.
   *
   * .note = paired with the assertions above, never instead of them
   *   (`rule.require.snapshots.[lesson]`) — the assertions verify function, the snapshot
   *   carries the aesthetic to the reviewer. it is a unit snapshot rather than an
   *   acceptance one on purpose: the only success-path acceptance case is the gmail
   *   service-account pair, which cannot run without credentials a human must fill
   *   (fulcrum F8), so an acceptance snapshot of this shape would never be produced.
   */
  given('[case5] a bare run and a narrowed run', () => {
    when('[t0] each tree is formed', () => {
      then(
        'renders a bare and a narrowed run, for a human to vibecheck',
        () => {
          const asStats = (input: {
            cached: number;
            synced: number;
          }): GatheredMailSyncStats =>
            new GatheredMailSyncStats({
              mailFoundUptil: new Date('2024-01-15T12:00:00Z'),
              mailFoundQuant: input.cached,
              mailSyncedQuant: input.synced,
            });

          const bare = getTreeOutput({
            mails: [
              createMail(),
              createMail({ exid: 'msg_456', subject: 'Second' }),
            ],
            stats: asStats({ cached: 250, synced: 2 }),
            address: 'vlad@gmail.com',
            mechanism: 'gmail',
            filter: FILTER_WHOLE,
          });

          // the narrowed run is the one the labels exist for: ONE mail listed, beneath a cache
          // that holds 250. a human must be able to tell "narrow scope" from "empty mailbox"
          const narrowed = getTreeOutput({
            mails: [createMail()],
            stats: asStats({ cached: 250, synced: 1 }),
            address: 'vlad@gmail.com',
            mechanism: 'gmail',
            filter: { query: 'from:boss@co.com', labels: ['work'] },
          });

          // function: each run names its own slice and its own three counts
          expect(bare).toContain('├─ scope: whole mailbox');
          expect(bare).toContain('├─ listed: 2');
          expect(bare).toContain('├─ cached: 250');
          expect(narrowed).toContain(
            '├─ scope: labels=work query="from:boss@co.com"',
          );
          expect(narrowed).toContain('├─ listed: 1');
          expect(narrowed).toContain('├─ cached: 250');

          // aesthetic: the whole block, for the reviewer
          expect({ bare, narrowed }).toMatchSnapshot();
        },
      );
    });
  });
});
