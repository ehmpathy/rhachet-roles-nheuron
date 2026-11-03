import { BadRequestError } from 'helpful-errors';

/**
 * .what = cast a `--since` string into a real date, or refuse it
 * .why = `new Date('yesterday')` yields an Invalid Date, whose `getTime()` is NaN — and every
 *   comparison against NaN is false, so an unparseable `--since` silently became NO bound and
 *   returned the whole mailbox with exit 0. the same shape as the dropped filter: a success
 *   that lied about what it narrowed (`rule.forbid.failhide`).
 *
 * .note = pure and credential-free, so `setGatheredMails` runs it BEFORE the auth guard; an
 *   unauthenticated human with a bad `--since` hears about the date first, not the keyrack
 */
export const asSinceDateOrThrow = (input: { since: string }): Date => {
  const parsed = new Date(input.since);

  if (Number.isNaN(parsed.getTime()))
    BadRequestError.throw('--since is not a date we can read', {
      since: input.since,
      why: 'an unreadable date would silently become no bound at all, and return the whole mailbox',
      hint: 'use an ISO date, e.g. --since 2026-08-01',
    });

  return parsed;
};
