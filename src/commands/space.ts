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

export function registerSpace(program: Command): void {
  const space = program.command('space').description('Manage spaces');

  space
    .command('list')
    .description('List spaces in the workspace')
    .option('--archived', 'Include archived spaces')
    .action(async (opts: { archived?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching spaces...');
      const workspaceId = ctx.resolveWorkspace();
      const archived = opts.archived ? 'true' : 'false';
      const { items, hasMore } = await walkPage(
        ctx.client,
        'spaces',
        (page) => `/v2/team/${workspaceId}/space?archived=${archived}&page=${page}`,
        { all: ctx.cli.all, limit: ctx.cli.limit, page: ctx.cli.page }
      );
      ctx.ui.stopSpinner();
      ctx.output.printItems(items, ['id', 'name', 'private', 'archived'], 'id', { hasMore });
    });

  space
    .command('get')
    .description('Get a space')
    .argument('<id>', 'Space ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching space...');
      const resp = await ctx.client.get(`/v2/space/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, ['id', 'name', 'private'], 'id');
    });

  space
    .command('create')
    .description('Create a space')
    .requiredOption('--name <name>', 'Space name')
    .option('--private', 'Make the space private')
    .action(async (opts: { name: string; private?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Creating space...');
      const workspaceId = ctx.resolveWorkspace();
      const body: Record<string, unknown> = { name: opts.name };
      if (opts.private) body.private = true;
      const resp = await ctx.client.post(`/v2/team/${workspaceId}/space`, body);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, ['id', 'name', 'private'], 'id');
    });

  space
    .command('update')
    .description('Update a space')
    .argument('<id>', 'Space ID')
    .option('--name <name>', 'New space name')
    .action(async (id: string, opts: { name?: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Updating space...');
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      const resp = await ctx.client.put(`/v2/space/${id}`, body);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, ['id', 'name', 'private'], 'id');
    });

  space
    .command('delete')
    .description('Delete a space')
    .argument('<id>', 'Space ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete space "${id}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Deleting space...');
      await ctx.client.delete(`/v2/space/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`Space ${id} deleted`);
    });
}
