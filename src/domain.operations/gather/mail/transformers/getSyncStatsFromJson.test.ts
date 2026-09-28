import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';
import { getError } from 'test-fns';

import { getSyncStatsFromJson } from './getSyncStatsFromJson';

describe('getSyncStatsFromJson', () => {
  describe('null input', () => {
    test('returns default state', () => {
      const result = getSyncStatsFromJson({ syncJson: null });
      expect(result.mailFoundUptil).toBeNull();
      expect(result.mailFoundQuant).toBe(0);
      expect(result.mailSyncedQuant).toBe(0);
    });
  });

  describe('valid json', () => {
    test('parses complete sync stats', () => {
      const syncJson = JSON.stringify({
        mailFoundUptil: '2024-01-15T12:00:00.000Z',
        mailFoundQuant: 42,
        mailSyncedQuant: 10,
      });

      const result = getSyncStatsFromJson({ syncJson });

      expect(result.mailFoundUptil).toEqual(
        new Date('2024-01-15T12:00:00.000Z'),
      );
      expect(result.mailFoundQuant).toBe(42);
      expect(result.mailSyncedQuant).toBe(10);
    });

    test('parses partial sync stats with defaults', () => {
      const syncJson = JSON.stringify({
        mailFoundUptil: null,
      });

      const result = getSyncStatsFromJson({ syncJson });

      expect(result.mailFoundUptil).toBeNull();
      expect(result.mailFoundQuant).toBe(0);
      expect(result.mailSyncedQuant).toBe(0);
    });

    /**
     * .what = a cache written by a PRIOR version still reads
     * .why = `historyId` was persisted into every `.sync.json` on disk before it was
     *   dropped from the shape. a human who upgrades has those files already written, so a
     *   parse that rejected the unknown key would throw `sync stats corrupt` on a cache
     *   that is entirely valid — and the fix would be to delete their cache.
     *
     * .note = this is what let the field be removed with no migration step. it clamps the
     *   claim the parser's doc-comment makes, rather than leave it as prose.
     */
    test('ignores a key a prior version wrote, rather than reject the file', () => {
      const syncJson = JSON.stringify({
        mailFoundUptil: '2024-01-15T12:00:00.000Z',
        mailFoundQuant: 42,
        mailSyncedQuant: 10,
        historyId: '12345',
      });

      const result = getSyncStatsFromJson({ syncJson });

      expect(result.mailFoundQuant).toBe(42);
      expect(result.mailSyncedQuant).toBe(10);
      expect(result).not.toHaveProperty('historyId');
    });
  });

  describe('corrupt json', () => {
    test('throws UnexpectedCodePathError', async () => {
      const syncJson = 'not valid json {{{';

      const error = await getError(() => getSyncStatsFromJson({ syncJson }));

      expect(error).toBeInstanceOf(UnexpectedCodePathError);
      expect(error.message).toContain('sync stats corrupt');
    });
  });

  /**
   * .what = clamps that an UNREADABLE sync cursor fails loud, rather than become no bound
   * .why = ⚠️ a try/catch cannot catch this, and that is the whole hazard. `new Date('garbage')`
   *   does not throw — it yields an Invalid Date whose `getTime()` is NaN, and every
   *   comparison against NaN is false. so a corrupt cursor that reached `getPaginationInput`
   *   became NO lower bound at all: the run re-scanned the entire mailbox, at full api cost,
   *   and exited 0 to report success — while it read to the human exactly like the
   *   incremental run they asked for (`rule.forbid.unexpected-defaults`).
   *
   * ⚠️ .note = this is the THIRD field of one class — the token expiry, the cached
   *   `deliveredAt`, and this cursor. each is a date read back from a file, each degrades to
   *   a silent Invalid Date rather than a loud absence, and each steers a decision. the two
   *   peers were clamped and this one was not, which is precisely why it survived: an
   *   invariant clamped for two members of a class holds only for those two.
   *
   * .note = the error is a `BadRequestError`, not the `UnexpectedCodePathError` its
   *   [corrupt json] peer above throws. the file is not malformed — it parsed — so the fault
   *   is a value a human can delete and re-derive, which is exit 2, not exit 1.
   */
  describe('an unreadable cursor', () => {
    test('throws rather than silently drop the lower bound', async () => {
      // valid json, unreadable date — the combination a try/catch cannot see
      const syncJson = JSON.stringify({
        mailFoundUptil: 'last tuesday',
        mailFoundQuant: 42,
        mailSyncedQuant: 10,
      });

      const error = await getError(() => getSyncStatsFromJson({ syncJson }));

      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toContain('unreadable time');
    });

    test('names the fix, so the human is not left to guess', async () => {
      const syncJson = JSON.stringify({
        mailFoundUptil: 'last tuesday',
        mailFoundQuant: 42,
        mailSyncedQuant: 10,
      });

      const error = await getError(() => getSyncStatsFromJson({ syncJson }));

      expect(error.message).toContain('.sync.json');
      expect(error.message).toContain('re-gather');
    });

    test('a null cursor is still legal — absence is not corruption', () => {
      // ⚠️ the guard must not overreach. a first run has no cursor at all, and that is the
      // normal case, never an error
      const result = getSyncStatsFromJson({
        syncJson: JSON.stringify({
          mailFoundUptil: null,
          mailFoundQuant: 0,
          mailSyncedQuant: 0,
        }),
      });

      expect(result.mailFoundUptil).toBeNull();
    });
  });
});
