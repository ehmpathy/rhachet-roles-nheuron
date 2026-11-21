import { given, then, when } from 'test-fns';

import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getCacheDir } from './getCacheDir';

const CWD = '/home/vlad/project';
const ROOT = `${CWD}/.agent/.cache/repo=nheuron/role=gatherer/skill=gather.mail`;

/**
 * .what = clamps that a cache dir is keyed by BOTH mechanism and address
 * .why = the dir is the cache's real natural key — `GatheredMail.unique` is
 *   `['ceiver', 'exid']`, and the ceiver is exactly this (mechanism, address) pair. two
 *   mailboxes that shared a dir would overwrite each other's mail by exid, silently.
 *
 * .note = [case2] once used `'slack'`, a mechanism with no adapter, which the narrowed
 *   `GatheredMailMechanism` no longer admits. `ses` serves the same intent and is real —
 *   a placeholder case proved the segment varies for a value no human can pass.
 */
describe('getCacheDir', () => {
  given('[case1] a gmail mailbox', () => {
    when('[t0] the cache dir is read', () => {
      then('it is keyed by mechanism and address', () => {
        const repo = new GatheredMailRepo({
          mechanism: 'gmail',
          address: 'vlad@gmail.com',
        });

        expect(getCacheDir({ repo, cwd: CWD })).toBe(
          `${ROOT}/mechanism=gmail/address=vlad@gmail.com`,
        );
      });
    });
  });

  given('[case2] a ses mailbox', () => {
    when('[t0] the cache dir is read', () => {
      then('the mechanism segment changes with it', () => {
        const repo = new GatheredMailRepo({
          mechanism: 'ses',
          address: 'jelly@one.nheuron.com',
        });

        expect(getCacheDir({ repo, cwd: CWD })).toBe(
          `${ROOT}/mechanism=ses/address=jelly@one.nheuron.com`,
        );
      });
    });
  });

  given('[case3] two mailboxes that differ ONLY by address', () => {
    when('[t0] both cache dirs are read', () => {
      then('they never collide', () => {
        const dirOne = getCacheDir({
          repo: new GatheredMailRepo({
            mechanism: 'ses',
            address: 'jelly@one.nheuron.com',
          }),
          cwd: CWD,
        });
        const dirTwo = getCacheDir({
          repo: new GatheredMailRepo({
            mechanism: 'ses',
            address: 'echo@one.nheuron.com',
          }),
          cwd: CWD,
        });

        // ⚠️ drop `address` from the path and this goes red. the two mailboxes would then
        // share a dir, and a mail cached by exid in one would overwrite the other's
        expect(dirOne).not.toEqual(dirTwo);
      });
    });
  });
});
