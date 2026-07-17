import { describe, expect, it } from 'vitest';
import { type ResolvedTask, extractTaskId, parseTaskId } from '../src/git.js';

function extract(branch: string): [string, boolean] | null {
  const t = extractTaskId(branch);
  return t ? [t.id, t.isCustom] : null;
}

describe('extractTaskId', () => {
  it('cu plain branch', () => {
    expect(extract('CU-abc123-foo')).toEqual(['abc123', false]);
  });

  it('cu with feat prefix', () => {
    expect(extract('feat/CU-abc123-foo')).toEqual(['abc123', false]);
  });

  it('cu lowercase', () => {
    expect(extract('cu-dead01-test')).toEqual(['dead01', false]);
  });

  it('cu mixed case prefix', () => {
    expect(extract('Feature/Cu-Abc123')).toEqual(['Abc123', false]);
  });

  it('cu with underscore after id', () => {
    expect(extract('CU-86d1u2bz4_React-Native-Pois-gone')).toEqual(['86d1u2bz4', false]);
  });

  it('cu with feature prefix and underscore', () => {
    expect(extract('feature/CU-86d1u2bz4_something')).toEqual(['86d1u2bz4', false]);
  });

  it('custom id plain', () => {
    expect(extract('PROJ-42-add-login')).toEqual(['PROJ-42', true]);
  });

  it('custom id with fix prefix', () => {
    expect(extract('fix/ENG-1234-auth')).toEqual(['ENG-1234', true]);
  });

  it('excluded prefix feature', () => {
    expect(extract('FEATURE-123-something')).toBeNull();
  });

  it('excluded prefix bugfix', () => {
    expect(extract('BUGFIX-456-foo')).toBeNull();
  });

  it('excluded prefix wip', () => {
    expect(extract('WIP-1-in-progress')).toBeNull();
  });

  it('no match main', () => {
    expect(extract('main')).toBeNull();
  });

  it('no match draft work', () => {
    expect(extract('draft-work')).toBeNull();
  });

  it('no match head literal', () => {
    expect(extract('HEAD')).toBeNull();
  });

  it('cu first match wins', () => {
    expect(extract('CU-aaa-refs-CU-bbb')).toEqual(['aaa', false]);
  });

  it('cu wins over custom', () => {
    expect(extract('feat/CU-abc123-refs-PROJ-42-foo')).toEqual(['abc123', false]);
  });

  it('does not match mid-word', () => {
    expect(extract('xyzCU-abc')).toBeNull();
  });

  it('empty branch', () => {
    expect(extract('')).toBeNull();
  });
});

describe('parseTaskId', () => {
  it('parse explicit cu stripped', () => {
    const t = parseTaskId('CU-abc123');
    expect(t.id).toBe('abc123');
    expect(t.isCustom).toBe(false);
    expect(t.source).toBe('explicit');
  });

  it('parse explicit custom flagged', () => {
    const t = parseTaskId('PROJ-42');
    expect(t.id).toBe('PROJ-42');
    expect(t.isCustom).toBe(true);
  });

  it('parse explicit plain', () => {
    const t = parseTaskId('abc123');
    expect(t.id).toBe('abc123');
    expect(t.isCustom).toBe(false);
  });

  it('parse explicit excluded prefix not custom', () => {
    const t = parseTaskId('FEATURE-123');
    expect(t.id).toBe('FEATURE-123');
    expect(t.isCustom).toBe(false);
  });

  it('parse explicit trims whitespace', () => {
    const t = parseTaskId('  CU-abc123 ');
    expect(t.id).toBe('abc123');
  });
});
