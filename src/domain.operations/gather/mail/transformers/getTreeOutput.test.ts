import { given, then, when } from 'test-fns';

import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

import { MAIL_CONTENT_OBFUSCATED } from './getMailContentVisible';
import { getTreeOutput } from './getTreeOutput';

const createMail = (overrides: Partial<GatheredMail> = {}): GatheredMail =>
  new GatheredMail({
    exid: 'msg_123',
    ceiver: new GatheredMailRepo({
      mechanism: 'ses',
      address: 'test@example.com',
    }),
    sender: new GatheredMailRepo({
      mechanism: 'ses',
      address: 'sender@example.com',
    }),
    subject: 'Test Subject',
    snippet: 'Test snippet preview',
    body: 'Full body content',
    deliveredAt: new Date('2024-01-15T12:00:00Z'),
    attachments: [],
    isObfuscated: false,
    ...overrides,
  });

describe('getTreeOutput', () => {
  given('[case1] a run with no mails', () => {
    when('[t0] the tree is formed', () => {
      then('formats header with the three counts', () => {
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          mailFoundQuant: 42,
          mailSyncedQuant: 10,
        });

        const result = getTreeOutput({
          mails: [],
          stats,
          address: 'jelly@example.com',
          mechanism: 'ses',
        });

        expect(result).toContain('boop!');
        // the header is a command a human can rerun: --from is required, so it is echoed
        expect(result).toContain(
          'gather.mail --from ses --address jelly@example.com',
        );
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
          address: 'test@example.com',
          mechanism: 'ses',
        });

        expect(result).toContain('no mails to display');
      });
    });
  });

  given('[case2] an ordinary mail', () => {
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
          address: 'test@example.com',
          mechanism: 'ses',
        });

        expect(result).toContain('2024-01-15');
        expect(result).toContain('sender@example.com');
        expect(result).toContain('Test Subject');
      });
    });
  });

  given('[case3] an obfuscated mail', () => {
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
          address: 'test@example.com',
          mechanism: 'ses',
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
   * .why = every test above asserts on a text fragment, which proves a field is present and
   *   says naught about how the block reads. `listed`/`synced`/`cached` are three counts
   *   that a single `found:` once conflated; whether they read clearly together is a
   *   judgment only a human makes, from the whole block.
   *
   * .note = paired with the assertions above, never instead of them
   *   (`rule.require.snapshots.[lesson]`) — the assertions verify function, the snapshot
   *   carries the aesthetic to the reviewer.
   */
  given('[case4] a run that lists less than the cache holds', () => {
    when('[t0] the tree is formed', () => {
      then('renders the header and list, for a human to vibecheck', () => {
        const tree = getTreeOutput({
          mails: [
            createMail(),
            createMail({ exid: 'msg_456', subject: 'Second' }),
          ],
          stats: new GatheredMailSyncStats({
            mailFoundUptil: new Date('2024-01-15T12:00:00Z'),
            mailFoundQuant: 250,
            mailSyncedQuant: 2,
          }),
          address: 'jelly@example.com',
          mechanism: 'ses',
        });

        // function: the three counts, each its own line
        expect(tree).toContain('├─ listed: 2');
        expect(tree).toContain('├─ synced: 2');
        expect(tree).toContain('cached: 250');

        // aesthetic: the whole block, for the reviewer
        expect(tree).toMatchSnapshot();
      });
    });
  });
});
