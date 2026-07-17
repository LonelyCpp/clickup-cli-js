import { describe, expect, it } from 'vitest';
import { Filter } from '../src/mcp/filter.js';

const sampleTools = [
  { name: 'clickup_task_list', _group: 'task' },
  { name: 'clickup_task_get', _group: 'task' },
  { name: 'clickup_task_create', _group: 'task' },
  { name: 'clickup_task_delete', _group: 'task' },
  { name: 'clickup_comment_list', _group: 'comment' },
  { name: 'clickup_comment_create', _group: 'comment' },
  { name: 'clickup_space_list', _group: 'space' },
  { name: 'clickup_space_delete', _group: 'space' },
] as any[];

describe('Filter', () => {
  it('all profile allows everything', () => {
    const f = new Filter({ profile: 'all' });
    expect(f.apply(sampleTools)).toHaveLength(8);
  });

  it('read profile excludes create/delete', () => {
    const f = new Filter({ profile: 'read' });
    const result = f.apply(sampleTools);
    expect(result.find((t) => t.name === 'clickup_task_create')).toBeUndefined();
    expect(result.find((t) => t.name === 'clickup_task_delete')).toBeUndefined();
    expect(result.find((t) => t.name === 'clickup_task_list')).toBeDefined();
  });

  it('readOnly is alias for read profile', () => {
    const f = new Filter({ readOnly: true });
    const result = f.apply(sampleTools);
    expect(result.find((t) => t.name === 'clickup_task_delete')).toBeUndefined();
  });

  it('groups filter includes only specified groups', () => {
    const f = new Filter({ groups: ['task'] });
    const result = f.apply(sampleTools);
    expect(result.every((t) => t._group === 'task')).toBe(true);
    expect(result).toHaveLength(4);
  });

  it('excludeGroups drops specified groups', () => {
    const f = new Filter({ excludeGroups: ['comment'] });
    const result = f.apply(sampleTools);
    expect(result.find((t) => t._group === 'comment')).toBeUndefined();
    expect(result).toHaveLength(6);
  });

  it('tools filter includes only specified tools', () => {
    const f = new Filter({ tools: ['clickup_task_list', 'clickup_task_get'] });
    expect(f.apply(sampleTools)).toHaveLength(2);
  });

  it('excludeTools drops specified tools', () => {
    const f = new Filter({ excludeTools: ['clickup_task_delete'] });
    const result = f.apply(sampleTools);
    expect(result.find((t) => t.name === 'clickup_task_delete')).toBeUndefined();
    expect(result).toHaveLength(7);
  });

  it('allows() checks individual tools', () => {
    const f = new Filter({ tools: ['clickup_task_list'] });
    expect(f.allows('clickup_task_list')).toBe(true);
    expect(f.allows('clickup_task_get')).toBe(false);
  });

  it('safe profile allows create and update but not delete', () => {
    const f = new Filter({ profile: 'safe' });
    const result = f.apply(sampleTools);
    expect(result.find((t) => t.name === 'clickup_task_create')).toBeDefined();
    expect(result.find((t) => t.name === 'clickup_task_list')).toBeDefined();
    expect(result.find((t) => t.name === 'clickup_task_delete')).toBeUndefined();
    expect(result.find((t) => t.name === 'clickup_space_delete')).toBeUndefined();
  });

  it('profile takes precedence over readOnly', () => {
    const f = new Filter({ profile: 'all', readOnly: true });
    expect(f.apply(sampleTools)).toHaveLength(8);
  });

  it('AND-combines groups and tools filters', () => {
    const f = new Filter({ groups: ['task'], tools: ['clickup_task_list', 'clickup_task_get'] });
    const result = f.apply(sampleTools);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t._group === 'task')).toBe(true);
  });
});
