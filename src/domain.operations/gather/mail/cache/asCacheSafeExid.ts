/**
 * .what = encode an exid so it is safe to embed in a cache filename
 * .why = an exid is a mechanism's own identifier, and a mechanism may put a path
 *        separator in it. the ses adapter keys each mail by its s3 object key —
 *        `<prefix>/<messageId>` — so every ses exid holds a `/`. pasted raw into a
 *        filename, `path.join` reads that `/` as a directory boundary: the write
 *        throws ENOENT (its parent was never created) and a flat `readdir` would
 *        never find the file even if it had landed.
 *
 * .note = encodeURIComponent is chosen over a character swap because it is
 *   INJECTIVE — two distinct exids always yield two distinct filenames. a lossy
 *   `replace('/', '_')` would collide `a/b` with `a_b`, so one mail would overwrite
 *   the other in the cache with no error at all.
 *
 * .note = injective means it is also exactly INVERTIBLE, so the filename is a
 *   lossless carrier of the exid. `getAllCachedMailExids` leans on that to answer
 *   "which mails do we already hold?" from a readdir alone, with no body parse —
 *   which is what lets the ses adapter skip a re-download for the cost of one
 *   directory read. a full mail read still takes `exid` from the json body
 *   (`getAllCachedMails`), since it has the body open regardless.
 */
export const asCacheSafeExid = (input: { exid: string }): string =>
  encodeURIComponent(input.exid);
