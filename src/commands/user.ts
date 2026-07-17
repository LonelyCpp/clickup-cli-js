import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';
import { CliError } from '../error.js';

const USER_FIELDS = ['id', 'username', 'email'];

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

export function registerUser(program: Command): void {
  const user = program.command('user').description('Manage workspace users (Enterprise)');

  user
    .command('invite')
    .description('Invite a user to the workspace (Enterprise)')
    .requiredOption('--email <email>', 'Email to invite')
    .action(async (opts: { email: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner('Inviting user...');
      const resp = await ctx.client.post(`/v2/team/${ws}/user`, { email: opts.email });
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, USER_FIELDS, 'id');
    });

  user
    .command('get')
    .description('Get a user (Enterprise)')
    .argument('<id>', 'User ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      ctx.ui.startSpinner('Fetching user...');
      const resp = await ctx.client.get(`/v2/team/${ws}/user/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, USER_FIELDS, 'id');
    });

  user
    .command('update')
    .description('Update a user (Enterprise)')
    .argument('<id>', 'User ID')
    .option('--name <name>', 'New name')
    .option('--role <role>', 'New role')
    .action(async (id: string, opts: { name?: string; role?: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const ws = ctx.resolveWorkspace();
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.role) body.role = opts.role;

      if (Object.keys(body).length === 0) {
        throw CliError.client('No update fields provided. Specify --name or --role.');
      }

      ctx.ui.startSpinner('Updating user...');
      const resp = await ctx.client.put(`/v2/team/${ws}/user/${id}`, body);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, USER_FIELDS, 'id');
    });

  user
    .command('remove')
    .description('Remove a user from the workspace (Enterprise)')
    .argument('<id>', 'User ID')
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
        const ok = await confirm({ message: `Remove user "${id}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Removing user...');
      await ctx.client.delete(`/v2/team/${ws}/user/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`User ${id} removed`);
    });
}
