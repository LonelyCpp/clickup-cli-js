import type { Command } from 'commander';
import { createContext, type Context } from '../context.js';
import { ConfigManager } from '../config.js';
import type { CliOptions } from '../cli.js';

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

async function authWhoami(ctx: Context): Promise<void> {
  ctx.ui.startSpinner('Fetching user info...');
  let user: Record<string, unknown>;
  try {
    user = await ctx.client.get('/v2/user');
  } finally {
    ctx.ui.stopSpinner();
  }
  ctx.output.printSingle(user, ['id', 'username', 'email'], 'id');
}

async function authCheck(ctx: Context): Promise<void> {
  ctx.ui.startSpinner('Checking authentication...');
  let user: Record<string, unknown>;
  try {
    user = await ctx.client.get('/v2/user');
  } finally {
    ctx.ui.stopSpinner();
  }
  if (ctx.cli.output === 'table') {
    ctx.ui.success('Authentication OK');
  }
  ctx.output.printSingle(user, ['id', 'username', 'email'], 'id');
}

export function registerAuth(program: Command): void {
  const auth = program.command('auth').description('Authentication commands');

  auth
    .command('whoami')
    .description('Get the currently authenticated user')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      await authWhoami(ctx);
    });

  auth
    .command('check')
    .description('Quick authentication health check')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      await authCheck(ctx);
    });
}
