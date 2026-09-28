import {
  CACHED_MAIL_FILE_PREFIX,
  getAllCachedMailFilenames,
} from './getAllCachedMailFilenames';

/**
 * .what = list the exid of every mail the cache already holds for a repo
 * .why = a mechanism whose fetch is per-mail can skip what it already has. the ses adapter
 *   lists s3 keys first and reads bodies second, so a key it already holds costs a whole
 *   GetObject for a mail already on disk. that cost is O(mailbox) on EVERY run and grows
 *   forever, since the inbound prefix accumulates — the same load-dependent shape the read
 *   concurrency cap already guards against (`rule.forbid.behavior-hazards`).
 *
 * .note = it reads FILENAMES rather than bodies, same as `getCachedMailQuant` and for the
 *   same reason: the name alone answers the question, and a parse of every mail to produce
 *   a list of ids would make the skip cost as much as the fetch it saves.
 *
 * .note = an exid whose filename does not decode is DROPPED rather than thrown on. a
 *   filename this cannot read is a filename `upsertCachedMail` did not write, so it names
 *   no mail we hold — and to treat it as held would skip a fetch we owe. dropped, the worst
 *   case is one redundant read (`rule.require.safe-by-default`).
 */
export const getAllCachedMailExids = async (input: {
  cacheDir: string;
}): Promise<string[]> => {
  const files = await getAllCachedMailFilenames({ cacheDir: input.cacheDir });

  return files
    .map((file) => asExidFromCacheFilename({ file }))
    .filter((exid): exid is string => exid !== null);
};

/**
 * .what = recover the exid a cache filename was named for, or null when it does not decode
 * .why = `asCacheSafeExid` is `encodeURIComponent`, which is INJECTIVE and exactly
 *   invertible — so the filename is a lossless carrier of the exid, and no body parse is
 *   owed to read it back.
 *
 * .note = `decodeURIComponent` THROWS on a malformed escape (`%zz`), so the throw is caught
 *   and turned into a null the caller drops. a throw here would let one stray file in the
 *   cache dir fail an entire gather.
 */
const asExidFromCacheFilename = (input: { file: string }): string | null => {
  const encoded = input.file.slice(
    CACHED_MAIL_FILE_PREFIX.length,
    -'.json'.length,
  );

  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
};
