import type { GatheredMail } from '@src/domain.objects/GatheredMail';

import type { SesMailObject } from './getAllMailFromSes';
import { getGatheredMailFromSes } from './getGatheredMailFromSes';

/**
 * .what = cast the mail objects read from s3 into the domain
 * .why = owns the one fact a reader would otherwise decode: an s3 object key IS the
 *        mail's exid, so a re-run's cached exids name keys directly, with no second identity
 */
export const asGatheredMailsFromSes = (input: {
  objects: SesMailObject[];
  ceiverAddress: string;
}): GatheredMail[] =>
  input.objects.map((object) =>
    getGatheredMailFromSes({
      parsed: object.parsed,
      exid: object.key,
      receivedAt: object.receivedAt,
      ceiverAddress: input.ceiverAddress,
    }),
  );
