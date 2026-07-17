import type { ClickUpClient } from './client.js';

const MAX_PAGES = 100;

export function extractArray(resp: any, keys: string[]): any[] | null {
  for (const key of keys) {
    if (Array.isArray(resp?.[key])) {
      return [...resp[key]];
    }
  }
  if (Array.isArray(resp)) {
    return [...resp];
  }
  return null;
}

export async function walkPage(
  client: ClickUpClient,
  itemsKey: string,
  buildPath: (page: number) => string,
  opts: { all?: boolean; limit?: number; page?: number },
): Promise<any[]> {
  const startPage = opts.page || 0;
  const collected: any[] = [];
  let currentPage = startPage;
  let pagesFetched = 0;

  while (true) {
    const resp = await client.get(buildPath(currentPage));
    const items = extractArray(resp, [itemsKey, 'data']) || [];
    const lastPage = resp.last_page ?? items.length === 0;
    collected.push(...items);
    pagesFetched++;

    if (!opts.all) break;
    if (lastPage || pagesFetched >= MAX_PAGES) break;
    if (opts.limit && collected.length >= opts.limit) break;
    currentPage++;
  }

  if (opts.limit) {
    return collected.slice(0, opts.limit);
  }
  return collected;
}

export async function walkCursor(
  client: ClickUpClient,
  itemsKeys: string[],
  buildPath: (cursor: string | null) => string,
  opts: { all?: boolean; limit?: number; cursor?: string },
): Promise<any[]> {
  let cursor: string | null = opts.cursor || null;
  const collected: any[] = [];
  let pagesFetched = 0;

  while (true) {
    const resp = await client.get(buildPath(cursor));
    const items = extractArray(resp, itemsKeys) || [];
    const nextRaw = resp.next_cursor;
    const nextCursor: string | null =
      typeof nextRaw === 'string' && nextRaw.length > 0 ? nextRaw : null;
    collected.push(...items);
    pagesFetched++;

    if (!opts.all) break;
    if (nextCursor === null || pagesFetched >= MAX_PAGES) break;
    if (opts.limit && collected.length >= opts.limit) break;
    cursor = nextCursor;
  }

  if (opts.limit) {
    return collected.slice(0, opts.limit);
  }
  return collected;
}

export async function walkStartId(
  client: ClickUpClient,
  itemsKey: string,
  buildPath: (start: number | null, startId: string | null) => string,
  opts: { all?: boolean; limit?: number; start?: number; startId?: string },
): Promise<any[]> {
  const PAGE_HINT = 25;
  let currentStart: number | null = opts.start ?? null;
  let currentStartId: string | null = opts.startId ?? null;
  const collected: any[] = [];
  let pagesFetched = 0;

  while (true) {
    const resp = await client.get(buildPath(currentStart, currentStartId));
    const items = extractArray(resp, [itemsKey, 'data']) || [];
    const count = items.length;

    let nextBoundary: { date: number; id: string } | null = null;
    if (count > 0) {
      const last = items[count - 1];
      const dateVal = last.date;
      const idVal = last.id;
      const date =
        typeof dateVal === 'number' ? dateVal : Number.parseInt(String(dateVal), 10);
      const id = idVal != null ? String(idVal) : null;
      if (!Number.isNaN(date) && id != null) {
        nextBoundary = { date, id };
      }
    }

    collected.push(...items);
    pagesFetched++;

    if (!opts.all) break;
    if (count < PAGE_HINT || pagesFetched >= MAX_PAGES) break;
    if (opts.limit && collected.length >= opts.limit) break;
    if (nextBoundary) {
      currentStart = nextBoundary.date;
      currentStartId = nextBoundary.id;
    } else {
      break;
    }
  }

  if (opts.limit) {
    return collected.slice(0, opts.limit);
  }
  return collected;
}
