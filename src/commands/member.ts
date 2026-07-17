import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';

const MEMBER_FIELDS = ['id', 'username', 'email', 'color'];

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

export function registerMember(program: Command): void {
  const member = program.command('member').description('Manage members');

  member
    .command('list')
    .description('List members of a task or list')
    .option('--task <id>', 'Task ID')
    .option('--list <id>', 'List ID')
    .action(async (opts: { task?: string; list?: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (Boolean(opts.task) === Boolean(opts.list)) {
        ctx.ui.error('Either --task or --list is required (but not both).');
        process.exit(1);
      }
      const basePath = opts.task ? `/v2/task/${opts.task}/member` : `/v2/list/${opts.list}/member`;

      ctx.ui.startSpinner('Fetching members...');
      const resp = await ctx.client.get(basePath);
      ctx.ui.stopSpinner();
      const items = Array.isArray(resp?.members) ? resp.members : [];
      ctx.output.printItems(items, MEMBER_FIELDS, 'id');
    });
}
