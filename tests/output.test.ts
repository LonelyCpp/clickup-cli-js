import { describe, it, expect } from 'vitest';
import {
  flattenValue,
  truncateText,
  OutputConfig,
  compactItems,
  estimateTokens,
  fitToTokenBudget,
  countItems,
} from '../src/output.js';

describe('flattenValue', () => {
  it('null → "-"', () => expect(flattenValue(null)).toBe('-'));
  it('undefined → "-"', () => expect(flattenValue(undefined)).toBe('-'));
  it('string', () => expect(flattenValue('hello')).toBe('hello'));
  it('number', () => expect(flattenValue(42)).toBe('42'));
  it('bool', () => expect(flattenValue(true)).toBe('true'));
  it('status object', () =>
    expect(flattenValue({ status: 'in progress', color: '#abc' })).toBe('in progress'));
  it('priority object', () =>
    expect(flattenValue({ priority: 'high', color: '#red' })).toBe('high'));
  it('assignees array', () =>
    expect(flattenValue([{ username: 'Nick' }, { username: 'Bob' }])).toBe('Nick, Bob'));
  it('empty array → "-"', () => expect(flattenValue([])).toBe('-'));
  it('object with name', () => expect(flattenValue({ name: 'My Space', id: '123' })).toBe('My Space'));
  it('due_date ms timestamp', () => {
    expect(flattenValue('1773705600000')).toBe('2026-03-17');
  });
  it('normal string not converted', () => expect(flattenValue('hello world')).toBe('hello world'));
  it('string array', () => expect(flattenValue(['a', 'b'])).toBe('a, b'));
  it('object with username', () => expect(flattenValue({ username: 'alice' })).toBe('alice'));
});

describe('OutputConfig.fromCli', () => {
  it('parses fields', () => {
    const c = OutputConfig.fromCli('table', 'id, name, status', false, false, 60);
    expect(c.fields).toEqual(['id', 'name', 'status']);
  });
  it('no fields → undefined', () => {
    const c = OutputConfig.fromCli('json', undefined, false, false, 60);
    expect(c.fields).toBeUndefined();
  });
  it('trims whitespace in fields', () => {
    const c = OutputConfig.fromCli('table', '  id ,  name  ', false, false, 60);
    expect(c.fields).toEqual(['id', 'name']);
  });
});

describe('truncateText', () => {
  it('under limit → unchanged', () => expect(truncateText('short', 60)).toBe('short'));
  it('over limit → truncated with …', () =>
    expect(truncateText('a'.repeat(100), 10)).toBe('a'.repeat(10) + '\u2026'));
  it('0 → no truncation', () => expect(truncateText('a'.repeat(100), 0)).toBe('a'.repeat(100)));
  it('exactly at limit → unchanged', () => expect(truncateText('1234567890', 10)).toBe('1234567890'));
});

describe('compactItems — TYPE-PRESERVING (Tier A-1)', () => {
  it('preserves number types', () => {
    const items = [{ id: 'abc', priority: 3, active: true, name: 'test' }];
    const result = compactItems(items, ['id', 'priority', 'active', 'name']);
    expect(result[0].priority).toBe(3);
    expect(result[0].active).toBe(true);
    expect(result[0].id).toBe('abc');
    expect(result[0].name).toBe('test');
  });
  it('missing field → null (not "-")', () => {
    const items = [{ id: 'abc' }];
    const result = compactItems(items, ['id', 'priority']);
    expect(result[0].priority).toBeNull();
  });
  it('nested object flattened to string', () => {
    const items = [{ id: 'abc', status: { status: 'Open' } }];
    const result = compactItems(items, ['id', 'status']);
    expect(result[0].status).toBe('Open');
  });
  it('applies maxChars when specified', () => {
    const items = [{ id: 'abc', name: 'a'.repeat(100) }];
    const result = compactItems(items, ['id', 'name'], 10);
    expect(result[0].name).toBe('a'.repeat(10) + '\u2026');
  });
  it('no maxChars by default', () => {
    const items = [{ id: 'abc', name: 'a'.repeat(100) }];
    const result = compactItems(items, ['id', 'name']);
    expect(result[0].name).toBe('a'.repeat(100));
  });
});

describe('estimateTokens', () => {
  it('~4 chars per token', () => expect(estimateTokens('hello world!')).toBe(3));
  it('empty string → 0', () => expect(estimateTokens('')).toBe(0));
});

describe('fitToTokenBudget', () => {
  it('returns all items when budget is large', () => {
    const items = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ];
    const result = fitToTokenBudget(items, ['id', 'name'], 'compact', 1000);
    expect(result.truncated).toBe(false);
    expect(result.shown).toBe(2);
    expect(result.total).toBe(2);
  });
  it('truncates when budget is small', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `task-${i}` }));
    const result = fitToTokenBudget(items, ['id', 'name'], 'compact', 10);
    expect(result.truncated).toBe(true);
    expect(result.shown).toBeLessThan(100);
    expect(result.total).toBe(100);
  });
});

describe('countItems', () => {
  it('returns length', () => {
    expect(countItems([1, 2, 3])).toBe(3);
    expect(countItems([])).toBe(0);
  });
});

describe('OutputConfig.printItems', () => {
  const items = [
    { id: 'abc', name: 'Task 1', status: { status: 'Open' }, priority: 3 },
    { id: 'def', name: 'Task 2', status: { status: 'Done' }, priority: 1 },
  ];
  const fields = ['id', 'name', 'status', 'priority'];

  function captureLog(fn: () => void): string[] {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      fn();
    } finally {
      console.log = orig;
    }
    return logs;
  }

  it('quiet mode prints only IDs', () => {
    const c = OutputConfig.fromCli('table', undefined, false, true, 60);
    const logs = captureLog(() => c.printItems(items, fields, 'id'));
    expect(logs).toEqual(['abc', 'def']);
  });

  it('compact mode prints pipe-delimited with header', () => {
    const c = OutputConfig.fromCli('compact', undefined, false, false, 60);
    const logs = captureLog(() => c.printItems(items, fields, 'id'));
    expect(logs[0]).toBe('id|name|status|priority');
    expect(logs[1]).toBe('abc|Task 1|Open|3');
    expect(logs[2]).toBe('def|Task 2|Done|1');
  });

  it('compact mode with noHeader omits header', () => {
    const c = OutputConfig.fromCli('compact', undefined, true, false, 60);
    const logs = captureLog(() => c.printItems(items, fields, 'id'));
    expect(logs[0]).toBe('abc|Task 1|Open|3');
  });

  it('csv mode prints comma-delimited', () => {
    const c = OutputConfig.fromCli('csv', undefined, false, false, 60);
    const logs = captureLog(() => c.printItems(items, fields, 'id'));
    expect(logs[0]).toBe('id,name,status,priority');
    expect(logs[1]).toBe('abc,Task 1,Open,3');
  });

  it('json mode prints full JSON', () => {
    const c = OutputConfig.fromCli('json', undefined, false, false, 60);
    const logs = captureLog(() => c.printItems(items, fields, 'id'));
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('abc');
    expect(parsed[0].status).toEqual({ status: 'Open' });
  });

  it('json-compact mode prints type-preserving JSON', () => {
    const c = OutputConfig.fromCli('json-compact', undefined, false, false, 60);
    const logs = captureLog(() => c.printItems(items, fields, 'id'));
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed[0].priority).toBe(3);
    expect(parsed[0].priority).not.toBe('3');
    expect(parsed[0].status).toBe('Open');
  });

  it('maxChars truncation applied in compact mode', () => {
    const longItems = [{ id: 'abc', name: 'a'.repeat(100) }];
    const c = OutputConfig.fromCli('compact', undefined, false, false, 10);
    const logs = captureLog(() => c.printItems(longItems, ['id', 'name'], 'id'));
    expect(logs[1]).toContain('\u2026');
    expect(logs[1].length).toBeLessThan(30);
  });

  it('maxTokens triggers truncation footer', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `t${i}` }));
    const c = OutputConfig.fromCli('compact', undefined, false, false, 60, 10);
    const logs = captureLog(() => c.printItems(many, ['id', 'name'], 'id'));
    const lastLine = logs[logs.length - 1];
    const footer = JSON.parse(lastLine);
    expect(footer.truncated).toBe(true);
    expect(footer.total).toBe(100);
  });

  it('table mode renders a table', () => {
    const c = OutputConfig.fromCli('table', undefined, false, false, 60);
    const logs = captureLog(() => c.printItems(items, fields, 'id'));
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('id');
    expect(logs[0]).toContain('abc');
  });
});

describe('OutputConfig.printMessage', () => {
  function captureLog(fn: () => void): string[] {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      fn();
    } finally {
      console.log = orig;
    }
    return logs;
  }

  it('json mode prints {"message": "..."}', () => {
    const c = OutputConfig.fromCli('json', undefined, false, false, 60);
    const logs = captureLog(() => c.printMessage('Task deleted'));
    expect(JSON.parse(logs[0])).toEqual({ message: 'Task deleted' });
  });

  it('table mode prints plain text', () => {
    const c = OutputConfig.fromCli('table', undefined, false, false, 60);
    const logs = captureLog(() => c.printMessage('Task deleted'));
    expect(logs[0]).toBe('Task deleted');
  });
});

describe('OutputConfig.printSummary', () => {
  function captureLog(fn: () => void): string[] {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try {
      fn();
    } finally {
      console.log = orig;
    }
    return logs;
  }

  const items = [
    { id: '1', status: { status: 'Open' }, assignees: [{ username: 'alice' }], due_date: null },
    { id: '2', status: { status: 'Open' }, assignees: [{ username: 'bob' }], due_date: null },
    {
      id: '3',
      status: { status: 'Done' },
      assignees: [],
      due_date: String(Date.now() - 86400000),
    },
  ];

  it('table mode prints summary string', () => {
    const c = OutputConfig.fromCli('table', undefined, false, false, 60);
    const logs = captureLog(() => c.printSummary(items, 'tasks'));
    expect(logs[0]).toContain('3 tasks');
    expect(logs[0]).toContain('2 Open');
    expect(logs[0]).toContain('1 Done');
    expect(logs[0]).toContain('overdue: 1');
    expect(logs[0]).toContain('alice(1)');
  });

  it('json mode prints structured summary', () => {
    const c = OutputConfig.fromCli('json', undefined, false, false, 60);
    const logs = captureLog(() => c.printSummary(items, 'tasks'));
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.summary.total).toBe(3);
    expect(parsed.summary.statuses.Open).toBe(2);
    expect(parsed.summary.overdue).toBe(1);
  });
});
