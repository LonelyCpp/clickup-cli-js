import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn((path: unknown, opts?: unknown) =>
      actual.readFileSync(path as string, opts as BufferEncoding)
    ),
  };
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../src/error.js';
import { resolveValueArg } from '../src/input.js';

const mockedReadFileSync = vi.mocked(readFileSync);

afterEach(() => {
  mockedReadFileSync.mockClear();
});

describe('resolveValueArg plain values', () => {
  it('passes through verbatim', () => {
    expect(resolveValueArg('hello world')).toBe('hello world');
  });

  it('passes through empty string', () => {
    expect(resolveValueArg('')).toBe('');
  });

  it('passes through text without leading @', () => {
    expect(resolveValueArg('some text here')).toBe('some text here');
  });

  it('passes through text with @ in the middle', () => {
    expect(resolveValueArg('user@example.com')).toBe('user@example.com');
  });
});

describe('resolveValueArg @@ escape', () => {
  it('escapes single leading @', () => {
    expect(resolveValueArg('@@everyone')).toBe('@everyone');
  });

  it('escapes double leading @@', () => {
    expect(resolveValueArg('@@@x')).toBe('@@x');
  });

  it('escapes @@ alone to @', () => {
    expect(resolveValueArg('@@')).toBe('@');
  });

  it('escapes @@path with slashes', () => {
    expect(resolveValueArg('@@/etc/hosts')).toBe('@/etc/hosts');
  });
});

describe('resolveValueArg @path file reading', () => {
  it('reads file and strips one trailing newline', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-in-'));
    const filePath = join(tmp, 'val.txt');
    writeFileSync(filePath, 'file content\n');
    expect(resolveValueArg(`@${filePath}`)).toBe('file content');
    rmSync(tmp, { recursive: true });
  });

  it('preserves content with no trailing newline', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-in-'));
    const filePath = join(tmp, 'val.txt');
    writeFileSync(filePath, 'no newline');
    expect(resolveValueArg(`@${filePath}`)).toBe('no newline');
    rmSync(tmp, { recursive: true });
  });

  it('strips only one trailing newline', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-in-'));
    const filePath = join(tmp, 'val.txt');
    writeFileSync(filePath, 'content\n\n');
    expect(resolveValueArg(`@${filePath}`)).toBe('content\n');
    rmSync(tmp, { recursive: true });
  });

  it('preserves interior newlines', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-in-'));
    const filePath = join(tmp, 'val.txt');
    writeFileSync(filePath, 'line1\nline2\nline3\n');
    expect(resolveValueArg(`@${filePath}`)).toBe('line1\nline2\nline3');
    rmSync(tmp, { recursive: true });
  });

  it('strips trailing CRLF', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-in-'));
    const filePath = join(tmp, 'val.txt');
    writeFileSync(filePath, 'content\r\n');
    expect(resolveValueArg(`@${filePath}`)).toBe('content');
    rmSync(tmp, { recursive: true });
  });

  it('reads empty file as empty string', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-in-'));
    const filePath = join(tmp, 'val.txt');
    writeFileSync(filePath, '');
    expect(resolveValueArg(`@${filePath}`)).toBe('');
    rmSync(tmp, { recursive: true });
  });
});

describe('resolveValueArg @- stdin', () => {
  it('reads from stdin and strips trailing newline', () => {
    mockedReadFileSync.mockImplementationOnce(() => 'from stdin\n');
    expect(resolveValueArg('@-')).toBe('from stdin');
  });

  it('reads from stdin with no trailing newline', () => {
    mockedReadFileSync.mockImplementationOnce(() => 'raw stdin');
    expect(resolveValueArg('@-')).toBe('raw stdin');
  });

  it('reads multi-line stdin preserving interior newlines', () => {
    mockedReadFileSync.mockImplementationOnce(() => 'a\nb\nc\n');
    expect(resolveValueArg('@-')).toBe('a\nb\nc');
  });
});

describe('resolveValueArg error handling', () => {
  it('throws CliError(config) on missing file', () => {
    expect(() => resolveValueArg('@/nonexistent/cu-test-file-xyz')).toThrow(CliError);
    try {
      resolveValueArg('@/nonexistent/cu-test-file-xyz');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).kind).toBe('config');
      expect((e as CliError).message).toContain('cu-test-file-xyz');
      expect((e as CliError).message).toContain('@@');
    }
  });
});
