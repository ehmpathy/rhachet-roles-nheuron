import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';

import { GatheredMailSyncStats } from '@src/domain.objects/GatheredMailSyncStats';

/**
 * .what = parse .sync.json content to sync stats
 * .why = deserialize cached sync state with validation
 *
 * behavior:
 * - if null: return default state { mailFoundUptil: null, mailFoundQuant: 0, mailSyncedQuant: 0 }
 * - if valid json: parse and return
 * - if malformed json: UnexpectedCodePathError.throw('sync stats corrupt', { syncJson })
 *
 * .note = an unrecognized key in the parsed json is ignored rather than rejected, so a cache
 *   written by a prior version reads cleanly. that is what let `historyId` be dropped from
 *   the shape without a cache migration.
 */
export const getSyncStatsFromJson = (input: {
  syncJson: string | null;
}): GatheredMailSyncStats => {
  // handle null case — return default state
  if (input.syncJson === null) {
    return new GatheredMailSyncStats({
      mailFoundUptil: null,
      mailFoundQuant: 0,
      mailSyncedQuant: 0,
    });
  }

  // attempt to parse json.
  //
  // ⚠️ the try wraps ONLY the parse, never the checks below it. a guard inside this block
  //   would be caught by its own catch and re-thrown as the generic 'sync stats corrupt',
  //   which discards the named reason and the fix the guard exists to carry — a failhide
  //   built out of a failloud (`rule.forbid.failhide`).
  const parsed = (() => {
    try {
      return JSON.parse(input.syncJson!) as {
        mailFoundUptil: string | null;
        mailFoundQuant: number;
        mailSyncedQuant: number;
      };
    } catch (error) {
      return UnexpectedCodePathError.throw('sync stats corrupt', {
        syncJson: input.syncJson,
        error,
      });
    }
  })();

  // ⚠️ THE CURSOR IS CHECKED, NEVER TRUSTED — and note a try/catch could not do it,
  // because `new Date('garbage')` does not THROW. it yields an Invalid Date, whose
  // getTime() is NaN, and every comparison against NaN is false. so a corrupt cursor fed
  // into `getPaginationInput` becomes NO lower bound at all: the run re-scans the whole
  // mailbox, at full cost, and reports success — while it LOOKS like the incremental run
  // the human asked for (`rule.forbid.unexpected-defaults`).
  //
  // ⚠️ this is the THIRD field of this exact class, and that is the durable lesson: the
  // token expiry, the cached `deliveredAt`, and now this cursor. every one is a date read
  // back from a file, every one degrades to a silent Invalid Date rather than a loud
  // absence, and every one steers a decision. **a date crossed in from a file is checked
  // at that boundary — there is no fourth exception.**
  const mailFoundUptil = parsed.mailFoundUptil
    ? new Date(parsed.mailFoundUptil)
    : null;
  if (mailFoundUptil !== null && Number.isNaN(mailFoundUptil.getTime()))
    BadRequestError.throw('the sync cursor has an unreadable time', {
      mailFoundUptil: parsed.mailFoundUptil,
      why: 'an unreadable cursor compares false against every bound, so it silently becomes no bound and the run re-scans the whole mailbox as if incremental',
      hint: 'delete the .sync.json for this address and re-gather',
    });

  return new GatheredMailSyncStats({
    mailFoundUptil,
    mailFoundQuant: parsed.mailFoundQuant ?? 0,
    mailSyncedQuant: parsed.mailSyncedQuant ?? 0,
  });
};
