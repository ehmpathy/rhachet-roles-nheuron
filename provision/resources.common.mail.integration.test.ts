import { given, then, when } from 'test-fns';

import { getSesConfig } from '@src/domain.operations/gather/adapters/ses/getSesConfig';

import {
  MAIL_BUCKET,
  MAIL_CONFIG_SET,
  MAIL_REGION,
} from './resources.common.mail';

/**
 * .what = whether the `TEST_LIVE` flag targets the live ses api
 * .why = the values under test live in the prep keyrack, which ci never holds. the clamp runs
 *   when a human names the mechanism (`TEST_LIVE=ses`) — the exact moment a live read is about
 *   to trust them. once targeted, an absent value still throws: the flag is a demand for proof.
 *
 * .note = a local copy of the live suites' own check; the contract they all follow lives in
 *   `.agent/repo=.this/role=any/briefs/howto.run-live-mail-tests.md`.
 */
const isLiveTargeted = (input: { mechanism: 'gmail' | 'ses' }): boolean =>
  (process.env.TEST_LIVE ?? '')
    .split(',')
    .map((part) => part.trim())
    .includes(input.mechanism);

/**
 * .what = clamps the keyrack-held legs of the contract between the mail wish and the reader
 * .why = `SES_MAIL_BUCKET`, `SES_REGION`, and `SES_CONFIG_SET` are filled into keyrack by hand
 *   and MUST equal the constants the wish applies. a wrong bucket or region is still a valid
 *   value, so the read lists zero keys and reports an EMPTY mailbox at exit 0 — a human cannot
 *   tell "no mail arrived" from "misconfigured" (`rule.forbid.failhide`). the prefix leg is
 *   clamped at the unit grain in `resources.common.mail.test.ts`; these three are clamped here,
 *   since only the keyrack holds the runtime side.
 */
describe('resources.common.mail ↔ ses keyrack config', () => {
  given.runIf(isLiveTargeted({ mechanism: 'ses' }))(
    '[case1] the prep keyrack is unlocked for a live ses run (TEST_LIVE=ses)',
    () => {
      when('[t0] the runtime ses config is read', () => {
        then('its bucket equals the bucket the wish applies', () => {
          expect(getSesConfig().bucket).toEqual(MAIL_BUCKET);
        });

        then('its region equals the region the wish applies', () => {
          expect(getSesConfig().region).toEqual(MAIL_REGION);
        });

        then('its config set equals the config set the wish applies', () => {
          expect(getSesConfig().configSet).toEqual(MAIL_CONFIG_SET);
        });
      });
    },
  );
});
