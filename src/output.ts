import { writeFileSync } from 'node:fs';
import Table from 'cli-table3';
import { CliError } from './error.js';

export type OutputMode = 'table' | 'compact' | 'json' | 'json-compact' | 'csv' | 'brief';

export interface PageInfo {
  hasMore: boolean;
}

export interface OutputConfigOptions {
  mode: OutputMode;
  fields?: string[];
  noHeader: boolean;
  quiet: boolean;
  maxChars: number;
  maxTokens?: number;
  outputFile?: string;
}

const BRIEF_FIELDS = ['id', 'name', 'status', 'tags', 'assignees', 'description'];

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
      if (v !== null && typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        if (typeof obj.name === 'string') return obj.name;
        if (typeof obj.username === 'string') return obj.username;
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
  return `${value.slice(0, maxChars)}…`;
}

function truncateForDisplay(value: unknown, maxChars: number): string {
  const flat = flattenValue(value);
  return truncateText(flat, maxChars);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getFieldValue(item: Record<string, unknown>, field: string): unknown {
  if (field in item) return item[field];
  const customFields = item.custom_fields;
  if (Array.isArray(customFields)) {
    const isUuid = UUID_RE.test(field);
    for (const cf of customFields) {
      if (cf !== null && typeof cf === 'object') {
        const obj = cf as Record<string, unknown>;
        if (isUuid && obj.id === field) return extractCustomFieldValue(obj);
        if (!isUuid && obj.name === field) return extractCustomFieldValue(obj);
      }
    }
  }
  return undefined;
}

function extractCustomFieldValue(cf: Record<string, unknown>): unknown {
  if (cf.value === null || cf.value === undefined) return null;
  if (cf.type === 'drop_down' || cf.type === 'labels') {
    const config = cf.type_config as Record<string, unknown> | undefined;
    const options = config?.options;
    if (Array.isArray(options)) {
      const ids = Array.isArray(cf.value) ? cf.value : [cf.value];
      const names = ids
        .map((id) => {
          const opt = options.find(
            (o: unknown) =>
              o !== null && typeof o === 'object' && (o as Record<string, unknown>).id === id
          );
          return opt ? (opt as Record<string, unknown>).name : id;
        })
        .filter((n) => n != null);
      return names.length > 0 ? names.join(', ') : cf.value;
    }
  }
  return cf.value;
}

function resolveFieldLabels(items: Record<string, unknown>[], fields: string[]): string[] {
  const uuidToName = new Map<string, string>();
  for (const item of items) {
    const cfs = item.custom_fields;
    if (Array.isArray(cfs)) {
      for (const cf of cfs) {
        if (cf !== null && typeof cf === 'object') {
          const obj = cf as Record<string, unknown>;
          if (
            typeof obj.id === 'string' &&
            typeof obj.name === 'string' &&
            !uuidToName.has(obj.id)
          ) {
            uuidToName.set(obj.id, obj.name);
          }
        }
      }
    }
    if (uuidToName.size > 0 && fields.every((f) => !UUID_RE.test(f) || uuidToName.has(f))) break;
  }
  return fields.map((f) => uuidToName.get(f) ?? f);
}

export class OutputConfig {
  mode: OutputMode;
  fields?: string[];
  noHeader: boolean;
  quiet: boolean;
  maxChars: number;
  maxTokens?: number;
  outputFile?: string;

  constructor(opts: OutputConfigOptions) {
    this.mode = opts.mode;
    this.fields = opts.fields;
    this.noHeader = opts.noHeader;
    this.quiet = opts.quiet;
    this.maxChars = opts.maxChars;
    this.maxTokens = opts.maxTokens;
    this.outputFile = opts.outputFile;
  }

  static fromCli(
    mode: string,
    fields: string | undefined,
    noHeader: boolean,
    quiet: boolean,
    maxChars: number,
    maxTokens?: number,
    outputFile?: string
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
      outputFile,
    });
  }

  private isJsonMode(): boolean {
    return this.mode === 'json' || this.mode === 'json-compact' || this.mode === 'brief';
  }

  printItems(
    items: Record<string, unknown>[],
    defaultFields: string[],
    idField: string,
    pageInfo?: PageInfo
  ): void {
    const fields = this.fields ?? defaultFields;

    if (this.outputFile) {
      this.writeToFile(items, fields, pageInfo);
      return;
    }

    if (this.quiet) {
      for (const item of items) {
        const id = item[idField];
        if (typeof id === 'string') console.log(id);
      }
      return;
    }

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
      this.printPaginationNote(pageInfo);
      return;
    }

    this.renderItems(items, fields);
    this.printPaginationNote(pageInfo);
  }

  private writeToFile(
    items: Record<string, unknown>[],
    fields: string[],
    pageInfo?: PageInfo
  ): void {
    const lines = this.renderLines(items, fields);
    const content = lines.join('\n');
    try {
      writeFileSync(this.outputFile as string, `${content}\n`, 'utf8');
    } catch (err) {
      throw CliError.io(
        `Failed to write --output-file '${this.outputFile}': ${(err as Error).message}`
      );
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    if (this.isJsonMode()) {
      const payload: Record<string, unknown> = {
        output_file: this.outputFile,
        count: items.length,
        bytes,
      };
      if (pageInfo?.hasMore) {
        payload.pagination = { has_more: true };
      }
      console.log(JSON.stringify(payload));
    } else {
      console.log(`Wrote ${items.length} item(s) (${bytes} bytes) to ${this.outputFile}`);
    }
    this.printPaginationNote(pageInfo);
  }

  private printPaginationNote(pageInfo?: PageInfo): void {
    if (!pageInfo?.hasMore) return;
    if (this.isJsonMode()) {
      console.log(
        JSON.stringify({
          pagination: {
            has_more: true,
            hint: 'Pass --all to fetch every page (or --page/--cursor/--start/--start-id to continue manually).',
          },
        })
      );
    } else {
      console.log('Note: more results available. Pass --all to fetch everything.');
    }
  }

  private renderItems(items: Record<string, unknown>[], fields: string[]): void {
    for (const line of this.renderLines(items, fields)) {
      console.log(line);
    }
  }

  private renderLines(items: Record<string, unknown>[], fields: string[]): string[] {
    switch (this.mode) {
      case 'json':
        return [JSON.stringify(this.fields ? projectFields(items, this.fields) : items, null, 2)];
      case 'json-compact':
        return [JSON.stringify(this.fields ? projectFields(items, this.fields) : items)];
      case 'brief': {
        const briefFields = this.fields ?? BRIEF_FIELDS;
        return [JSON.stringify(compactItems(items, briefFields, this.maxChars), null, 2)];
      }
      case 'compact':
        return this.compactLines(items, fields);
      case 'csv':
        return this.csvLines(items, fields);
      default:
        return [this.tableString(items, fields)];
    }
  }

  private tableString(items: Record<string, unknown>[], fields: string[]): string {
    const labels = resolveFieldLabels(items, fields);
    const table = new Table({ head: labels, wordWrap: true });
    for (const item of items) {
      table.push(fields.map((f) => truncateForDisplay(getFieldValue(item, f), this.maxChars)));
    }
    return table.toString();
  }

  private compactLines(items: Record<string, unknown>[], fields: string[]): string[] {
    const lines: string[] = [];
    if (!this.noHeader) lines.push(resolveFieldLabels(items, fields).join('|'));
    for (const item of items) {
      const row = fields.map((f) => truncateForDisplay(getFieldValue(item, f), this.maxChars));
      lines.push(row.join('|'));
    }
    return lines;
  }

  private csvLines(items: Record<string, unknown>[], fields: string[]): string[] {
    const lines: string[] = [];
    if (!this.noHeader) lines.push(resolveFieldLabels(items, fields).join(','));
    for (const item of items) {
      const row = fields.map((f) => {
        const val = truncateForDisplay(getFieldValue(item, f), this.maxChars);
        if (val.includes(',')) return `"${val.replace(/"/g, '""')}"`;
        return val;
      });
      lines.push(row.join(','));
    }
    return lines;
  }

  printSingle(item: Record<string, unknown>, defaultFields: string[], idField: string): void {
    this.printItems([item], defaultFields, idField);
  }

  printMessage(message: string): void {
    if (this.isJsonMode()) {
      console.log(JSON.stringify({ message }));
    } else {
      console.log(message);
    }
  }

  printSummary(items: Record<string, unknown>[], noun: string, pageInfo?: PageInfo): void {
    if (this.isJsonMode()) {
      const summary = buildSummary(items);
      console.log(JSON.stringify({ summary }, null, 2));
      this.printPaginationNote(pageInfo);
      return;
    }
    console.log(formatSummary(items, noun));
    this.printPaginationNote(pageInfo);
  }
}

export function projectFields(
  items: Record<string, unknown>[],
  fields: string[]
): Record<string, unknown>[] {
  return items.map((item) => {
    const obj: Record<string, unknown> = {};
    for (const field of fields) {
      const value = getFieldValue(item, field);
      obj[field] = value === undefined ? null : value;
    }
    return obj;
  });
}

export function compactItems(
  items: Record<string, unknown>[],
  fields: string[],
  maxChars = 0
): Record<string, unknown>[] {
  return items.map((item) => {
    const obj: Record<string, unknown> = {};
    for (const field of fields) {
      const value = getFieldValue(item, field);
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
    mode === 'json' || mode === 'json-compact' || mode === 'brief'
      ? estimateTokens('[]')
      : estimateTokens(fields.join('|'));
  usedTokens += headerTokens;

  const fitting: Record<string, unknown>[] = [];
  for (const item of items) {
    let itemText: string;
    if (mode === 'json' || mode === 'json-compact' || mode === 'brief') {
      itemText = JSON.stringify(compactItems([item], fields));
    } else {
      itemText = fields.map((f) => flattenValue(getFieldValue(item, f))).join('|');
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
