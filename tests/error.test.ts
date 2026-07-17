import { describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/error.js';

describe('CliError exitCode', () => {
  it('client → 1', () => {
    expect(new CliError('client', 'x').exitCode()).toBe(1);
  });
  it('config → 1', () => {
    expect(new CliError('config', 'x').exitCode()).toBe(1);
  });
  it('branchDetect → 1', () => {
    expect(new CliError('branchDetect', 'x', { hint: 'h' }).exitCode()).toBe(1);
  });
  it('io → 1', () => {
    expect(new CliError('io', 'x').exitCode()).toBe(1);
  });
  it('auth → 2', () => {
    expect(new CliError('auth', 'x').exitCode()).toBe(2);
  });
  it('forbidden → 2', () => {
    expect(new CliError('forbidden', 'x').exitCode()).toBe(2);
  });
  it('notFound → 3', () => {
    expect(new CliError('notFound', 'x').exitCode()).toBe(3);
  });
  it('rateLimited → 4', () => {
    expect(new CliError('rateLimited', 'x').exitCode()).toBe(4);
  });
  it('server → 5', () => {
    expect(new CliError('server', 'x').exitCode()).toBe(5);
  });
  it('network → 6', () => {
    expect(new CliError('network', 'x').exitCode()).toBe(6);
  });
  it('timeout → 7', () => {
    expect(new CliError('timeout', 'x').exitCode()).toBe(7);
  });
});

describe('CliError factory methods', () => {
  it('client sets kind and status', () => {
    const e = CliError.client('msg', 400);
    expect(e.kind).toBe('client');
    expect(e.status).toBe(400);
  });

  it('client without status leaves status undefined', () => {
    const e = CliError.client('msg');
    expect(e.kind).toBe('client');
    expect(e.status).toBeUndefined();
  });

  it('auth sets kind and status 401', () => {
    const e = CliError.auth('msg');
    expect(e.kind).toBe('auth');
    expect(e.status).toBe(401);
  });

  it('forbidden sets kind and status 403', () => {
    const e = CliError.forbidden('msg');
    expect(e.kind).toBe('forbidden');
    expect(e.status).toBe(403);
  });

  it('notFound sets kind, status 404, resourceId', () => {
    const e = CliError.notFound('msg', 'res1');
    expect(e.kind).toBe('notFound');
    expect(e.status).toBe(404);
    expect(e.resourceId).toBe('res1');
  });

  it('rateLimited sets kind, status 429, retryAfter', () => {
    const e = CliError.rateLimited('msg', 30);
    expect(e.kind).toBe('rateLimited');
    expect(e.status).toBe(429);
    expect(e.retryAfter).toBe(30);
  });

  it('server sets kind and status 500', () => {
    const e = CliError.server('msg');
    expect(e.kind).toBe('server');
    expect(e.status).toBe(500);
  });

  it('config sets kind', () => {
    const e = CliError.config('msg');
    expect(e.kind).toBe('config');
  });

  it('branchDetect sets kind and hint', () => {
    const e = CliError.branchDetect('msg', 'hint here');
    expect(e.kind).toBe('branchDetect');
    expect(e.hint).toBe('hint here');
  });

  it('io sets kind', () => {
    const e = CliError.io('msg');
    expect(e.kind).toBe('io');
  });
});

describe('CliError hints', () => {
  it('auth has setup hint', () => {
    expect(CliError.auth('x').hint).toContain('API token');
  });

  it('forbidden has plan hint', () => {
    expect(CliError.forbidden('x').hint).toContain('Business+');
  });

  it('notFound with resourceId includes the id', () => {
    expect(CliError.notFound('x', 'abc').hint).toContain("'abc'");
  });

  it('notFound without resourceId has generic hint', () => {
    expect(CliError.notFound('x').hint).toContain('custom-task-id');
  });

  it('rateLimited with retryAfter includes the number', () => {
    expect(CliError.rateLimited('x', 42).hint).toContain('42');
  });

  it('rateLimited without retryAfter has no hint', () => {
    expect(CliError.rateLimited('x').hint).toBeUndefined();
  });

  it('server has retry hint', () => {
    expect(CliError.server('x').hint).toContain('server error');
  });

  it('config has setup hint', () => {
    expect(CliError.config('x').hint).toContain('setup');
  });

  it('branchDetect uses the passed hint', () => {
    expect(CliError.branchDetect('x', 'custom hint').hint).toBe('custom hint');
  });

  it('client has no default hint', () => {
    expect(CliError.client('x').hint).toBeUndefined();
  });

  it('io has no default hint', () => {
    expect(CliError.io('x').hint).toBeUndefined();
  });

  it('network has connectivity hint', () => {
    expect(new CliError('network', 'x').hint).toContain('internet connection');
  });

  it('timeout has --timeout hint', () => {
    expect(new CliError('timeout', 'x').hint).toContain('--timeout');
  });
});

describe('CliError.print', () => {
  it('json mode produces valid JSON with error, message, exit_code', () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    CliError.client('test error', 400).print('json');
    spy.mockRestore();
    const parsed = JSON.parse(writes.join(''));
    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('test error');
    expect(parsed.exit_code).toBe(1);
  });

  it('json mode includes hint when present', () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    CliError.auth('denied').print('json');
    spy.mockRestore();
    const parsed = JSON.parse(writes.join(''));
    expect(parsed.hint).toBeDefined();
    expect(parsed.exit_code).toBe(2);
  });

  it('table mode prints "Error: ..." to stderr', () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    CliError.client('boom', 400).print('table');
    spy.mockRestore();
    const output = writes.join('');
    expect(output).toContain('Error: boom');
  });

  it('table mode prints Status and Hint lines', () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    CliError.auth('denied').print('table');
    spy.mockRestore();
    const output = writes.join('');
    expect(output).toContain('Error: denied');
    expect(output).toContain('Status: 401');
    expect(output).toContain('Hint:');
  });

  it('table mode omits Status line when no status', () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    CliError.config('bad').print('table');
    spy.mockRestore();
    const output = writes.join('');
    expect(output).toContain('Error: bad');
    expect(output).not.toContain('Status:');
    expect(output).toContain('Hint:');
  });
});
