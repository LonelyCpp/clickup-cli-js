import { describe, expect, it } from 'vitest';
import {
  isFieldId,
  parseTypeConfig,
  resolveFieldId,
  taskHasFieldValue,
} from '../src/commands/field.js';

describe('isFieldId', () => {
  it('returns true for a lowercase UUID', () => {
    expect(isFieldId('5dc86497-098d-4bb0-87d6-cf28e43812e7')).toBe(true);
  });

  it('returns true for an uppercase UUID', () => {
    expect(isFieldId('5DC86497-098D-4BB0-87D6-CF28E43812E7')).toBe(true);
  });

  it('returns false for a field name', () => {
    expect(isFieldId('Priority')).toBe(false);
  });

  it('returns false for a numeric id', () => {
    expect(isFieldId('12345')).toBe(false);
  });
});

describe('resolveFieldId', () => {
  const fields = [
    { id: '5dc86497-098d-4bb0-87d6-cf28e43812e7', name: 'Text Field', type: 'text' },
    { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'Bug Severity', type: 'drop_down' },
  ];

  it('returns the input when it is already a UUID', () => {
    expect(resolveFieldId(fields, '5dc86497-098d-4bb0-87d6-cf28e43812e7')).toBe(
      '5dc86497-098d-4bb0-87d6-cf28e43812e7'
    );
  });

  it('looks up a field by name', () => {
    expect(resolveFieldId(fields, 'Bug Severity')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('returns undefined for an unknown name', () => {
    expect(resolveFieldId(fields, 'Missing')).toBeUndefined();
  });

  it('returns undefined for an unknown UUID', () => {
    expect(resolveFieldId(fields, '00000000-0000-0000-0000-000000000000')).toBe(
      '00000000-0000-0000-0000-000000000000'
    );
  });
});

describe('taskHasFieldValue', () => {
  const task = {
    id: 'abc123',
    custom_fields: [
      { id: '5dc86497-098d-4bb0-87d6-cf28e43812e7', name: 'Text Field', value: 'hello' },
      { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'Empty', value: null },
      { id: '00000000-0000-0000-0000-000000000000', name: 'Unset' },
      { id: '11111111-1111-1111-1111-111111111111', name: 'Zero', value: 0 },
      { id: '22222222-2222-2222-2222-222222222222', name: 'False', value: false },
    ],
  };

  it('returns true when the field has a string value', () => {
    expect(taskHasFieldValue(task, '5dc86497-098d-4bb0-87d6-cf28e43812e7')).toBe(true);
  });

  it('returns false when the field value is null', () => {
    expect(taskHasFieldValue(task, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });

  it('returns false when the field has no value key', () => {
    expect(taskHasFieldValue(task, '00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('returns true for a zero value', () => {
    expect(taskHasFieldValue(task, '11111111-1111-1111-1111-111111111111')).toBe(true);
  });

  it('returns true for a false value', () => {
    expect(taskHasFieldValue(task, '22222222-2222-2222-2222-222222222222')).toBe(true);
  });

  it('returns false when the field is not in custom_fields', () => {
    expect(taskHasFieldValue(task, '33333333-3333-3333-3333-333333333333')).toBe(false);
  });

  it('returns false when task has no custom_fields', () => {
    expect(taskHasFieldValue({ id: 't2' }, '5dc86497-098d-4bb0-87d6-cf28e43812e7')).toBe(false);
  });
});

describe('parseTypeConfig', () => {
  it('returns undefined for empty input', () => {
    expect(parseTypeConfig(undefined)).toBeUndefined();
    expect(parseTypeConfig('')).toBeUndefined();
  });

  it('parses a JSON string into an object', () => {
    expect(parseTypeConfig('{"options":[{"name":"A"}]}')).toEqual({
      options: [{ name: 'A' }],
    });
  });

  it('throws a client error for invalid JSON', () => {
    expect(() => parseTypeConfig('not-json')).toThrow('Invalid --type-config JSON');
  });
});
