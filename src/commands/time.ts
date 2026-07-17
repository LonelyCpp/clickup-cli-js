import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';
import { CliError } from '../error.js';
import { resolveValueArg } from '../input.js';
import { extractArray } from '../pagination.js';

const TIME_FIELDS = ['id', 'user', 'task', 'start', 'duration', 'billable', 'description'];
const TAG_FIELDS = ['name', 'tag_fg', 'tag_bg'];
const HISTORY_FIELDS = ['id', 'user', 'duration', 'at'];

const parseIntArg = (v: string): number => Number.parseInt(v, 10);

function getRoot(cmd: Command): Command {
  let root = cmd;
  while (root.parent) root = root.parent;
  return root;
}

function buildContext(cmd: Command): Context {
  const opts = getRoot(cmd).opts() as CliOptions;
  const config = ConfigManager.load();
  return createContext(opts, config);
}

function dateToMs(dateStr: string): string {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    throw CliError.client(`Invalid date '${dateStr}'. Use YYYY-MM-DD format.`);
  }
  return String(dt.getTime());
}

function isRunning(entry: Record<string, unknown>): boolean {
  const d = entry.duration;
  return typeof d === 'number' && d < 0;
}

export function registerTime(program: Command): void {
  const time = program.command('time').description('Manage time tracking');

  time
    .command('list')
    .description('List time entries (default: last 30 days)')
    .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
    .option('--end-date <date>', 'End date (YYYY-MM-DD)')
    .option('--task <id>', 'Filter by task ID')
    .option('--summary', 'Print a summary aggregate instead of rows')
    .action(
      async (
        opts: { startDate?: string; endDate?: string; task?: string; summary?: boolean },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const ws = ctx.resolveWorkspace();
        const params = new URLSearchParams();
        if (opts.startDate) {
          params.set('start_date', dateToMs(opts.startDate));
        } else {
          const now = Date.now();
          const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
          params.set('start_date', String(thirtyDaysAgo));
        }
        if (opts.endDate) {
          params.set('end_date', dateToMs(opts.endDate));
        } else {
          params.set('end_date', String(Date.now()));
        }
        if (opts.task) params.set('task_id', opts.task);

        ctx.ui.startSpinner('Fetching time entries...');
        const resp = await ctx.client.get(`/v2/team/${ws}/time_entry?${params.toString()}`);
        ctx.ui.stopSpinner();

        const items = extractArray(resp, ['data']) ?? [];
        if (opts.summary) {
          ctx.output.printSummary(items, 'time entries');
        } else {
          ctx.output.printItems(items, TIME_FIELDS, 'id');
        }

        const running = items.filter(isRunning);
        if (running.length > 0) {
          ctx.ui.breadcrumb(`${running.length} timer(s) currently running (negative duration).`);
        }
      }
    );

  time
    .command('get')
    .description('Get a time entry')
    .argument('<id>', 'Time entry ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner('Fetching time entry...');
      const resp = await ctx.client.get(`/v2/team/${ws}/time_entry/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, TIME_FIELDS, 'id');
    });

  time
    .command('current')
    .description('Show the currently running time entry')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner('Fetching current timer...');
      const resp = await ctx.client.get(`/v2/team/${ws}/time_entry/current`);
      ctx.ui.stopSpinner();
      if (
        !resp ||
        (typeof resp === 'object' && !Array.isArray(resp) && Object.keys(resp).length === 0)
      ) {
        ctx.output.printMessage('No running timer.');
        return;
      }
      ctx.output.printSingle(resp, TIME_FIELDS, 'id');
      if (isRunning(resp)) {
        ctx.ui.breadcrumb('Timer is currently running (negative duration).');
      }
    });

  time
    .command('create')
    .description('Create a time entry')
    .requiredOption('--start <date>', 'Start date (YYYY-MM-DD)')
    .requiredOption('--duration <ms>', 'Duration in milliseconds', parseIntArg)
    .option('--task <id>', 'Task ID')
    .option('--description <text>', 'Description (use @file/@-/@@text)')
    .option('--billable', 'Billable entry')
    .option('--tag <tag...>', 'Tag (repeatable)')
    .action(
      async (
        opts: {
          start: string;
          duration: number;
          task?: string;
          description?: string;
          billable?: boolean;
          tag?: string[];
        },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const ws = ctx.resolveWorkspace();
        const body: Record<string, unknown> = {
          start: Number.parseInt(dateToMs(opts.start), 10),
          duration: opts.duration,
        };
        if (opts.task) body.task_id = opts.task;
        if (opts.description) body.description = resolveValueArg(opts.description);
        if (opts.billable) body.billable = true;
        if (opts.tag?.length) body.tags = opts.tag;

        ctx.ui.startSpinner('Creating time entry...');
        const resp = await ctx.client.post(`/v2/team/${ws}/time_entry`, body);
        ctx.ui.stopSpinner();
        ctx.output.printSingle(resp, TIME_FIELDS, 'id');
      }
    );

  time
    .command('update')
    .description('Update a time entry')
    .argument('<id>', 'Time entry ID')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--duration <ms>', 'Duration in milliseconds', parseIntArg)
    .option('--task <id>', 'Task ID')
    .option('--description <text>', 'Description (use @file/@-/@@text)')
    .option('--billable', 'Billable entry')
    .option('--tag <tag...>', 'Tag (repeatable)')
    .action(
      async (
        id: string,
        opts: {
          start?: string;
          duration?: number;
          task?: string;
          description?: string;
          billable?: boolean;
          tag?: string[];
        },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const ws = ctx.resolveWorkspace();
        const body: Record<string, unknown> = {};
        if (opts.start) body.start = Number.parseInt(dateToMs(opts.start), 10);
        if (opts.duration != null) body.duration = opts.duration;
        if (opts.task) body.task_id = opts.task;
        if (opts.description != null) body.description = resolveValueArg(opts.description);
        if (opts.billable) body.billable = true;
        if (opts.tag?.length) body.tags = opts.tag;

        if (Object.keys(body).length === 0) {
          throw CliError.client(
            'No update fields provided. Specify --start, --duration, --task, --description, --billable, or --tag.'
          );
        }

        ctx.ui.startSpinner('Updating time entry...');
        const resp = await ctx.client.put(`/v2/team/${ws}/time_entry/${id}`, body);
        ctx.ui.stopSpinner();
        ctx.output.printSingle(resp, TIME_FIELDS, 'id');
      }
    );

  time
    .command('delete')
    .description('Delete a time entry')
    .argument('<id>', 'Time entry ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete time entry "${id}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Deleting time entry...');
      await ctx.client.delete(`/v2/team/${ws}/time_entry/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`Time entry ${id} deleted`);
    });

  time
    .command('start')
    .description('Start a timer')
    .option('--task <id>', 'Task ID')
    .option('--description <text>', 'Description (use @file/@-/@@text)')
    .option('--billable', 'Billable timer')
    .option('--tag <tag...>', 'Tag (repeatable)')
    .action(
      async (
        opts: { task?: string; description?: string; billable?: boolean; tag?: string[] },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const ws = ctx.resolveWorkspace();
        const body: Record<string, unknown> = {};
        if (opts.task) body.task_id = opts.task;
        if (opts.description) body.description = resolveValueArg(opts.description);
        if (opts.billable) body.billable = true;
        if (opts.tag?.length) body.tags = opts.tag;

        ctx.ui.startSpinner('Starting timer...');
        const resp = await ctx.client.post(`/v2/team/${ws}/time_entry/start`, body);
        ctx.ui.stopSpinner();
        ctx.output.printSingle(resp, TIME_FIELDS, 'id');
      }
    );

  time
    .command('stop')
    .description('Stop the running timer')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner('Stopping timer...');
      const resp = await ctx.client.post(`/v2/team/${ws}/time_entry/stop`, {});
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, TIME_FIELDS, 'id');
    });

  time
    .command('tags')
    .description('List time tracking tags')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner('Fetching time tags...');
      const resp = await ctx.client.get(`/v2/team/${ws}/time_entry/tags`);
      ctx.ui.stopSpinner();
      const items = extractArray(resp, ['tags']) ?? [];
      ctx.output.printItems(items, TAG_FIELDS, 'name');
    });

  time
    .command('add-tags')
    .description('Add a tag to a time entry')
    .requiredOption('--entry-id <id>', 'Time entry ID')
    .requiredOption('--tag <name>', 'Tag name')
    .option('--tag-bg <color>', 'Tag background color')
    .option('--tag-fg <color>', 'Tag foreground color')
    .action(
      async (
        opts: { entryId: string; tag: string; tagBg?: string; tagFg?: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const ws = ctx.resolveWorkspace();
        const body: Record<string, unknown> = { name: opts.tag };
        if (opts.tagBg) body.tag_bg = opts.tagBg;
        if (opts.tagFg) body.tag_fg = opts.tagFg;

        ctx.ui.startSpinner(`Adding tag '${opts.tag}'...`);
        await ctx.client.post(`/v2/team/${ws}/time_entry/${opts.entryId}/tag`, body);
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Tag '${opts.tag}' added to time entry ${opts.entryId}`);
      }
    );

  time
    .command('remove-tags')
    .description('Remove a tag from a time entry')
    .requiredOption('--entry-id <id>', 'Time entry ID')
    .requiredOption('--tag <name>', 'Tag name')
    .action(async (opts: { entryId: string; tag: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner(`Removing tag '${opts.tag}'...`);
      await ctx.client.deleteWithBody(`/v2/team/${ws}/time_entry/${opts.entryId}/tag`, {
        name: opts.tag,
      });
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`Tag '${opts.tag}' removed from time entry ${opts.entryId}`);
    });

  time
    .command('rename-tag')
    .description('Rename a time tracking tag')
    .requiredOption('--name <old>', 'Current tag name')
    .requiredOption('--new-name <new>', 'New tag name')
    .action(async (opts: { name: string; newName: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner(`Renaming tag '${opts.name}'...`);
      await ctx.client.put(`/v2/team/${ws}/time_entry/tags/${encodeURIComponent(opts.name)}`, {
        name: opts.newName,
      });
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`Tag '${opts.name}' renamed to '${opts.newName}'`);
    });

  time
    .command('history')
    .description('Show history of a time entry')
    .argument('<id>', 'Time entry ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner('Fetching time entry history...');
      const resp = await ctx.client.get(`/v2/team/${ws}/time_entry/${id}/history`);
      ctx.ui.stopSpinner();
      const items = extractArray(resp, ['data']) ?? [];
      ctx.output.printItems(items, HISTORY_FIELDS, 'id');
    });
}
