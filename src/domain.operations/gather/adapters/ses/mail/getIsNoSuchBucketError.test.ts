import { given, then, when } from 'test-fns';

import { getIsNoSuchBucketError } from './getIsNoSuchBucketError';

describe('getIsNoSuchBucketError', () => {
  given('[case1] an aws sdk NoSuchBucket error', () => {
    const error = Object.assign(
      new Error('The specified bucket does not exist'),
      { name: 'NoSuchBucket' },
    );

    when('[t0] the error is checked', () => {
      then('it is detected', () => {
        expect(getIsNoSuchBucketError({ error })).toBe(true);
      });
    });
  });

  given('[case2] a wrapped error that kept the code in its text', () => {
    const error = new Error('s3 list failed: NoSuchBucket');

    when('[t0] the error is checked', () => {
      then('it is detected', () => {
        expect(getIsNoSuchBucketError({ error })).toBe(true);
      });
    });
  });

  given('[case3] a peer s3 fault whose fix is NOT an apply', () => {
    // teeth: the first three carry the REAL aws text, and each one names the bucket —
    // an arn, a rate line, an endpoint line. so a match that merely hunts for the word
    // `bucket` claims them all and tells a human to apply a wish that is already
    // applied. the fixtures must carry that word, or they guard no defect at all.
    const cases = [
      Object.assign(
        new Error(
          'User: arn:aws:iam::1:user/x is not authorized to perform: s3:ListBucket on resource: arn:aws:s3:::mail-inbound',
        ),
        { name: 'AccessDenied' },
      ),
      Object.assign(
        new Error('Please reduce your request rate for this bucket'),
        { name: 'SlowDown' },
      ),
      Object.assign(
        new Error('The bucket requires the specified regional endpoint'),
        { name: 'PermanentRedirect' },
      ),
      Object.assign(new Error('The specified key does not exist'), {
        name: 'NoSuchKey',
      }),
    ];

    when('[t0] each error is checked', () => {
      then('none is claimed as an absent bucket', () => {
        cases.forEach((error) => {
          expect(getIsNoSuchBucketError({ error })).toBe(false);
        });
      });
    });
  });

  given('[case4] a thrown value that is not an Error', () => {
    when('[t0] the value is checked', () => {
      then('it is not claimed', () => {
        expect(getIsNoSuchBucketError({ error: 'NoSuchBucket' })).toBe(false);
        expect(getIsNoSuchBucketError({ error: null })).toBe(false);
      });
    });
  });
});
