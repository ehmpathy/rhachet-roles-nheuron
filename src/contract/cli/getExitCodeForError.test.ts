import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { getExitCodeForError } from './getExitCodeForError';

/**
 * .what = a stderr sink that records what the cli reported
 * .why = the half of this contract a human reads is the TEXT, not only the code
 */
const getRecordedStderr = () => {
  const state: { lines: string[] } = { lines: [] };
  return {
    setStderr: (content: string) => {
      state.lines.push(content);
    },
    state,
  };
};

describe('getExitCodeForError', () => {
  given('[case1] a BadRequestError — the caller must fix it', () => {
    when('[t0] the cli catches it', () => {
      then('it yields exit code 2', () => {
        const sink = getRecordedStderr();

        expect(
          getExitCodeForError(
            { error: new BadRequestError('--from is required') },
            sink,
          ),
        ).toEqual(2);
      });

      then('it reports the message, and NOT a stack', () => {
        const sink = getRecordedStderr();

        getExitCodeForError(
          { error: new BadRequestError('--from is required') },
          sink,
        );

        // .note = `helpful-errors` prefixes the class into `.message`, so the human sees
        //   the error KIND as well as its text. pinned as-is rather than trimmed — the
        //   kind is what tells a human whether they mis-called or the tool broke
        expect(sink.state.lines).toEqual([
          'error: BadRequestError: --from is required',
        ]);
        // ⚠️ a stack trace as a human's only error output is a blocker
        expect(sink.state.lines.join('')).not.toContain('at ');
      });
    });
  });

  given('[case2] any other Error — the tool malfunctioned', () => {
    when('[t0] the cli catches it', () => {
      then('it yields exit code 1', () => {
        const sink = getRecordedStderr();

        expect(
          getExitCodeForError(
            { error: new UnexpectedCodePathError('token absent after auth') },
            sink,
          ),
        ).toEqual(1);
      });
    });
  });

  given('[case3] a thrown non-Error', () => {
    when('[t0] the cli catches it', () => {
      then('it still reports and yields 1, never crashes on the read', () => {
        const sink = getRecordedStderr();

        expect(getExitCodeForError({ error: 'a bare string' }, sink)).toEqual(
          1,
        );
        expect(sink.state.lines).toEqual(['error: a bare string']);
      });
    });
  });
});
