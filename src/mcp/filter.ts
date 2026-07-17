export type Profile = 'all' | 'read' | 'safe';

export interface FilterOptions {
  profile?: Profile;
  readOnly?: boolean;
  groups?: string[];
  excludeGroups?: string[];
  tools?: string[];
  excludeTools?: string[];
}

const WRITE_KEYWORDS = [
  'create',
  'update',
  'delete',
  'add',
  'remove',
  'set',
  'unset',
  'start',
  'stop',
  'link',
  'unlink',
  'move',
  'replace',
  'rename',
  'invite',
  'reply',
];

function isReadOnly(name: string): boolean {
  return !WRITE_KEYWORDS.some((kw) => name.includes(kw));
}

function isSafe(name: string): boolean {
  if (name.includes('delete') || name.includes('remove') || name.includes('unlink')) {
    return false;
  }
  if (name.includes('replace_estimates') || name.includes('replace-estimates')) {
    return false;
  }
  if (isReadOnly(name)) return true;
  if (name.includes('create') || name.includes('update')) return true;
  return false;
}

function resolveProfile(opts: FilterOptions): Profile {
  if (opts.profile) return opts.profile;
  if (opts.readOnly) return 'read';
  return 'all';
}

export class Filter {
  private opts: FilterOptions;

  constructor(opts: FilterOptions) {
    this.opts = opts;
  }

  allows(toolName: string): boolean {
    const profile = resolveProfile(this.opts);
    if (profile === 'read' && !isReadOnly(toolName)) return false;
    if (profile === 'safe' && !isSafe(toolName)) return false;

    if (this.opts.tools && !this.opts.tools.includes(toolName)) return false;
    if (this.opts.excludeTools?.includes(toolName)) return false;

    return true;
  }

  apply<T extends { name: string; _group?: string }>(tools: T[]): T[] {
    return tools.filter((t) => {
      if (!this.allows(t.name)) return false;
      if (this.opts.groups) {
        if (!t._group || !this.opts.groups.includes(t._group)) return false;
      }
      if (this.opts.excludeGroups && t._group && this.opts.excludeGroups.includes(t._group)) {
        return false;
      }
      return true;
    });
  }
}

function parseListEnv(env: string | undefined): string[] | undefined {
  if (!env) return undefined;
  const parts = env
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

export function filterFromEnv(): Filter {
  const profile = process.env.CLICKUP_MCP_PROFILE as Profile | undefined;
  const readOnly = process.env.CLICKUP_MCP_READ_ONLY === '1';
  const groups = parseListEnv(process.env.CLICKUP_MCP_GROUPS);
  const excludeGroups = parseListEnv(process.env.CLICKUP_MCP_EXCLUDE_GROUPS);
  const tools = parseListEnv(process.env.CLICKUP_MCP_TOOLS);
  const excludeTools = parseListEnv(process.env.CLICKUP_MCP_EXCLUDE_TOOLS);

  const opts: FilterOptions = {};
  if (profile) opts.profile = profile;
  if (readOnly) opts.readOnly = true;
  if (groups) opts.groups = groups;
  if (excludeGroups) opts.excludeGroups = excludeGroups;
  if (tools) opts.tools = tools;
  if (excludeTools) opts.excludeTools = excludeTools;

  return new Filter(opts);
}
