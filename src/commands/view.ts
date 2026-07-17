import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';
import { walkPage } from '../pagination.js';

const VIEW_FIELDS = ['id', 'name', 'type'];
const TASK_FIELDS = ['id', 'name', 'status', 'priority', 'assignees', 'due_date'];

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

interface ViewScopeOpts {
  workspaceLevel?: boolean;
  space?: string;
  folder?: string;
  list?: string;
}

function countScopes(opts: ViewScopeOpts): number {
  return [opts.workspaceLevel, opts.space, opts.folder, opts.list].filter((v) => Boolean(v)).length;
}

function viewScopeBase(opts: ViewScopeOpts, ws: string): string {
  if (opts.workspaceLevel) return `/v2/team/${ws}/view`;
  if (opts.space) return `/v2/space/${opts.space}/view`;
  if (opts.folder) return `/v2/folder/${opts.folder}/view`;
  if (opts.list) return `/v2/list/${opts.list}/view`;
  return '';
}

export function registerView(program: Command): void {
  const view = program.command('view').description('Manage views');

  view
    .command('list')
    .description('List views at workspace, space, folder, or list level')
    .option('--workspace-level', 'List workspace-level views')
    .option('--space <id>', 'List views in a space')
    .option('--folder <id>', 'List views in a folder')
    .option('--list <id>', 'List views in a list')
    .action(async (opts: ViewScopeOpts, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (countScopes(opts) !== 1) {
        ctx.ui.error('Exactly one of --workspace-level, --space, --folder, or --list is required.');
        process.exit(1);
      }
      const ws = ctx.resolveWorkspace();
      const basePath = viewScopeBase(opts, ws);

      ctx.ui.startSpinner('Fetching views...');
      const resp = await ctx.client.get(basePath);
      ctx.ui.stopSpinner();
      const items = Array.isArray(resp?.views) ? resp.views : [];
      ctx.output.printItems(items, VIEW_FIELDS, 'id');
    });

  view
    .command('get')
    .description('Get a view')
    .argument('<id>', 'View ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching view...');
      const resp = await ctx.client.get(`/v2/view/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, VIEW_FIELDS, 'id');
    });

  view
    .command('create')
    .description('Create a view')
    .requiredOption('--name <name>', 'View name')
    .requiredOption('--type <type>', 'View type')
    .option('--workspace-level', 'Create at workspace level')
    .option('--space <id>', 'Create in a space')
    .option('--folder <id>', 'Create in a folder')
    .option('--list <id>', 'Create in a list')
    .action(async (opts: { name: string; type: string } & ViewScopeOpts, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (countScopes(opts) !== 1) {
        ctx.ui.error('Exactly one of --workspace-level, --space, --folder, or --list is required.');
        process.exit(1);
      }
      const ws = ctx.resolveWorkspace();
      const basePath = viewScopeBase(opts, ws);

      ctx.ui.startSpinner('Creating view...');
      const resp = await ctx.client.post(basePath, { name: opts.name, type: opts.type });
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, VIEW_FIELDS, 'id');
    });

  view
    .command('update')
    .description('Update a view')
    .argument('<id>', 'View ID')
    .option('--name <name>', 'New view name')
    .action(async (id: string, opts: { name?: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;

      ctx.ui.startSpinner('Updating view...');
      const resp = await ctx.client.put(`/v2/view/${id}`, body);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, VIEW_FIELDS, 'id');
    });

  view
    .command('delete')
    .description('Delete a view')
    .argument('<id>', 'View ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete view "${id}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Deleting view...');
      await ctx.client.delete(`/v2/view/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`View ${id} deleted`);
    });

  view
    .command('tasks')
    .description('List tasks in a view')
    .argument('<id>', 'View ID')
    .option('--summary', 'Print a summary aggregate instead of rows')
    .action(async (id: string, opts: { summary?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching view tasks...');
      const items = await walkPage(
        ctx.client,
        'tasks',
        (page) => `/v2/view/${id}/task?page=${page}`,
        { all: ctx.cli.all, limit: ctx.cli.limit, page: ctx.cli.page }
      );
      ctx.ui.stopSpinner();

      if (opts.summary) {
        ctx.output.printSummary(items, 'tasks');
      } else {
        ctx.output.printItems(items, TASK_FIELDS, 'id');
      }
    });
}
