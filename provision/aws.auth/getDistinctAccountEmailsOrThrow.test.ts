import { getError, given, then, when } from 'test-fns';

import { getDistinctAccountEmailsOrThrow } from './getDistinctAccountEmailsOrThrow';

/**
 * .what = clamps the guard that refuses two aws accounts on one root email
 * .why = the collision it catches is the costliest failure in this behavior's apply path:
 *   it passes the absence check, so the org is created and one account is minted before aws
 *   refuses the second. the unwind is a support ticket, not a re-run. so the guard is worth
 *   a clamp, and so is the case-fold — a raw `===` would read `A@x.com` and `a@x.com` as two
 *   addresses while aws reads them as one, and let the collision through.
 */
describe('getDistinctAccountEmailsOrThrow', () => {
  given('[case1] the two nheuron accounts, each on its own address', () => {
    when('[t0] the emails are checked', () => {
      then('it passes silently', () => {
        expect(() =>
          getDistinctAccountEmailsOrThrow({
            emails: {
              'nheuron-prod': 'nheuron-prod@example.com',
              'nheuron-prep': 'nheuron-prep@example.com',
            },
          }),
        ).not.toThrow();
      });
    });
  });

  given('[case2] one address pasted into both entries', () => {
    // teeth: this is the case the guard is CHOSEN for. it passes the absence check, so
    // without this guard the apply reaches aws and halts with the org half-provisioned
    const error = getError(() =>
      getDistinctAccountEmailsOrThrow({
        emails: {
          'nheuron-prod': 'nheuron@example.com',
          'nheuron-prep': 'nheuron@example.com',
        },
      }),
    );

    when('[t0] the emails are checked', () => {
      then('it refuses, rather than let the apply start', () => {
        expect(error.message).toContain('same root email');
      });

      then('it names BOTH accounts, so the fix needs no hunt', () => {
        // a message that named only one would leave a human to guess which entry to change
        expect(error.message).toContain('nheuron-prod');
        expect(error.message).toContain('nheuron-prep');
      });

      then('it names the next move', () => {
        expect(error.message).toContain('keyrack fill');
      });
    });
  });

  given('[case3] the same address in two letter cases', () => {
    when('[t0] the emails are checked', () => {
      then('it still refuses — aws reads one address, not two', () => {
        // a raw `===` passes this and the collision reaches aws, which is the whole reason
        // the comparison is case-folded
        expect(() =>
          getDistinctAccountEmailsOrThrow({
            emails: {
              'nheuron-prod': 'Jelly@Example.com',
              'nheuron-prep': 'jelly@example.com',
            },
          }),
        ).toThrow('same root email');
      });
    });
  });

  given('[case4] the same address with stray whitespace', () => {
    when('[t0] the emails are checked', () => {
      then('it still refuses — a paste artifact is not a new address', () => {
        expect(() =>
          getDistinctAccountEmailsOrThrow({
            emails: {
              'nheuron-prod': ' jelly@example.com ',
              'nheuron-prep': 'jelly@example.com',
            },
          }),
        ).toThrow('same root email');
      });
    });
  });

  given('[case5] a third account added later', () => {
    when('[t0] it collides with the FIRST of two prior accounts', () => {
      then('it is still caught — the guard scales past a pair', () => {
        // asserted because the guard is written over a record rather than two named args:
        // a future account triplet must not silently outgrow it
        expect(() =>
          getDistinctAccountEmailsOrThrow({
            emails: {
              'nheuron-prod': 'a@example.com',
              'nheuron-prep': 'b@example.com',
              'nheuron-test': 'a@example.com',
            },
          }),
        ).toThrow('same root email');
      });
    });
  });
});
