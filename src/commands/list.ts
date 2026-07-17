import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';
import { walkPage } from '../pagination.js';

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
  return String(dt.getTime());
}

export function registerList(program: Command): void {
  const listCmd = program.command('list').description('Manage lists');

  listCmd
    .command('list')
    .description('List lists in a folder or space')
    .option('--folder <id>', 'Folder ID')
    .option('--space <id>', 'Space ID (folderless lists)')
    .option('--archived', 'Include archived lists')
    .action(async (opts: { folder?: string; space?: string; archived?: boolean }, cmd: Command) => {
      if (Boolean(opts.folder) === Boolean(opts.space)) {
        const ui = buildContext(cmd).ui;
        ui.error('Either --folder or --space is required (but not both).');
        process.exit(1);
      }
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching lists...');
      const archived = opts.archived ? 'true' : 'false';
      const basePath = opts.folder
        ? `/v2/folder/${opts.folder}/list`
        : `/v2/space/${opts.space}/list`;
      const items = await walkPage(
        ctx.client,
        'lists',
        (page) => `${basePath}?archived=${archived}&page=${page}`,
        { all: ctx.cli.all, limit: ctx.cli.limit, page: ctx.cli.page }
      );
      ctx.ui.stopSpinner();
      ctx.output.printItems(items, ['id', 'name', 'task_count'], 'id');
    });

  listCmd
    .command('get')
    .description('Get a list')
    .argument('<id>', 'List ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching list...');
      const resp = await ctx.client.get(`/v2/list/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, ['id', 'name', 'task_count'], 'id');
    });

  listCmd
    .command('create')
    .description('Create a list')
    .option('--folder <id>', 'Folder ID')
    .option('--space <id>', 'Space ID (folderless list)')
    .requiredOption('--name <name>', 'List name')
    .option('--content <text>', 'List description')
    .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
    .action(
      async (
        opts: { folder?: string; space?: string; name: string; content?: string; dueDate?: string },
        cmd: Command
      ) => {
        if (Boolean(opts.folder) === Boolean(opts.space)) {
          const ui = buildContext(cmd).ui;
          ui.error('Either --folder or --space is required (but not both).');
          process.exit(1);
        }
        const ctx = buildContext(cmd);
        ctx.ui.startSpinner('Creating list...');
        const basePath = opts.folder
          ? `/v2/folder/${opts.folder}/list`
          : `/v2/space/${opts.space}/list`;
        const body: Record<string, unknown> = { name: opts.name };
        if (opts.content) body.content = opts.content;
        if (opts.dueDate) body.due_date = dateToMs(opts.dueDate);
        const resp = await ctx.client.post(basePath, body);
        ctx.ui.stopSpinner();
        ctx.output.printSingle(resp, ['id', 'name', 'task_count'], 'id');
      }
    );

  listCmd
    .command('update')
    .description('Update a list')
    .argument('<id>', 'List ID')
    .option('--name <name>', 'New list name')
    .option('--content <text>', 'List description')
    .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
    .action(
      async (
        id: string,
        opts: { name?: string; content?: string; dueDate?: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        ctx.ui.startSpinner('Updating list...');
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.content) body.content = opts.content;
        if (opts.dueDate) body.due_date = dateToMs(opts.dueDate);
        const resp = await ctx.client.put(`/v2/list/${id}`, body);
        ctx.ui.stopSpinner();
        ctx.output.printSingle(resp, ['id', 'name', 'task_count'], 'id');
      }
    );

  listCmd
    .command('delete')
    .description('Delete a list')
    .argument('<id>', 'List ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete list "${id}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Deleting list...');
      await ctx.client.delete(`/v2/list/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`List ${id} deleted`);
    });

  listCmd
    .command('add-task')
    .description('Add a task to a list')
    .argument('<listId>', 'List ID')
    .argument('<taskId>', 'Task ID')
    .action(
      async (listId: string, taskId: string, _opts: Record<string, unknown>, cmd: Command) => {
        const ctx = buildContext(cmd);
        ctx.ui.startSpinner('Adding task to list...');
        await ctx.client.post(`/v2/list/${listId}/task/${taskId}`, {});
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Task ${taskId} added to list ${listId}`);
      }
    );

  listCmd
    .command('remove-task')
    .description('Remove a task from a list')
    .argument('<listId>', 'List ID')
    .argument('<taskId>', 'Task ID')
    .action(
      async (listId: string, taskId: string, _opts: Record<string, unknown>, cmd: Command) => {
        const ctx = buildContext(cmd);
        ctx.ui.startSpinner('Removing task from list...');
        await ctx.client.delete(`/v2/list/${listId}/task/${taskId}`);
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Task ${taskId} removed from list ${listId}`);
      }
    );
}
