import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';

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

async function workspaceList(ctx: Context): Promise<void> {
  ctx.ui.startSpinner('Fetching workspaces...');
  let res: Record<string, unknown>;
  try {
    res = await ctx.client.get('/v2/team');
  } finally {
    ctx.ui.stopSpinner();
  }
  const teams = Array.isArray(res?.teams) ? (res.teams as Record<string, unknown>[]) : [];
  const rows = teams.map((t) => ({
    id: t.id,
    name: t.name,
    members: Array.isArray(t.members) ? t.members.length : 0,
  }));
  ctx.output.printItems(rows, ['id', 'name', 'members'], 'id');
}

async function workspaceSeats(ctx: Context): Promise<void> {
  const workspaceId = ctx.resolveWorkspace();
  ctx.ui.startSpinner('Fetching workspace seats...');
  let res: Record<string, unknown>;
  try {
    res = await ctx.client.get(`/v2/team/${workspaceId}/seats`);
  } finally {
    ctx.ui.stopSpinner();
  }
  const seats = (res?.seats as Record<string, unknown>) ?? {};
  ctx.output.printSingle(seats, ['used', 'total', 'available'], 'total');
}

async function workspacePlan(ctx: Context): Promise<void> {
  const workspaceId = ctx.resolveWorkspace();
  ctx.ui.startSpinner('Fetching workspace plan...');
  let res: Record<string, unknown>;
  try {
    res = await ctx.client.get(`/v2/team/${workspaceId}/plan`);
  } finally {
    ctx.ui.stopSpinner();
  }
  const plan = (res?.plan as Record<string, unknown>) ?? {};
  ctx.output.printSingle(plan, ['name', 'tier', 'features'], 'name');
}

export function registerWorkspace(program: Command): void {
  const workspace = program.command('workspace').description('Workspace commands');

  workspace
    .command('list')
    .description('List available workspaces (teams)')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      await workspaceList(ctx);
    });

  workspace
    .command('seats')
    .description('Show workspace seat usage')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      await workspaceSeats(ctx);
    });

  workspace
    .command('plan')
    .description('Show workspace plan details')
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = buildContext(cmd);
      await workspacePlan(ctx);
    });
}
