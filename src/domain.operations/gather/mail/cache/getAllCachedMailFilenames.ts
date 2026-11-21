import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * .what = name every mail file the cache holds for a repo, or none when there is no cache
 * .why = three callers asked this same question three times, byte for byte — the join to
 *   `mails/`, the ENOENT-allowlisted readdir, and the `mail.exid=` + `.json` filter appeared
 *   verbatim in `getAllCachedMails`, `getAllCachedMailExids`, and `getCachedMailQuant`.
 *   that is not three similar cases; it is one question copied three times, so
 *   `rule.prefer.wet-over-dry`'s rule-of-three cuts FOR the extraction rather than against it.
 *
 *   the copies also each carried the ENOENT allowlist independently. a drift in one — a
 *   widened catch, a dropped rethrow — would read as "no mail cached" on a permission fault
 *   and silently re-download a whole mailbox, in one caller but not its two neighbors
 *   (`rule.forbid.failhide`).
 *
 * .note = it reads FILENAMES, never bodies. the name alone answers "which files are mail",
 *   and every caller narrows from there — so no caller pays a parse to learn what exists.
 */
export const getAllCachedMailFilenames = async (input: {
  cacheDir: string;
}): Promise<string[]> => {
  const mailsDir = path.join(input.cacheDir, 'mails');

  const files = await (async (): Promise<string[] | null> => {
    try {
      return await fs.readdir(mailsDir);
    } catch (error) {
      // ⚠️ allowlist ENOENT ONLY — an absent dir means no mail cached yet, which is a real
      // state rather than a fault. every other error (a permission fault, a corrupt mount)
      // would otherwise read as "none cached", which reports an empty mailbox and re-fetches
      // one that is merely unreachable (`rule.forbid.failhide`)
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw error;
    }
  })();
  if (files === null) return [];

  return files.filter(
    (file) =>
      file.startsWith(CACHED_MAIL_FILE_PREFIX) && file.endsWith('.json'),
  );
};

/**
 * .what = the filename prefix `upsertCachedMail` writes every mail under
 * .why = the prefix is how a mail file is told from a sync-stats file in the same dir, so it
 *   is a contract between the write and every read. it was a literal in four places — the one
 *   writer and three readers — where a change to the writer alone would make every reader
 *   report an empty cache, at exit 0 (`rule.forbid.magic-values`).
 */
export const CACHED_MAIL_FILE_PREFIX = 'mail.exid=';
