import { describe, expect, it } from 'vitest';
import type { ClickUpClient } from '../src/client.js';
import { extractArray, walkPage, walkStartId } from '../src/pagination.js';

function stubClient(responses: any[]): ClickUpClient {
  let i = 0;
  return {
    get: async (_path: string) => responses[Math.min(i++, responses.length - 1)],
  } as unknown as ClickUpClient;
}

describe('extractArray', () => {
  it('prefers first key', () => {
    const resp = { data: [1, 2], tasks: [3, 4] };
    expect(extractArray(resp, ['data', 'tasks'])).toEqual([1, 2]);
  });

  it('falls back to second key', () => {
    const resp = { tasks: [3, 4] };
    expect(extractArray(resp, ['data', 'tasks'])).toEqual([3, 4]);
  });

  it('falls back to bare array', () => {
    const resp = [1, 2, 3];
    expect(extractArray(resp, ['data'])).toEqual([1, 2, 3]);
  });

  it('returns null when no match', () => {
    const resp = { foo: 'bar' };
    expect(extractArray(resp, ['data', 'tasks'])).toBeNull();
  });

  it('returns a clone, not the original reference', () => {
    const resp = { data: [1, 2] };
    const out = extractArray(resp, ['data']);
    expect(out).toEqual([1, 2]);
    expect(out).not.toBe(resp.data);
  });
});

describe('walkPage hasMore', () => {
  it('single-page fetch (no --all), last_page true → hasMore false', async () => {
    const client = stubClient([{ tasks: [{ id: '1' }], last_page: true }]);
    const result = await walkPage(client, 'tasks', (p) => `/p${p}`, {});
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('single-page fetch (no --all), last_page false → hasMore true', async () => {
    const client = stubClient([{ tasks: [{ id: '1' }], last_page: false }]);
    const result = await walkPage(client, 'tasks', (p) => `/p${p}`, {});
    expect(result.hasMore).toBe(true);
  });

  it('--all walks until last_page true → hasMore false', async () => {
    const client = stubClient([
      { tasks: [{ id: '1' }], last_page: false },
      { tasks: [{ id: '2' }], last_page: true },
    ]);
    const result = await walkPage(client, 'tasks', (p) => `/p${p}`, { all: true });
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });

  it('--all with --limit cutting off before last_page → hasMore true', async () => {
    const client = stubClient([
      { tasks: [{ id: '1' }, { id: '2' }], last_page: false },
      { tasks: [{ id: '3' }], last_page: true },
    ]);
    const result = await walkPage(client, 'tasks', (p) => `/p${p}`, { all: true, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('empty page → last_page inferred true → hasMore false', async () => {
    const client = stubClient([{ tasks: [] }]);
    const result = await walkPage(client, 'tasks', (p) => `/p${p}`, {});
    expect(result.hasMore).toBe(false);
  });
});

describe('walkStartId hasMore', () => {
  function comments(n: number, startIdx = 0): { comments: { id: string; date: number }[] } {
    return {
      comments: Array.from({ length: n }, (_, i) => ({
        id: String(startIdx + i),
        date: 1000 + startIdx + i,
      })),
    };
  }

  it('single fetch (no --all), full page (>= 25) → hasMore true', async () => {
    const client = stubClient([comments(25)]);
    const result = await walkStartId(client, 'comments', () => '/comments', {});
    expect(result.items).toHaveLength(25);
    expect(result.hasMore).toBe(true);
  });

  it('single fetch (no --all), short page (< 25) → hasMore false', async () => {
    const client = stubClient([comments(5)]);
    const result = await walkStartId(client, 'comments', () => '/comments', {});
    expect(result.hasMore).toBe(false);
  });

  it('--all walks until a short page → hasMore false', async () => {
    const client = stubClient([comments(25, 0), comments(5, 25)]);
    const result = await walkStartId(client, 'comments', () => '/comments', { all: true });
    expect(result.items).toHaveLength(30);
    expect(result.hasMore).toBe(false);
  });

  it('--all with --limit cutting off mid-stream → hasMore true', async () => {
    const client = stubClient([comments(25, 0), comments(25, 25)]);
    const result = await walkStartId(client, 'comments', () => '/comments', {
      all: true,
      limit: 30,
    });
    expect(result.items).toHaveLength(30);
    expect(result.hasMore).toBe(true);
  });
});
