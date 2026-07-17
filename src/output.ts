import Table from 'cli-table3';

export type OutputMode = 'table' | 'compact' | 'json' | 'json-compact' | 'csv';

export interface OutputConfigOptions {
  mode: OutputMode;
  fields?: string[];
  noHeader: boolean;
  quiet: boolean;
  maxChars: number;
  maxTokens?: number;
}

export function flattenValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 1_000_000_000_000 && parsed < 10_000_000_000_000) {
      const dt = new Date(parsed);
      const iso = dt.toISOString();
      return iso.slice(0, 10);
    }
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => {
      if (v !== null && typeof v === 'object' && 'username' in v) {
        return String((v as Record<string, unknown>).username);
      }
      if (typeof v === 'string') return v;
      return JSON.stringify(v);
    });
    return items.length === 0 ? '-' : items.join(', ');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.status === 'string') return obj.status;
    if (typeof obj.priority === 'string') return obj.priority;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.username === 'string') return obj.username;
    return JSON.stringify(obj);
  }
  return JSON.stringify(value);
}

export function truncateText(value: string, maxChars: number): string {
  if (maxChars === 0 || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\u2026`;
}

function truncateForDisplay(value: unknown, maxChars: number): string {
  const flat = flattenValue(value);
  return truncateText(flat, maxChars);
}

export class OutputConfig {
  mode: OutputMode;
  fields?: string[];
  noHeader: boolean;
  quiet: boolean;
  maxChars: number;
  maxTokens?: number;

  constructor(opts: OutputConfigOptions) {
    this.mode = opts.mode;
    this.fields = opts.fields;
    this.noHeader = opts.noHeader;
    this.quiet = opts.quiet;
    this.maxChars = opts.maxChars;
    this.maxTokens = opts.maxTokens;
  }

  static fromCli(
    mode: string,
    fields: string | undefined,
    noHeader: boolean,
    quiet: boolean,
    maxChars: number,
    maxTokens?: number
  ): OutputConfig {
    return new OutputConfig({
      mode: mode as OutputMode,
      fields: fields
        ? fields
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : undefined,
      noHeader,
      quiet,
      maxChars,
      maxTokens,
    });
  }

  printItems(items: Record<string, unknown>[], defaultFields: string[], idField: string): void {
    if (this.quiet) {
      for (const item of items) {
        const id = item[idField];
        if (typeof id === 'string') console.log(id);
      }
      return;
    }

    const fields = this.fields ?? defaultFields;

    if (this.maxTokens != null && this.maxTokens > 0 && items.length > 0) {
      const fitted = fitToTokenBudget(items, fields, this.mode, this.maxTokens);
      this.renderItems(fitted.items, fields);
      if (fitted.truncated) {
        console.log(
          JSON.stringify({
            truncated: true,
            shown: fitted.shown,
            total: fitted.total,
          })
        );
      }
      return;
    }

    this.renderItems(items, fields);
  }

  private renderItems(items: Record<string, unknown>[], fields: string[]): void {
    switch (this.mode) {
      case 'json':
        console.log(JSON.stringify(items, null, 2));
        break;
      case 'json-compact':
        console.log(JSON.stringify(compactItems(items, fields, this.maxChars), null, 2));
        break;
      case 'compact':
        this.renderCompact(items, fields);
        break;
      case 'csv':
        this.renderCsv(items, fields);
        break;
      default:
        this.renderTable(items, fields);
        break;
    }
  }

  private renderTable(items: Record<string, unknown>[], fields: string[]): void {
    const table = new Table({ head: fields, wordWrap: true });
    for (const item of items) {
      table.push(fields.map((f) => truncateForDisplay(item[f], this.maxChars)));
    }
    console.log(table.toString());
  }

  private renderCompact(items: Record<string, unknown>[], fields: string[]): void {
    if (!this.noHeader) console.log(fields.join('|'));
    for (const item of items) {
      const row = fields.map((f) => truncateForDisplay(item[f], this.maxChars));
      console.log(row.join('|'));
    }
  }

  private renderCsv(items: Record<string, unknown>[], fields: string[]): void {
    if (!this.noHeader) console.log(fields.join(','));
    for (const item of items) {
      const row = fields.map((f) => {
        const val = truncateForDisplay(item[f], this.maxChars);
        if (val.includes(',')) return `"${val.replace(/"/g, '""')}"`;
        return val;
      });
      console.log(row.join(','));
    }
  }

  printSingle(item: Record<string, unknown>, defaultFields: string[], idField: string): void {
    this.printItems([item], defaultFields, idField);
  }

  printMessage(message: string): void {
    if (this.mode === 'json' || this.mode === 'json-compact') {
      console.log(JSON.stringify({ message }));
    } else {
      console.log(message);
    }
  }

  printSummary(items: Record<string, unknown>[], noun: string): void {
    if (this.mode === 'json' || this.mode === 'json-compact') {
      const summary = buildSummary(items);
      console.log(JSON.stringify({ summary }, null, 2));
      return;
    }
    console.log(formatSummary(items, noun));
  }
}

export function compactItems(
  items: Record<string, unknown>[],
  fields: string[],
  maxChars = 0
): Record<string, unknown>[] {
  return items.map((item) => {
    const obj: Record<string, unknown> = {};
    for (const field of fields) {
      const value = item[field];
      if (value === null || value === undefined) {
        obj[field] = null;
      } else if (typeof value === 'string') {
        obj[field] = maxChars > 0 ? truncateText(value, maxChars) : value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        obj[field] = value;
      } else {
        const flat = flattenValue(value);
        obj[field] = maxChars > 0 ? truncateText(flat, maxChars) : flat;
      }
    }
    return obj;
  });
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function fitToTokenBudget(
  items: Record<string, unknown>[],
  fields: string[],
  mode: OutputMode,
  maxTokens: number
): { items: Record<string, unknown>[]; truncated: boolean; shown: number; total: number } {
  let usedTokens = 0;
  const headerTokens =
    mode === 'json' || mode === 'json-compact'
      ? estimateTokens('[]')
      : estimateTokens(fields.join('|'));
  usedTokens += headerTokens;

  const fitting: Record<string, unknown>[] = [];
  for (const item of items) {
    let itemText: string;
    if (mode === 'json' || mode === 'json-compact') {
      itemText = JSON.stringify(compactItems([item], fields));
    } else {
      itemText = fields.map((f) => flattenValue(item[f])).join('|');
    }
    const itemTokens = estimateTokens(itemText);
    if (usedTokens + itemTokens > maxTokens) break;
    usedTokens += itemTokens;
    fitting.push(item);
  }

  return {
    items: fitting,
    truncated: fitting.length < items.length,
    shown: fitting.length,
    total: items.length,
  };
}

export function countItems(items: unknown[]): number {
  return items.length;
}

function buildSummary(items: Record<string, unknown>[]): {
  total: number;
  statuses: Record<string, number>;
  overdue: number;
  assignees: Record<string, number>;
} {
  const statuses: Record<string, number> = {};
  let overdue = 0;
  const assigneeCounts: Record<string, number> = {};
  const now = Date.now();

  for (const item of items) {
    const status = extractStatus(item);
    if (status) statuses[status] = (statuses[status] ?? 0) + 1;

    const dueDate = extractDueDateMs(item);
    if (dueDate != null && dueDate < now) overdue++;

    const assignees = extractAssignees(item);
    if (assignees.length === 0) {
      assigneeCounts.unassigned = (assigneeCounts.unassigned ?? 0) + 1;
    } else {
      for (const a of assignees) {
        assigneeCounts[a] = (assigneeCounts[a] ?? 0) + 1;
      }
    }
  }

  return { total: items.length, statuses, overdue, assignees: assigneeCounts };
}

function formatSummary(items: Record<string, unknown>[], noun: string): string {
  const s = buildSummary(items);
  const parts: string[] = [`${s.total} ${noun}`];

  const statusParts = Object.entries(s.statuses).map(([name, count]) => `${count} ${name}`);
  if (statusParts.length > 0) parts.push(statusParts.join(', '));

  if (s.overdue > 0) parts.push(`overdue: ${s.overdue}`);

  const assigneeEntries = Object.entries(s.assignees)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name}(${count})`);
  if (assigneeEntries.length > 0) parts.push(`assignees: ${assigneeEntries.join(', ')}`);

  return parts.join(' | ');
}

function extractStatus(item: Record<string, unknown>): string | null {
  const status = item.status;
  if (typeof status === 'string') return status;
  if (status !== null && typeof status === 'object') {
    const s = (status as Record<string, unknown>).status;
    if (typeof s === 'string') return s;
  }
  return null;
}

function extractDueDateMs(item: Record<string, unknown>): number | null {
  const due = item.due_date;
  if (typeof due === 'string') {
    const n = Number.parseInt(due, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof due === 'number') return due;
  return null;
}

function extractAssignees(item: Record<string, unknown>): string[] {
  const assignees = item.assignees;
  if (!Array.isArray(assignees)) return [];
  return assignees.map((a) => {
    if (a !== null && typeof a === 'object') {
      const u = (a as Record<string, unknown>).username;
      if (typeof u === 'string') return u;
      const id = (a as Record<string, unknown>).id;
      if (id != null) return String(id);
    }
    if (typeof a === 'string') return a;
    return '?';
  });
}
