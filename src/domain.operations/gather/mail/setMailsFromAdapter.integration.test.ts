import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { given, then, useBeforeAll, when } from 'test-fns';

import { GatherContactRef } from '@src/domain.objects/GatherContactRef';
import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';
import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';
import type { GatherMailAdapter } from '@src/domain.objects/GatherMailAdapter';

import { setMailsFromAdapter } from './setMailsFromAdapter';

/**
 * .what = clamps that a re-run over the same range CONVERGES rather than double-counts
 * .why = `mailFoundQuant` claims to be "total mails found and cached". it was once
 *   accumulated as `prior + thisRun`, so a second `gather.mail` over the same range
 *   re-fetched the same mails and added their count again — the persisted number climbed
 *   on every run while the cache it described stayed correct. the drift is silent: no
 *   error, no failed test, just a total that lies more each time.
 *
 * .note = [t1] is the teeth. under the old accumulate, the second run reports 4 for a
 *   mailbox that holds 2.
 */
const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const REPO = new GatheredMailRepo({
  mechanism: 'ses',
  address: 'rerun@example.com',
});

/** two mails, always the same two — exactly what a re-run over one range would re-fetch */
const getFakeMailAdapter = (): GatherMailAdapter => {
  const mails = [
    new GatheredMail({
      exid: 'mail-alpha',
      ceiver: REPO,
      sender: new GatherContactRef({
        mechanism: 'ses',
        address: 'sender@example.com',
      }),
      subject: 'alpha',
      snippet: 'alpha snippet',
      body: null,
      deliveredAt: new Date('2026-08-01T10:00:00Z'),
      attachments: [],
      isObfuscated: false,
    }),
    new GatheredMail({
      exid: 'mail-bravo',
      ceiver: REPO,
      sender: new GatherContactRef({
        mechanism: 'ses',
        address: 'sender@example.com',
      }),
      subject: 'bravo',
      snippet: 'bravo snippet',
      body: null,
      deliveredAt: new Date('2026-08-02T10:00:00Z'),
      attachments: [],
      isObfuscated: false,
    }),
  ];

  return {
    mechanism: 'ses',
    getAllMail: async () => ({
      mails,
      stats: new GatheredMailSyncStats({
        mailFoundUptil: new Date('2026-08-02T10:00:00Z'),
        mailFoundQuant: mails.length,
        mailSyncedQuant: mails.length,
      }),
      page: null,
    }),
  };
};

describe('setMailsFromAdapter', () => {
  const testDir = path.join(
    os.tmpdir(),
    'gather-rerun-test',
    Date.now().toString(),
  );

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  given('[case1] an adapter that returns the same two mails every call', () => {
    const runOnce = async (): Promise<GatheredMailSyncStats> => {
      const result = await setMailsFromAdapter(
        {
          in: { repo: REPO },
          since: null,
          limit: 500,
        },
        {
          mailAdapter: getFakeMailAdapter(),
          log,
          accessToken: 'token',
          cwd: testDir,
        },
      );
      return result.stats;
    };

    when('[t0] gather runs once', () => {
      const statsFirst = useBeforeAll(async () => runOnce());

      then('the total is the two mails it found', () => {
        expect(statsFirst.mailFoundQuant).toEqual(2);
      });
    });

    when('[t1] gather runs a SECOND time over the same range', () => {
      const statsSecond = useBeforeAll(async () => {
        await runOnce();
        return runOnce();
      });

      then('the total stays 2 — it converges, never accumulates', () => {
        // under the old `statsPrior + statsDelta` this read 4, then 6, then 8 … while
        // the cache held exactly 2 the whole time
        expect(statsSecond.mailFoundQuant).toEqual(2);
      });

      then('the cursor holds at the newest mail, never regresses', () => {
        expect(statsSecond.mailFoundUptil).toEqual(
          new Date('2026-08-02T10:00:00Z'),
        );
      });
    });
  });

  /**
   * .what = clamps that a bare re-run is INCREMENTAL — the prior cursor becomes its bound
   * .why = `mailFoundUptil` was computed, cursor-regression-guarded, and persisted on every
   *   run, and then read by no one: the range was built from the `--since` flag alone, one
   *   layer up, where the cursor was not in hand. so both the field's doc-comment and the
   *   role readme promised "subsequent calls only fetch new mail since last sync" while every
   *   run re-scanned the whole window (`rule.forbid.surprises`).
   *
   * .note = `getPaginationInput.test.ts` clamps the precedence in isolation. THIS clamps that
   *   the cursor reaches it at all. under the old code [t1] below sees `undefined`.
   */
  given('[case2] a repo whose prior run left a cursor', () => {
    // .note = the bound comes back WRAPPED. `useBeforeAll` hands out a proxy that defers
    //   property access, so a bare Date read through it compares as `{}` — the value must
    //   be reached through a key
    const runAndReadBound = async (input: {
      since: string | null;
    }): Promise<{ bound: Date | undefined }> => {
      const seen: Array<Date | undefined> = [];

      const recorder: GatherMailAdapter = {
        mechanism: 'ses',
        getAllMail: async (adapterInput) => {
          seen.push(adapterInput.page.range.since?.deliveredAt);
          return {
            mails: [],
            stats: new GatheredMailSyncStats({
              mailFoundUptil: null,
              mailFoundQuant: 0,
              mailSyncedQuant: 0,
            }),
            page: null,
          };
        },
      };

      await setMailsFromAdapter(
        {
          in: { repo: REPO },
          since: input.since,
          limit: 500,
        },
        { mailAdapter: recorder, log, accessToken: 'token', cwd: testDir },
      );

      return { bound: seen[0] };
    };

    when('[t0] a first run seeds the cursor', () => {
      const bound = useBeforeAll(async () => {
        // the [case1] adapter persists mailFoundUptil = 2026-08-02
        await setMailsFromAdapter(
          {
            in: { repo: REPO },
            since: null,
            limit: 500,
          },
          {
            mailAdapter: getFakeMailAdapter(),
            log,
            accessToken: 'token',
            cwd: testDir,
          },
        );
        return runAndReadBound({ since: null });
      });

      then('the NEXT bare run is bounded by that cursor', () => {
        // ⚠️ the teeth. under the old code this was `undefined` — no lower bound at all,
        // so every run re-scanned the whole mailbox while the docs claimed otherwise
        expect(bound.bound).toEqual(new Date('2026-08-02T10:00:00Z'));
      });
    });

    when('[t1] an explicit --since is given instead', () => {
      const bound = useBeforeAll(async () =>
        runAndReadBound({ since: '2026-01-01T00:00:00Z' }),
      );

      then('the caller wins — the cursor never overrides them', () => {
        expect(bound.bound).toEqual(new Date('2026-01-01T00:00:00Z'));
      });
    });
  });

  /**
   * .what = clamps that the fetch skip costs NO output
   * .why = `exidsKnown` lets an adapter skip a re-read of a mail the cache already holds —
   *   ses saves a whole s3 GetObject per held key. but the mails it skips are then ABSENT
   *   from what it returns. take the output from there and a second `gather.mail` over an
   *   unchanged mailbox reports fewer mails than the first, which reads as "mail
   *   disappeared" (`rule.forbid.surprises`).
   *
   * .note = `exidsKnown` narrows what is FETCHED, never what is SEEN. the range is read back
   *   out of the cache, which holds the union of every run. this is the same move
   *   `mailFoundQuant` already makes — count from the cache rather than accumulate.
   */
  given(
    '[case3] an adapter that returns ONLY what it was not told we hold',
    () => {
      const REPO_SKIP = new GatheredMailRepo({
        mechanism: 'ses',
        address: 'skip@example.com',
      });

      const asMail = (input: { exid: string; at: string }): GatheredMail =>
        new GatheredMail({
          exid: input.exid,
          ceiver: REPO_SKIP,
          sender: new GatherContactRef({
            mechanism: 'ses',
            address: 'sender@example.com',
          }),
          subject: input.exid,
          snippet: `${input.exid} snippet`,
          body: null,
          deliveredAt: new Date(input.at),
          attachments: [],
          isObfuscated: false,
        });

      /** the mailbox holds these two, always — a skipper returns only the ones not yet held */
      const MAILBOX = [
        asMail({ exid: 'mail-one', at: '2026-08-01T10:00:00Z' }),
        asMail({ exid: 'mail-two', at: '2026-08-02T10:00:00Z' }),
      ];

      const getSkipperAdapter = (): GatherMailAdapter => ({
        mechanism: 'ses',
        getAllMail: async (input) => {
          const held = new Set(input.exidsKnown);
          const mails = MAILBOX.filter((mail) => !held.has(mail.exid));
          return {
            mails,
            stats: new GatheredMailSyncStats({
              mailFoundUptil: null,
              mailFoundQuant: mails.length,
              mailSyncedQuant: mails.length,
            }),
            page: null,
          };
        },
      });

      const runOnce = async (): Promise<GatheredMail[]> => {
        const result = await setMailsFromAdapter(
          {
            in: { repo: REPO_SKIP },
            since: null,
            limit: 500,
          },
          {
            mailAdapter: getSkipperAdapter(),
            log,
            accessToken: 'token',
            cwd: testDir,
          },
        );
        return result.mails;
      };

      when('[t0] the first run, with an empty cache', () => {
        const exids = useBeforeAll(async () => ({
          of: (await runOnce()).map((mail) => mail.exid).sort(),
        }));

        then('both mails come back', () => {
          expect(exids.of).toEqual(['mail-one', 'mail-two']);
        });
      });

      when('[t1] a SECOND run, with both already cached', () => {
        const exids = useBeforeAll(async () => {
          await runOnce();
          return { of: (await runOnce()).map((mail) => mail.exid).sort() };
        });

        then(
          'both mails STILL come back, though neither was re-fetched',
          () => {
            // ⚠️ the teeth. return `result.mails` from the orchestrator instead of the cache
            // read-back and this is `[]` — a mailbox that empties itself the second time you look
            expect(exids.of).toEqual(['mail-one', 'mail-two']);
          },
        );
      });
    },
  );

  /**
   * .what = pins the LISTED count across a bare re-run
   * .why = the cursor bounds the fetch AND the cache read-back from one `page`, so the range
   *   a bare re-run FETCHES is also the range it SHOWS. a human who runs `gather.mail` twice
   *   against an unchanged mailbox therefore sees their mail, then a near-empty list. that is
   *   the operation's contract, documented in the role readme (fulcrum F9).
   *
   * .note = the two assertions are ONE claim and must be read together. "the view narrows" is
   *   defensible only while "the cache holds" stays true — that pair is what lets the output
   *   say `listed: 1 / cached: 2` and mean "your mail is held, not lost". break the cache
   *   write and `[t1]`'s second assertion goes red, which is the severe regression: the same
   *   short list, with the mail actually gone.
   */
  given('[case4] a bare re-run whose prior run advanced the cursor', () => {
    const REPO_VIEW = new GatheredMailRepo({
      mechanism: 'ses',
      address: 'view@example.com',
    });

    const asMail = (input: { exid: string; at: string }): GatheredMail =>
      new GatheredMail({
        exid: input.exid,
        ceiver: REPO_VIEW,
        sender: new GatherContactRef({
          mechanism: 'ses',
          address: 'sender@example.com',
        }),
        subject: input.exid,
        snippet: `${input.exid} snippet`,
        body: null,
        deliveredAt: new Date(input.at),
        attachments: [],
        isObfuscated: false,
      });

    /** an unchanged mailbox — no mail arrives between the two runs */
    const MAILBOX = [
      asMail({ exid: 'mail-older', at: '2026-08-01T10:00:00Z' }),
      asMail({ exid: 'mail-newer', at: '2026-08-02T10:00:00Z' }),
    ];

    /** honors the range and reports a real high-water mark, the way a live adapter does */
    const getRangeAwareAdapter = (): GatherMailAdapter => ({
      mechanism: 'ses',
      getAllMail: async (input) => {
        const mails = MAILBOX.filter(
          (mail) =>
            !input.page.range.since?.deliveredAt ||
            mail.deliveredAt >= input.page.range.since.deliveredAt,
        );
        return {
          mails,
          stats: new GatheredMailSyncStats({
            mailFoundUptil:
              mails.length === 0
                ? null
                : new Date(
                    Math.max(
                      ...mails.map((mail) => mail.deliveredAt.getTime()),
                    ),
                  ),
            mailFoundQuant: mails.length,
            mailSyncedQuant: mails.length,
          }),
          page: null,
        };
      },
    });

    const runOnce = async (): Promise<{ exids: string[]; cached: number }> => {
      const result = await setMailsFromAdapter(
        {
          in: { repo: REPO_VIEW },
          since: null,
          limit: 500,
        },
        {
          mailAdapter: getRangeAwareAdapter(),
          log,
          accessToken: 'token',
          cwd: testDir,
        },
      );
      return {
        exids: result.mails.map((mail) => mail.exid).sort(),
        cached: result.stats.mailFoundQuant,
      };
    };

    when('[t0] the first run, against an empty cache', () => {
      const seen = useBeforeAll(async () => runOnce());

      then('it lists the whole mailbox', () => {
        expect(seen.exids).toEqual(['mail-newer', 'mail-older']);
      });
    });

    when('[t1] a SECOND bare run, on the SAME unchanged mailbox', () => {
      const seen = useBeforeAll(async () => {
        await runOnce();
        return runOnce();
      });

      then('it lists only mail at-or-after the cursor — it shows LESS', () => {
        // ⚠️ the teeth. drop the cursor from the range and this reads both mails again —
        // whichever way the contract moves, the change lands here rather than in silence
        expect(seen.exids).toEqual(['mail-newer']);
      });

      then('but the cache still HOLDS the mail it no longer lists', () => {
        // ⚠️ the teeth for the half that makes the above defensible. the shorter list is a
        // narrowed VIEW, never a loss — `cached: 2` beside `listed: 1` is what says so.
        // break the cache write and this reads 1, and the mail is genuinely gone
        expect(seen.cached).toEqual(2);
      });
    });
  });
});
