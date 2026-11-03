import { given, then, when } from 'test-fns';

import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherMailFilter } from '@src/domain.objects/GatherMailAdapter';

import { getJsonOutput } from './getJsonOutput';
import { MAIL_CONTENT_OBFUSCATED } from './getMailContentVisible';

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
    labels: ['INBOX', 'UNREAD'],
    attachments: ['doc.pdf'],
    isObfuscated: false,
    ...overrides,
  });

describe('getJsonOutput', () => {
  given('[case1] an ordinary mail and its stats', () => {
    when('[t0] the output is formed', () => {
      then('formats mails as JSON', () => {
        const mail = createMail();
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: new Date('2024-01-15T12:00:00Z'),
          mailFoundQuant: 42,
          mailSyncedQuant: 10,
        });

        const result = getJsonOutput({
          mails: [mail],
          stats,
          filter: FILTER_WHOLE,
        });
        const parsed = JSON.parse(result);

        expect(parsed.stats.cached).toBe(42);
        expect(parsed.stats.synced).toBe(10);
        expect(parsed.mails).toHaveLength(1);
        expect(parsed.mails[0].exid).toBe('msg_123');
        expect(parsed.mails[0].subject).toBe('Test Subject');
      });
    });
  });

  given('[case2] an obfuscated mail', () => {
    when('[t0] the output is formed', () => {
      then('obfuscates sensitive content', () => {
        const mail = createMail({ isObfuscated: true });
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          mailFoundQuant: 1,
          mailSyncedQuant: 1,
        });

        const result = getJsonOutput({
          mails: [mail],
          stats,
          filter: FILTER_WHOLE,
        });
        const parsed = JSON.parse(result);

        // ⚠️ pinned to the exported constant — see the peer note in `getTreeOutput.test.ts`
        expect(parsed.mails[0].subject).toBe(MAIL_CONTENT_OBFUSCATED);
        expect(parsed.mails[0].snippet).toBe(MAIL_CONTENT_OBFUSCATED);
        expect(parsed.mails[0].isObfuscated).toBe(true);
      });
    });
  });

  given('[case3] an empty mails array', () => {
    when('[t0] the output is formed', () => {
      then('handles empty mails array', () => {
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          mailFoundQuant: 0,
          mailSyncedQuant: 0,
        });

        const result = getJsonOutput({
          mails: [],
          stats,
          filter: FILTER_WHOLE,
        });
        const parsed = JSON.parse(result);

        expect(parsed.mails).toEqual([]);
        expect(parsed.stats.cached).toBe(0);
      });
    });
  });

  given('[case4] a run narrowed by a filter', () => {
    when('[t0] the output is formed', () => {
      then('emits the scope, so stats and mails are tellable apart', () => {
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: null,
          // the cache holds 42 for this address — from every scope ever gathered against it
          mailFoundQuant: 42,
          mailSyncedQuant: 1,
        });

        const result = getJsonOutput({
          mails: [createMail()],
          stats,
          filter: { query: 'from:boss@co.com', labels: ['work'] },
        });
        const parsed = JSON.parse(result);

        // ⚠️ the teeth. without `scope`, a consumer reads a bare 42 beside one mail and cannot
        // tell whether the 42 counts the list it was handed. `mails` is the scope's result;
        // `stats` is the whole local cache for the address
        expect(parsed.scope).toEqual({
          query: 'from:boss@co.com',
          labels: ['work'],
        });
        expect(parsed.mails).toHaveLength(1);
        expect(parsed.stats.cached).toBe(42);
      });
    });
  });

  /**
   * .what = clamps that the json names its counts with the SAME three words the tree does
   * .why = ⚠️ these two are the two outputs of ONE command. the tree calls the cache count
   *   `cached`; if the json calls the same number `mailFoundQuant`, a human who reads a tree
   *   beside an automation's output has to work out they are one value
   *   (`rule.require.ubiqlang`). worse, the raw field names are ambiguous on their own —
   *   `mailFoundQuant` reads as "how many mails were found", which is exactly what a reader
   *   takes `mails` to be. that ambiguity is the defect the tree's labels closed, and the
   *   json re-opened it (`rule.forbid.ambiguous-labels`).
   *
   * .note = an automation is MORE vulnerable to an ambiguous label than a human, never less.
   *   a human re-reads and recovers; a key read against the wrong sense fails silently.
   */
  given('[case5] three distinct counts', () => {
    when('[t0] the output is formed', () => {
      then(
        'names its three counts as the tree does — listed, synced, cached',
        () => {
          const stats = new GatheredMailSyncStats({
            mailFoundUptil: null,
            // three DISTINCT numbers, so no assertion can pass by coincidence
            mailFoundQuant: 42,
            mailSyncedQuant: 7,
          });

          const result = getJsonOutput({
            mails: [createMail()],
            stats,
            filter: { query: 'from:boss@co.com', labels: [] },
          });
          const parsed = JSON.parse(result);

          // the three sets, each named for which set it counts
          expect(parsed.stats.listed).toBe(1); // matches `mails` below it
          expect(parsed.stats.synced).toBe(7); // what THIS run fetched
          expect(parsed.stats.cached).toBe(42); // the whole local store for the address
          expect(parsed.stats.listed).toBe(parsed.mails.length);

          // ⚠️ the teeth. the raw domain names must NOT reappear here — one command, one word
          // per concept. re-emit them and a consumer has two vocabularies for three numbers
          expect(parsed.stats.mailFoundQuant).toBeUndefined();
          expect(parsed.stats.mailSyncedQuant).toBeUndefined();
        },
      );
    });
  });

  /**
   * .what = pins the WHOLE json document, key for key
   * .why = ⚠️ `--format json` is a machine contract, and the only acceptance case that ever
   *   snapshots it sits behind a gmail credential nobody has filled — so the shape shipped
   *   with no assertion that runs. a rename of three stat keys passed a full green suite and
   *   19 green acceptance snapshots; the sole check that caught it was a hand-written
   *   assertion on the three keys I happened to consider.
   *
   *   a machine consumer breaks on ANY key it did not expect, never only the ones a test
   *   author remembered. so the clamp is the whole document rather than a chosen few fields
   *   — that is exactly what a snapshot is for (`rule.require.test-coverage-by-grain`).
   *
   * .note = the shape is deterministic, so it needs no credential to pin. the acceptance
   *   case proves the cli PLUMBS to this transformer; this proves the transformer's SHAPE.
   *   the two together close the gap with no human in the loop.
   */
  given('[case6] a full document', () => {
    when('[t0] the output is formed', () => {
      then('emits a stable json document, key for key', () => {
        const stats = new GatheredMailSyncStats({
          mailFoundUptil: new Date('2024-01-15T12:00:00Z'),
          mailFoundQuant: 42,
          mailSyncedQuant: 7,
        });

        const result = getJsonOutput({
          mails: [createMail()],
          stats,
          filter: { query: 'from:boss@co.com', labels: ['work'] },
        });

        // function: the top-level keys a consumer reads, and the counts it got
        const parsed = JSON.parse(result);
        expect(Object.keys(parsed)).toEqual(['scope', 'stats', 'mails']);
        expect(parsed.stats).toEqual({
          foundUptil: '2024-01-15T12:00:00.000Z',
          listed: 1,
          synced: 7,
          cached: 42,
        });
        expect(parsed.mails).toHaveLength(1);

        // the raw string, not the parsed object — key ORDER and indentation are part of what a
        // human reads when they eyeball a pipe's output
        expect(result).toMatchSnapshot();
      });
    });
  });
});
