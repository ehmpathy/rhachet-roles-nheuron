import * as fs from 'fs/promises';
import * as path from 'path';

import type { GatheredMail } from '@src/domain.objects/GatheredMail';
import type { GatheredMailRepo } from '@src/domain.objects/GatheredMailRepo';

import { asCacheSafeExid } from './asCacheSafeExid';
import { CACHED_MAIL_FILE_PREFIX } from './getAllCachedMailFilenames';
import { getCacheDir } from './getCacheDir';

/**
 * .what = write mail to cache (idempotent)
 * .why = persist mail for fast local access
 */
export const upsertCachedMail = async (input: {
  mail: GatheredMail;
  repo: GatheredMailRepo;
  cwd: string | null;
}): Promise<void> => {
  const cacheDir = getCacheDir({ repo: input.repo, cwd: input.cwd });
  const mailsDir = path.join(cacheDir, 'mails');
  // the exid is encoded, never pasted raw — a mechanism may put a `/` in its own
  // identifier, and a raw `/` here would make path.join build a nested path whose
  // parent the mkdir below does not create
  const filePath = path.join(
    mailsDir,
    `${CACHED_MAIL_FILE_PREFIX}${asCacheSafeExid({ exid: input.mail.exid })}.json`,
  );

  // ensure directory
  await fs.mkdir(mailsDir, { recursive: true });

  // write mail as plain json (not domain-objects serialize)
  const content = JSON.stringify(
    {
      exid: input.mail.exid,
      ceiver: {
        mechanism: input.mail.ceiver.mechanism,
        address: input.mail.ceiver.address,
      },
      sender: {
        mechanism: input.mail.sender.mechanism,
        address: input.mail.sender.address,
      },
      subject: input.mail.subject,
      snippet: input.mail.snippet,
      body: input.mail.body,
      deliveredAt: input.mail.deliveredAt.toJSON(),
      labels: input.mail.labels,
      attachments: input.mail.attachments,
      isObfuscated: input.mail.isObfuscated,
    },
    null,
    2,
  );
  await fs.writeFile(filePath, content, 'utf-8');
};
