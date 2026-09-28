import { GatheredMail } from '@src/domain.objects/GatheredMail';
import { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { getSortedMails } from './getSortedMails';

const createMail = (exid: string, deliveredAt: Date): GatheredMail =>
  new GatheredMail({
    exid,
    ceiver: new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'test@gmail.com',
    }),
    sender: new GatheredMailRepo({
      mechanism: 'gmail',
      address: 'sender@gmail.com',
    }),
    subject: 'Test',
    snippet: 'Test snippet',
    body: null,
    deliveredAt,
    labels: [],
    attachments: [],
    isObfuscated: false,
  });

describe('getSortedMails', () => {
  const mail1 = createMail('msg_1', new Date('2024-01-01T10:00:00Z'));
  const mail2 = createMail('msg_2', new Date('2024-01-02T10:00:00Z'));
  const mail3 = createMail('msg_3', new Date('2024-01-03T10:00:00Z'));

  test('sorts DESC by default (newest first)', () => {
    const result = getSortedMails({ mails: [mail1, mail3, mail2] });

    expect(result.map((m) => m.exid)).toEqual(['msg_3', 'msg_2', 'msg_1']);
  });

  test('sorts ASC when requested (oldest first)', () => {
    const result = getSortedMails({
      mails: [mail3, mail1, mail2],
      order: 'ASC',
    });

    expect(result.map((m) => m.exid)).toEqual(['msg_1', 'msg_2', 'msg_3']);
  });

  test('handles empty array', () => {
    const result = getSortedMails({ mails: [] });

    expect(result).toEqual([]);
  });

  test('handles single mail', () => {
    const result = getSortedMails({ mails: [mail2] });

    expect(result).toEqual([mail2]);
  });

  test('does not mutate original array', () => {
    const original = [mail1, mail3, mail2];
    const originalCopy = [...original];

    getSortedMails({ mails: original });

    expect(original).toEqual(originalCopy);
  });
});
