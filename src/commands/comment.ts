import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';
import { CliError } from '../error.js';
import { resolveValueArg } from '../input.js';
import { walkStartId } from '../pagination.js';

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

const COMMENT_FIELDS = ['id', 'comment_text', 'user', 'date'];

type CommentScopeKind = 'task' | 'list' | 'view';

interface CommentScope {
  kind: CommentScopeKind;
  id: string;
}

function resolveScope(opts: { task?: string; list?: string; view?: string }): CommentScope {
  const present: CommentScope[] = [];
  if (opts.task) present.push({ kind: 'task', id: opts.task });
  if (opts.list) present.push({ kind: 'list', id: opts.list });
  if (opts.view) present.push({ kind: 'view', id: opts.view });
  if (present.length === 0) {
    throw CliError.client('Specify exactly one of --task, --list, or --view.');
  }
  if (present.length > 1) {
    throw CliError.client('Specify only one of --task, --list, or --view.');
  }
  return present[0];
}

function scopeBasePath(scope: CommentScope): string {
  switch (scope.kind) {
    case 'task':
      return `/v2/task/${scope.id}/comment`;
    case 'list':
      return `/v2/list/${scope.id}/comment`;
    case 'view':
      return `/v2/view/${scope.id}/comment`;
  }
}

function withStartParams(base: string, start: number | null, startId: string | null): string {
  const params: string[] = [];
  if (start != null) params.push(`start=${start}`);
  if (startId) params.push(`start_id=${startId}`);
  return params.length ? `${base}?${params.join('&')}` : base;
}

export function registerComment(program: Command): void {
  const comment = program.command('comment').description('Manage comments');

  comment
    .command('list')
    .description('List comments on a task, list, or view')
    .option('--task <id>', 'Task ID')
    .option('--list <id>', 'List ID')
    .option('--view <id>', 'View ID')
    .option('--summary', 'Print a summary aggregate instead of rows')
    .action(
      async (
        opts: { task?: string; list?: string; view?: string; summary?: boolean },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const scope = resolveScope(opts);
        const base = scopeBasePath(scope);
        ctx.ui.startSpinner('Fetching comments...');
        const items = await walkStartId(
          ctx.client,
          'comments',
          (start, startId) => withStartParams(base, start, startId),
          {
            all: ctx.cli.all,
            limit: ctx.cli.limit,
            start: ctx.cli.start,
            startId: ctx.cli.startId,
          }
        );
        ctx.ui.stopSpinner();
        if (opts.summary) {
          ctx.output.printSummary(items, 'comments');
        } else {
          ctx.output.printItems(items, COMMENT_FIELDS, 'id');
        }
      }
    );

  comment
    .command('create')
    .description('Create a comment on a task, list, or view')
    .option('--task <id>', 'Task ID')
    .option('--list <id>', 'List ID')
    .option('--view <id>', 'View ID')
    .requiredOption('--text <text>', 'Comment text (use @file/@-/@@text)')
    .option('--notify-all', 'Notify all assignees')
    .action(
      async (
        opts: { task?: string; list?: string; view?: string; text: string; notifyAll?: boolean },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const scope = resolveScope(opts);
        const body: Record<string, unknown> = { comment_text: resolveValueArg(opts.text) };
        if (opts.notifyAll) body.notify_all = true;
        ctx.ui.startSpinner('Creating comment...');
        const resp = await ctx.client.post(scopeBasePath(scope), body);
        ctx.ui.stopSpinner();
        ctx.output.printSingle(resp, COMMENT_FIELDS, 'id');
      }
    );

  comment
    .command('update')
    .description('Update a comment')
    .argument('<id>', 'Comment ID')
    .requiredOption('--text <text>', 'New comment text (use @file/@-/@@text)')
    .option('--resolved', 'Mark the comment as resolved')
    .action(async (id: string, opts: { text: string; resolved?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const body: Record<string, unknown> = { comment_text: resolveValueArg(opts.text) };
      if (opts.resolved) body.resolved = true;
      ctx.ui.startSpinner('Updating comment...');
      const resp = await ctx.client.put(`/v2/comment/${id}`, body);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, COMMENT_FIELDS, 'id');
    });

  comment
    .command('delete')
    .description('Delete a comment')
    .argument('<id>', 'Comment ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete comment "${id}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }
      ctx.ui.startSpinner('Deleting comment...');
      await ctx.client.delete(`/v2/comment/${id}`);
      ctx.ui.stopSpinner();
      ctx.output.printMessage(`Comment ${id} deleted`);
    });

  comment
    .command('replies')
    .description('List replies to a comment')
    .argument('<id>', 'Comment ID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      ctx.ui.startSpinner('Fetching replies...');
      const items = await walkStartId(
        ctx.client,
        'comments',
        (start, startId) => withStartParams(`/v2/comment/${id}/reply`, start, startId),
        {
          all: ctx.cli.all,
          limit: ctx.cli.limit,
          start: ctx.cli.start,
          startId: ctx.cli.startId,
        }
      );
      ctx.ui.stopSpinner();
      ctx.output.printItems(items, COMMENT_FIELDS, 'id');
    });

  comment
    .command('reply')
    .description('Reply to a comment')
    .argument('<id>', 'Comment ID')
    .requiredOption('--text <text>', 'Reply text (use @file/@-/@@text)')
    .action(async (id: string, opts: { text: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const body: Record<string, unknown> = { comment_text: resolveValueArg(opts.text) };
      ctx.ui.startSpinner('Creating reply...');
      const resp = await ctx.client.post(`/v2/comment/${id}/reply`, body);
      ctx.ui.stopSpinner();
      ctx.output.printSingle(resp, COMMENT_FIELDS, 'id');
    });
}
