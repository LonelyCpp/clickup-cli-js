import { execFileSync } from 'node:child_process';
import { CliError } from './error.js';

export type TaskSource = 'explicit' | 'env' | 'branch';

export interface ResolvedTask {
  id: string;
  raw: string;
  isCustom: boolean;
  source: TaskSource;
  branch?: string;
}

const STRIPPED_PREFIXES = [
  'feature/',
  'feat/',
  'fix/',
  'hotfix/',
  'bugfix/',
  'release/',
  'chore/',
  'docs/',
  'refactor/',
  'test/',
  'ci/',
  'perf/',
  'build/',
  'style/',
];

const EXCLUDED_CUSTOM_PREFIXES = [
  'FEATURE',
  'FEAT',
  'BUGFIX',
  'BUG',
  'FIX',
  'HOTFIX',
  'RELEASE',
  'CHORE',
  'DOCS',
  'DOC',
  'REFACTOR',
  'TEST',
  'CI',
  'PERF',
  'BUILD',
  'STYLE',
  'WIP',
  'TMP',
];

const CU_REGEX = /\bCU-([0-9a-z]+)/i;
const CUSTOM_REGEX = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function currentBranch(): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
    const trimmed = out.trim();
    if (trimmed === '' || trimmed === 'HEAD') return null;
    return trimmed;
  } catch {
    return null;
  }
}

function stripPrefix(branch: string): string {
  const lower = branch.toLowerCase();
  for (const p of STRIPPED_PREFIXES) {
    if (lower.startsWith(p)) {
      return branch.slice(p.length);
    }
  }
  return branch;
}

export function extractTaskId(branch: string): ResolvedTask | null {
  const stripped = stripPrefix(branch);

  const cu = CU_REGEX.exec(stripped);
  if (cu) {
    return { id: cu[1], raw: cu[0], isCustom: false, source: 'branch', branch };
  }

  const customRe = new RegExp(CUSTOM_REGEX.source, 'g');
  for (const m of stripped.matchAll(customRe)) {
    const matched = m[1];
    const prefix = matched.split('-')[0];
    if (!EXCLUDED_CUSTOM_PREFIXES.includes(prefix)) {
      return { id: matched, raw: matched, isCustom: true, source: 'branch', branch };
    }
  }

  return null;
}

export function parseTaskId(arg: string): ResolvedTask {
  const trimmed = arg.trim();

  const cu = CU_REGEX.exec(trimmed);
  if (cu && cu[0].length === trimmed.length) {
    return { id: cu[1], raw: trimmed, isCustom: false, source: 'explicit' };
  }

  const custom = CUSTOM_REGEX.exec(trimmed);
  if (custom) {
    const matched = custom[1];
    const prefix = matched.split('-')[0];
    if (matched.length === trimmed.length && !EXCLUDED_CUSTOM_PREFIXES.includes(prefix)) {
      return { id: matched, raw: trimmed, isCustom: true, source: 'explicit' };
    }
  }

  return { id: trimmed, raw: trimmed, isCustom: false, source: 'explicit' };
}

function detectEnabled(configEnabled?: boolean): boolean {
  const env = process.env.CLICKUP_GIT_DETECT;
  if (env !== undefined) {
    const v = env.toLowerCase();
    if (v === '0' || v === 'false') return false;
  }
  return configEnabled ?? true;
}

export interface ResolveTaskOpts {
  configEnabled?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  outputMode?: string;
}

export function resolveTask(
  explicit: string | undefined,
  allowBranch: boolean,
  opts?: ResolveTaskOpts
): ResolvedTask | null {
  const verbose = opts?.verbose ?? true;
  const quiet = opts?.quiet ?? false;
  const outputMode = opts?.outputMode;

  if (explicit !== undefined && explicit.trim() !== '') {
    return parseTaskId(explicit);
  }

  const envId = process.env.CLICKUP_TASK_ID;
  if (envId !== undefined && envId.trim() !== '') {
    const t = parseTaskId(envId);
    return { ...t, source: 'env' };
  }

  if (allowBranch && detectEnabled(opts?.configEnabled)) {
    const branch = currentBranch();
    if (branch) {
      const t = extractTaskId(branch);
      if (t) {
        if (verbose && !quiet && outputMode === 'table') {
          process.stderr.write(`resolved task ${t.raw} from branch ${branch}\n`);
        }
        return t;
      }
    }
  }

  return null;
}

export function requireTask(
  explicit: string | undefined,
  allowBranch: boolean,
  opts?: ResolveTaskOpts
): ResolvedTask {
  const t = resolveTask(explicit, allowBranch, opts);
  if (t) return t;

  if (!allowBranch) {
    throw new CliError({
      kind: 'branchDetect',
      message: 'No task ID provided. This command does not auto-detect from branch.',
      hint: 'Pass the task ID explicitly.',
    });
  }

  const branch = currentBranch();
  if (branch !== null) {
    throw new CliError({
      kind: 'branchDetect',
      message: `No task ID on the command line and none detected in branch "${branch}".`,
      hint: 'Name your branch like feat/CU-abc123-... or PROJ-42-..., or pass the ID explicitly.',
    });
  }

  throw new CliError({
    kind: 'branchDetect',
    message: 'No task ID provided and not inside a git repository.',
    hint: 'Pass the task ID explicitly, or run from a repo whose branch contains a task ID (e.g. feat/CU-abc123-...).',
  });
}
