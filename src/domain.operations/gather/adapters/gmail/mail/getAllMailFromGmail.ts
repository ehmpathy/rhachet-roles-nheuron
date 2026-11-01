import { randomUUID } from 'crypto';
import { UnexpectedCodePathError } from 'helpful-errors';

import type { GatherLogMethods } from '@src/domain.objects/GatherLogMethods';
import { getAllInBoundedBatches } from '@src/domain.operations/gather/mail/getAllInBoundedBatches';

import { fetchWithTimeout } from '../fetchWithTimeout';
import { getAllMessagesFromBatchResponse } from './getAllMessagesFromBatchResponse';
import type { GmailMessage } from './getGatheredMailFromGmail';

/**
 * .what = split array into chunks of specified size
 * .why = extract decode-friction for batch size computation
 */
const getChunkedArray = <T>(input: {
  items: T[];
  chunkSize: number;
}): T[][] => {
  const chunkCount = Math.ceil(input.items.length / input.chunkSize);
  return Array.from({ length: chunkCount }, (_, index) =>
    input.items.slice(index * input.chunkSize, (index + 1) * input.chunkSize),
  );
};

/**
 * .what = gmail messages.list response shape
 */
interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * .what = build headers for gmail api requests
 */
const getAuthHeaders = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
});

/**
 * .what = fetch message ids from gmail api
 * .why = messages.list returns only ids; we batch get full content after
 */
const getMessageIds = async (input: {
  accessToken: string;
  query: string | null;
  pageToken: string | null;
  maxResults: number;
}): Promise<{ ids: string[]; nextPageToken: string | null }> => {
  const params = new URLSearchParams({
    maxResults: String(input.maxResults),
  });

  if (input.query) params.set('q', input.query);
  if (input.pageToken) params.set('pageToken', input.pageToken);

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;

  const response = await fetchWithTimeout({
    url,
    init: { method: 'GET', headers: getAuthHeaders(input.accessToken) },
    what: 'gmail messages.list',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new UnexpectedCodePathError('gmail messages.list failed', {
      status: response.status,
      body,
    });
  }

  // note: as-cast at external boundary (gmail api response)
  // gmail messages.list returns this shape per api docs
  // todo: add runtime validation if stricter guarantees needed
  const data = await (async () => {
    try {
      return (await response.json()) as GmailListResponse;
    } catch (error: any) {
      throw new UnexpectedCodePathError(
        'gmail messages.list response parse failed',
        {
          cause: error,
          status: response.status,
          hint: 'response body was not valid json',
        },
      );
    }
  })();

  return {
    ids: (data.messages ?? []).map((m) => m.id),
    nextPageToken: data.nextPageToken ?? null,
  };
};

/**
 * .what = batch fetch full message content from gmail api
 * .why = single messages.get is slow; batch up to 50 per request
 */
const batchGetMessages = async (input: {
  accessToken: string;
  messageIds: string[];
  log: GatherLogMethods;
}): Promise<GmailMessage[]> => {
  if (input.messageIds.length === 0) return [];

  // gmail batch api uses multipart/mixed
  const boundary = `batch_${randomUUID()}`;

  // build batch request body
  const batchBody = input.messageIds
    .map((id, index) => {
      return [
        `--${boundary}`,
        'Content-Type: application/http',
        `Content-ID: <item${index}>`,
        '',
        `GET /gmail/v1/users/me/messages/${id}?format=full`,
        '',
      ].join('\r\n');
    })
    .join('\r\n');

  const fullBody = `${batchBody}\r\n--${boundary}--`;

  const response = await fetchWithTimeout({
    url: 'https://gmail.googleapis.com/batch/gmail/v1',
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': `multipart/mixed; boundary=${boundary}`,
      },
      body: fullBody,
    },
    what: 'gmail batch get',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new UnexpectedCodePathError('gmail batch request failed', {
      status: response.status,
      body,
    });
  }

  const responseText = await response.text();
  const messages = getAllMessagesFromBatchResponse({
    responseText,
    log: input.log,
  });

  return messages;
};

/**
 * .what = fetch all mail from gmail api with pagination
 * .why = composes the id list, the chunk, and the bounded batch walk; the cache stays with
 *   the caller
 */
export const getAllMailFromGmail = async (
  input: {
    accessToken: string;
    query: string | null;
    pageToken: string | null;
    maxResults: number;
  },
  context: { log: GatherLogMethods },
): Promise<{ mails: GmailMessage[]; nextPageToken: string | null }> => {
  const { log } = context;

  // fetch message ids
  log.debug('gmail.getAllMail: fetch ids', {
    query: input.query,
    pageToken: input.pageToken,
    maxResults: input.maxResults,
  });

  const { ids, nextPageToken } = await getMessageIds({
    accessToken: input.accessToken,
    query: input.query,
    pageToken: input.pageToken,
    maxResults: input.maxResults,
  });

  log.debug('gmail.getAllMail: fetched ids', {
    count: ids.length,
    nextPageToken,
  });

  if (ids.length === 0) {
    return { mails: [], nextPageToken };
  }

  // chunk ids into batches (max 50 per batch per google docs)
  const batches = getChunkedArray({ items: ids, chunkSize: 50 });

  // fetch all batches one at a time (gmail rate limits), in order
  const mailsPerBatch = await getAllInBoundedBatches({
    queued: batches,
    bound: 1,
    read: (batchIds) =>
      batchGetMessages({
        accessToken: input.accessToken,
        messageIds: batchIds,
        log,
      }),
  });
  const allMails = mailsPerBatch.flat();

  log.debug('gmail.getAllMail: complete', {
    totalMails: allMails.length,
    nextPageToken,
  });

  return { mails: allMails, nextPageToken };
};
