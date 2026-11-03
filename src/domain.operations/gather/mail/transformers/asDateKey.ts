/**
 * .what = the calendar day of a date, as an ISO `YYYY-MM-DD` key (UTC)
 * .why = the tree output prints a day-only date beside each mail. an inline UTC-ISO parse and
 *   slice is decode-friction — a reader must know the ISO shape to see the first 10 chars are
 *   the day. this names the intent and pins the day derivation under one test
 *   (`rule.forbid.inline-decode-friction`).
 *
 * .note = the day is UTC, to match `deliveredAt` which every adapter stores in UTC. a
 *   local-time derivation would print a different day for a mail near midnight, so the day a
 *   human reads would drift with the machine's timezone.
 */
export const asDateKey = (input: { date: Date }): string =>
  input.date.toISOString().slice(0, 10);
