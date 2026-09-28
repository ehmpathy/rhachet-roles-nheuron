import { BadRequestError } from 'helpful-errors';
import { getError, given, then, when } from 'test-fns';

import { getAllLabelsFromScope } from './getAllLabelsFromScope';

/**
 * .what = clamps that a scope is either HONORED or REFUSED, never dropped
 * .why = `getAddressScope` parses any `key=a,b` pair the address carries, and the caller
 *   then ignored every one of them. so `--address 'a@b.com/labels=work'` returned the whole
 *   mailbox with exit 0 — the human read that as "work has all my mail", when in truth the
 *   filter never ran (`rule.forbid.surprises`).
 */
describe('getAllLabelsFromScope', () => {
  given('[case1] no scope at all', () => {
    when('[t0] read', () => {
      then('an empty list comes back — an absent scope is a real state', () => {
        expect(getAllLabelsFromScope({ scope: null })).toEqual([]);
      });
    });
  });

  given('[case2] a labels scope', () => {
    when('[t0] read', () => {
      then('the labels come back', () => {
        expect(
          getAllLabelsFromScope({ scope: { labels: ['work', 'urgent'] } }),
        ).toEqual(['work', 'urgent']);
      });
    });
  });

  given('[case3] a scope key we cannot honor', () => {
    when('[t0] read', () => {
      then('it throws rather than silently widen the result', async () => {
        const error = await getError(() =>
          getAllLabelsFromScope({ scope: { folder: ['inbox'] } }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('cannot honor');
        expect(error.message).toContain('folder');
        // the error names the fix, never just the symptom
        expect(error.message).toContain('labels');
      });
    });
  });

  given('[case4] a mix of one honorable key and one we cannot honor', () => {
    when('[t0] read', () => {
      then('it still throws — a partial honor is the silent drop', async () => {
        const error = await getError(() =>
          getAllLabelsFromScope({
            scope: { labels: ['work'], folder: ['inbox'] },
          }),
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('folder');
      });
    });
  });
});
