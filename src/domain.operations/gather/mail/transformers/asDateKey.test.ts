import { asDateKey } from './asDateKey';

const TEST_CASES = [
  {
    description: 'a midday UTC instant yields its own day',
    given: { date: new Date('2026-09-01T12:00:00.000Z') },
    expect: '2026-09-01',
  },
  {
    description:
      'a near-midnight UTC instant yields the UTC day, never a local one',
    // teeth: a local-time derivation (toLocaleDateString) would print 2026-09-02 in a +hh
    // timezone for this instant, so the day a human reads would drift with the machine's tz
    given: { date: new Date('2026-09-01T23:30:00.000Z') },
    expect: '2026-09-01',
  },
  {
    description: 'drops the time portion entirely',
    given: { date: new Date('2024-01-02T10:00:00.000Z') },
    expect: '2024-01-02',
  },
];

describe('asDateKey', () => {
  TEST_CASES.map((thisCase) =>
    test(thisCase.description, () => {
      expect(asDateKey({ date: thisCase.given.date })).toEqual(thisCase.expect);
    }),
  );
});
