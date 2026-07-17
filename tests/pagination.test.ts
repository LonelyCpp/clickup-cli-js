import { describe, it, expect } from 'vitest';
import { extractArray } from '../src/pagination.js';

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
