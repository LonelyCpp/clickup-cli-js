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

const TAG_FIELDS = ['name', 'tag_fg', 'tag_bg'];

export function registerTag(program: Command): void {
  const tag = program.command('tag').description('Manage space tags');

  tag
    .command('list')
    .description('List tags in a space')
    .requiredOption('--space <id>', 'Space ID')
    .action(async (opts: { space: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching tags...');
      const resp = await ctx.client.get(`/v2/space/${opts.space}/tag`);
      ctx.ui.stopSpinner();
      const items = Array.isArray(resp?.tags) ? resp.tags : [];
      ctx.output.printItems(items, TAG_FIELDS, 'name');
    });

  tag
    .command('create')
    .description('Create a tag in a space')
    .requiredOption('--space <id>', 'Space ID')
    .requiredOption('--name <name>', 'Tag name')
    .option('--fg-color <hex>', 'Foreground color (hex)')
    .option('--bg-color <hex>', 'Background color (hex)')
    .action(
      async (
        opts: { space: string; name: string; fgColor?: string; bgColor?: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const body: Record<string, unknown> = { name: opts.name };
        if (opts.fgColor) body.tag_fg = opts.fgColor;
        if (opts.bgColor) body.tag_bg = opts.bgColor;
        ctx.ui.startSpinner('Creating tag...');
        await ctx.client.post(`/v2/space/${opts.space}/tag`, body);
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Tag '${opts.name}' created`);
      }
    );

  tag
    .command('update')
    .description('Update a tag in a space')
    .requiredOption('--space <id>', 'Space ID')
    .requiredOption('--tag <name>', 'Current tag name')
    .option('--name <newName>', 'New tag name')
    .option('--fg-color <hex>', 'Foreground color (hex)')
    .option('--bg-color <hex>', 'Background color (hex)')
    .action(
      async (
        opts: { space: string; tag: string; name?: string; fgColor?: string; bgColor?: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const body: Record<string, unknown> = { name: opts.tag };
        if (opts.name) body.new_name = opts.name;
        if (opts.fgColor) body.fg_color = opts.fgColor;
        if (opts.bgColor) body.bg_color = opts.bgColor;
        ctx.ui.startSpinner('Updating tag...');
        await ctx.client.put(`/v2/space/${opts.space}/tag`, body);
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Tag '${opts.tag}' updated`);
      }
    );

  tag
    .command('delete')
    .description('Delete a tag in a space')
    .requiredOption('--space <id>', 'Space ID')
    .requiredOption('--tag <name>', 'Tag name')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (opts: { space: string; tag: string; yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete tag "${opts.tag}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Deleting tag...');
      await ctx.client.delete(`/v2/space/${opts.space}/tag/${encodeURIComponent(opts.tag)}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`Tag '${opts.tag}' deleted`);
    });
}
