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

export function registerFolder(program: Command): void {
  const folder = program.command('folder').description('Manage folders');

  folder
    .command('list')
    .description('List folders in a space')
    .requiredOption('--space <id>', 'Space ID')
    .option('--archived', 'Include archived folders')
    .action(async (opts: { space: string; archived?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching folders...');
      const archived = opts.archived ? 'true' : 'false';
      const { items, hasMore } = await walkPage(
        ctx.client,
        'folders',
        (page) => `/v2/space/${opts.space}/folder?archived=${archived}&page=${page}`,
        { all: ctx.cli.all, limit: ctx.cli.limit, page: ctx.cli.page }
      );
      ctx.ui.stopSpinner();
      ctx.output.printItems(items, ['id', 'name', 'task_count'], 'id', { hasMore });
    });

  folder
    .command('get')
    .description('Get a folder')
    .argument('<id>', 'Folder ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching folder...');
      const resp = await ctx.client.get(`/v2/folder/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, ['id', 'name', 'task_count'], 'id');
    });

  folder
    .command('create')
    .description('Create a folder')
    .requiredOption('--space <id>', 'Space ID')
    .requiredOption('--name <name>', 'Folder name')
    .action(async (opts: { space: string; name: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Creating folder...');
      const resp = await ctx.client.post(`/v2/space/${opts.space}/folder`, { name: opts.name });
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, ['id', 'name', 'task_count'], 'id');
    });

  folder
    .command('update')
    .description('Update a folder')
    .argument('<id>', 'Folder ID')
    .requiredOption('--name <name>', 'New folder name')
    .action(async (id: string, opts: { name: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Updating folder...');
      const resp = await ctx.client.put(`/v2/folder/${id}`, { name: opts.name });
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, ['id', 'name', 'task_count'], 'id');
    });

  folder
    .command('delete')
    .description('Delete a folder')
    .argument('<id>', 'Folder ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete folder "${id}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Deleting folder...');
      await ctx.client.delete(`/v2/folder/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`Folder ${id} deleted`);
    });
}
