import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { asErrorHeaderDetail } from './asErrorHeaderDetail';

/**
 * .what = clamps the cut of the thrown class from an error's message
 * .why = behind `✋ ConstraintError:` the thrown class is a second label; the cut must take
 *   that prefix only, and leave any other message whole
 */
describe('asErrorHeaderDetail', () => {
  given('[case1] a helpful-errors BadRequestError', () => {
    when('[t0] its detail is read', () => {
      then('the thrown class is cut from the front', () => {
        expect(
          asErrorHeaderDetail({
            error: new BadRequestError('not authenticated'),
          }),
        ).toMatch(/^not authenticated/);
      });
    });
  });

  given('[case2] a helpful-errors UnexpectedCodePathError', () => {
    when('[t0] its detail is read', () => {
      then('the thrown class is cut from the front', () => {
        expect(
          asErrorHeaderDetail({
            error: new UnexpectedCodePathError('token absent after auth'),
          }),
        ).toMatch(/^token absent after auth/);
      });
    });
  });

  given(
    '[case3] a plain Error whose message does not open with its class',
    () => {
      when('[t0] its detail is read', () => {
        then('the message comes back whole', () => {
          expect(
            asErrorHeaderDetail({ error: new Error('disk full') }),
          ).toEqual('disk full');
        });
      });
    },
  );

  given(
    '[case4] a message that names the class later, not at the front',
    () => {
      when('[t0] its detail is read', () => {
        then('naught is cut', () => {
          expect(
            asErrorHeaderDetail({ error: new Error('saw Error: twice') }),
          ).toEqual('saw Error: twice');
        });
      });
    },
  );

  given('[case5] a thrown non-Error', () => {
    when('[t0] its detail is read', () => {
      then('it reads as a string', () => {
        expect(asErrorHeaderDetail({ error: 'a bare string' })).toEqual(
          'a bare string',
        );
      });
    });
  });
});
