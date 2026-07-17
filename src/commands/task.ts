import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';
import { CliError } from '../error.js';
import { type ResolvedTask, parseTaskId, requireTask } from '../git.js';
import { resolveValueArg } from '../input.js';
import { walkPage } from '../pagination.js';

const TASK_FIELDS = ['id', 'name', 'status', 'priority', 'assignees', 'due_date'];

const parseIntArg = (v: string): number => Number.parseInt(v, 10);

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

function taskOpts(ctx: Context) {
  return {
    configEnabled: ctx.config.git.enabled,
    verbose: ctx.config.git.verbose,
    quiet: ctx.cli.quiet,
    outputMode: ctx.cli.output,
  };
}

function customQuery(ctx: Context, task: ResolvedTask): string {
  return task.isCustom ? `?custom_task_ids=true&team_id=${ctx.resolveWorkspace()}` : '';
}

function dateToMs(dateStr: string): string {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    throw CliError.client(`Invalid date '${dateStr}'. Use YYYY-MM-DD format.`);
  }
  return String(dt.getTime());
}

function resolveTaskTag(
  ctx: Context,
  taskOrTag: string,
  tagName?: string
): { task: ResolvedTask; tag: string } {
  if (tagName) {
    return { task: parseTaskId(taskOrTag), tag: tagName };
  }
  const task = requireTask(undefined, true, taskOpts(ctx));
  return { task, tag: taskOrTag };
}

function parseEstimate(s: string): { assignee: number | string; time: number } {
  const idx = s.indexOf(':');
  if (idx === -1) {
    throw CliError.client(`Invalid estimate '${s}'. Use ASSIGNEE:MS format.`);
  }
  const assigneeRaw = s.slice(0, idx);
  const timeRaw = s.slice(idx + 1);
  const time = Number.parseInt(timeRaw, 10);
  if (Number.isNaN(time)) {
    throw CliError.client(`Invalid time '${timeRaw}' in estimate '${s}'.`);
  }
  if (assigneeRaw === 'unassigned') {
    return { assignee: 'unassigned', time };
  }
  const assignee = Number.parseInt(assigneeRaw, 10);
  if (Number.isNaN(assignee)) {
    throw CliError.client(`Invalid assignee '${assigneeRaw}' in estimate '${s}'.`);
  }
  return { assignee, time };
}

function parseEstimatesBody(body: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw CliError.client(`Invalid --body JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw CliError.client('--body must be a JSON array.');
  }
  return parsed;
}

function printTimeInStatus(ctx: Context, resp: Record<string, unknown>): void {
  const rows: Record<string, unknown>[] = [];
  const current = resp.current_status as Record<string, unknown> | undefined;
  if (current) {
    rows.push({ stage: 'current', status: current.status, total_time: current.total_time });
  }
  if (Array.isArray(resp.history)) {
    for (const h of resp.history) {
      rows.push({ stage: 'history', status: h?.status, total_time: h?.total_time });
    }
  }
  ctx.output.printItems(rows, ['stage', 'status', 'total_time'], 'stage');
}

export function registerTask(program: Command): void {
  const task = program.command('task').description('Manage tasks');

  task
    .command('list')
    .description('List tasks in a list')
    .requiredOption('--list <id>', 'List ID')
    .option('--status <status...>', 'Filter by status (repeatable)')
    .option('--assignee <id...>', 'Filter by assignee ID (repeatable)')
    .option('--tag <tag...>', 'Filter by tag (repeatable)')
    .option('--include-closed', 'Include closed tasks')
    .option('--order-by <field>', 'Order by field')
    .option('--reverse', 'Reverse order')
    .option('--summary', 'Print a summary aggregate instead of rows')
    .action(
      async (
        opts: {
          list: string;
          status?: string[];
          assignee?: string[];
          tag?: string[];
          includeClosed?: boolean;
          orderBy?: string;
          reverse?: boolean;
          summary?: boolean;
        },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const params = new URLSearchParams();
        params.set('include_closed', String(!!opts.includeClosed));
        for (const s of opts.status ?? []) params.append('statuses[]', s);
        for (const a of opts.assignee ?? []) params.append('assignees[]', a);
        for (const t of opts.tag ?? []) params.append('tags[]', t);
        if (opts.orderBy) params.set('order_by', opts.orderBy);
        if (opts.reverse) params.set('reverse', 'true');
        const base = params.toString();

        ctx.ui.startSpinner('Fetching tasks...');
        const { items, hasMore } = await walkPage(
          ctx.client,
          'tasks',
          (page) => `/v2/list/${opts.list}/task?${base}&page=${page}`,
          { all: ctx.cli.all, limit: ctx.cli.limit, page: ctx.cli.page }
        );
        ctx.ui.stopSpinner();

        if (opts.summary) {
          ctx.output.printSummary(items, 'tasks', { hasMore });
        } else {
          ctx.output.printItems(items, TASK_FIELDS, 'id', { hasMore });
        }
      }
    );

  task
    .command('search')
    .description('Search tasks across a workspace')
    .option('--space <id...>', 'Filter by space ID (repeatable)')
    .option('--folder <id...>', 'Filter by folder ID (repeatable)')
    .option('--list <id...>', 'Filter by list ID (repeatable)')
    .option('--status <status...>', 'Filter by status (repeatable)')
    .option('--assignee <id...>', 'Filter by assignee ID (repeatable)')
    .option('--tag <tag...>', 'Filter by tag (repeatable)')
    .action(
      async (
        opts: {
          space?: string[];
          folder?: string[];
          list?: string[];
          status?: string[];
          assignee?: string[];
          tag?: string[];
        },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const ws = ctx.resolveWorkspace();
        const params = new URLSearchParams();
        for (const s of opts.space ?? []) params.append('space_ids[]', s);
        for (const f of opts.folder ?? []) params.append('project_ids[]', f);
        for (const l of opts.list ?? []) params.append('list_ids[]', l);
        for (const s of opts.status ?? []) params.append('statuses[]', s);
        for (const a of opts.assignee ?? []) params.append('assignees[]', a);
        for (const t of opts.tag ?? []) params.append('tags[]', t);
        const base = params.toString();

        ctx.ui.startSpinner('Fetching tasks...');
        const { items, hasMore } = await walkPage(
          ctx.client,
          'tasks',
          (page) => `/v2/team/${ws}/task?${base}&page=${page}`,
          { all: ctx.cli.all, limit: ctx.cli.limit, page: ctx.cli.page }
        );
        ctx.ui.stopSpinner();

        ctx.output.printItems(items, TASK_FIELDS, 'id', { hasMore });
      }
    );

  task
    .command('get')
    .description('Get a task by ID (auto-detects from branch)')
    .argument('[id]', 'Task ID')
    .option('--subtasks', 'Include subtasks')
    .option('--custom-task-id', 'Treat the ID as a custom task ID')
    .option('--markdown', 'Include markdown description')
    .action(
      async (
        id: string | undefined,
        opts: { subtasks?: boolean; customTaskId?: boolean; markdown?: boolean },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(id, true, taskOpts(ctx));
        const isCustom = opts.customTaskId || resolved.isCustom;
        const params = new URLSearchParams();
        params.set('include_subtasks', String(!!opts.subtasks));
        params.set('include_markdown_description', String(!!opts.markdown));
        if (isCustom) {
          params.set('custom_task_ids', 'true');
          params.set('team_id', ctx.resolveWorkspace());
        }

        ctx.ui.startSpinner('Fetching task...');
        const resp = await ctx.client.get(`/v2/task/${resolved.id}?${params.toString()}`);
        ctx.ui.stopSpinner();

        let fields = TASK_FIELDS;
        if (opts.markdown && !fields.includes('markdown_description')) {
          fields = [...fields, 'markdown_description'];
        }
        ctx.output.printSingle(resp, fields, 'id');
      }
    );

  task
    .command('create')
    .description('Create a task in a list')
    .requiredOption('--list <id>', 'List ID')
    .requiredOption('--name <name>', 'Task name')
    .option('--description <text>', 'Task description (use @file/@-/@@text)')
    .option('--status <status>', 'Initial status')
    .option('--priority <n>', 'Priority (1=Urgent, 4=Low)', parseIntArg)
    .option('--assignee <id...>', 'Assignee user ID (repeatable)')
    .option('--tag <tag...>', 'Tag (repeatable)')
    .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
    .option('--parent <id>', 'Parent task ID')
    .action(
      async (
        opts: {
          list: string;
          name: string;
          description?: string;
          status?: string;
          priority?: number;
          assignee?: string[];
          tag?: string[];
          dueDate?: string;
          parent?: string;
        },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const body: Record<string, unknown> = { name: opts.name };
        if (opts.description) body.markdown_content = resolveValueArg(opts.description);
        if (opts.status) body.status = opts.status;
        if (opts.priority != null) body.priority = opts.priority;
        if (opts.assignee?.length) {
          body.assignees = opts.assignee.map((a) => Number.parseInt(a, 10));
        }
        if (opts.tag?.length) body.tags = opts.tag;
        if (opts.dueDate) body.due_date = dateToMs(opts.dueDate);
        if (opts.parent) body.parent = opts.parent;

        ctx.ui.startSpinner('Creating task...');
        const resp = await ctx.client.post(`/v2/list/${opts.list}/task`, body);
        ctx.ui.stopSpinner();

        ctx.output.printSingle(resp, TASK_FIELDS, 'id');
      }
    );

  task
    .command('update')
    .description('Update a task (auto-detects ID from branch)')
    .argument('[id]', 'Task ID')
    .option('--name <name>', 'New name')
    .option('--status <status>', 'New status')
    .option('--priority <n>', 'Priority (1=Urgent, 4=Low)', parseIntArg)
    .option('--add-assignee <id...>', 'Assignee user ID to add (repeatable)')
    .option('--rem-assignee <id...>', 'Assignee user ID to remove (repeatable)')
    .option('--description <text>', 'New description (use @file/@-/@@text)')
    .option('--parent <id>', 'Parent task ID')
    .action(
      async (
        id: string | undefined,
        opts: {
          name?: string;
          status?: string;
          priority?: number;
          addAssignee?: string[];
          remAssignee?: string[];
          description?: string;
          parent?: string;
        },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(id, true, taskOpts(ctx));
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.status) body.status = opts.status;
        if (opts.priority != null) body.priority = opts.priority;
        if (opts.description != null) body.markdown_content = resolveValueArg(opts.description);
        if (opts.parent) body.parent = opts.parent;
        const assignees: Record<string, unknown> = {};
        if (opts.addAssignee?.length) {
          assignees.add = opts.addAssignee.map((a) => Number.parseInt(a, 10));
        }
        if (opts.remAssignee?.length) {
          assignees.rem = opts.remAssignee.map((a) => Number.parseInt(a, 10));
        }
        if (Object.keys(assignees).length > 0) body.assignees = assignees;

        if (Object.keys(body).length === 0) {
          throw CliError.client(
            'No update fields provided. Specify --name, --status, --priority, --description, --parent, --add-assignee, or --rem-assignee.'
          );
        }

        ctx.ui.startSpinner('Updating task...');
        const resp = await ctx.client.put(
          `/v2/task/${resolved.id}${customQuery(ctx, resolved)}`,
          body
        );
        ctx.ui.stopSpinner();

        ctx.output.printSingle(resp, TASK_FIELDS, 'id');
      }
    );

  task
    .command('delete')
    .description('Delete a task (never auto-detects from branch)')
    .argument('[id]', 'Task ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string | undefined, opts: { yes?: boolean }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const resolved = requireTask(id, false, taskOpts(ctx));

      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          ctx.ui.error('Destructive operation requires --yes flag in non-interactive mode.');
          process.exit(1);
        }
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({ message: `Delete task "${resolved.raw}"?`, default: false });
        if (!ok) {
          ctx.ui.error('Cancelled.');
          return;
        }
      }

      ctx.ui.startSpinner('Deleting task...');
      await ctx.client.delete(`/v2/task/${resolved.id}${customQuery(ctx, resolved)}`);
      ctx.ui.stopSpinner();

      ctx.output.printMessage(`Task ${resolved.raw} deleted`);
    });

  task
    .command('time-in-status')
    .description('Show time spent in each status for a task')
    .argument('[ids...]', 'Task IDs (auto-detects from branch if omitted)')
    .action(async (ids: string[] | undefined, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const idsList = ids ?? [];

      if (idsList.length === 0) {
        const resolved = requireTask(undefined, true, taskOpts(ctx));
        ctx.ui.startSpinner('Fetching time in status...');
        const resp = await ctx.client.get(
          `/v2/task/${resolved.id}/time_in_status${customQuery(ctx, resolved)}`
        );
        ctx.ui.stopSpinner();
        printTimeInStatus(ctx, resp);
        return;
      }

      if (idsList.length === 1) {
        const resolved = parseTaskId(idsList[0]);
        ctx.ui.startSpinner('Fetching time in status...');
        const resp = await ctx.client.get(
          `/v2/task/${resolved.id}/time_in_status${customQuery(ctx, resolved)}`
        );
        ctx.ui.stopSpinner();
        printTimeInStatus(ctx, resp);
        return;
      }

      const params = new URLSearchParams();
      for (const id of idsList) params.append('task_ids', parseTaskId(id).id);
      ctx.ui.startSpinner('Fetching time in status...');
      const resp = (await ctx.client.get(
        `/v2/task/bulk_time_in_status/task_ids?${params.toString()}`
      )) as Record<string, { current_status?: { status?: unknown; total_time?: unknown } }>;
      ctx.ui.stopSpinner();

      const rows: Record<string, unknown>[] = [];
      for (const [taskId, data] of Object.entries(resp)) {
        const cs = data?.current_status;
        rows.push({
          task_id: taskId,
          status: cs?.status ?? null,
          total_time: cs?.total_time ?? null,
        });
      }
      ctx.output.printItems(rows, ['task_id', 'status', 'total_time'], 'task_id');
    });

  task
    .command('add-tag')
    .description('Add a tag to a task (auto-detects task if only tag given)')
    .argument('[args...]', 'Task ID and tag, or just tag')
    .action(async (args: string[] | undefined, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const a = args ?? [];
      if (a.length === 0 || a.length > 2) {
        throw CliError.client('Usage: task add-tag [taskId] <tagName>');
      }
      const { task: resolved, tag } =
        a.length === 2 ? resolveTaskTag(ctx, a[0], a[1]) : resolveTaskTag(ctx, a[0]);

      ctx.ui.startSpinner(`Adding tag '${tag}'...`);
      await ctx.client.post(
        `/v2/task/${resolved.id}/tag/${encodeURIComponent(tag)}${customQuery(ctx, resolved)}`,
        {}
      );
      ctx.ui.stopSpinner();

      ctx.output.printMessage(`Tag '${tag}' added to task ${resolved.raw}`);
    });

  task
    .command('remove-tag')
    .description('Remove a tag from a task (auto-detects task if only tag given)')
    .argument('[args...]', 'Task ID and tag, or just tag')
    .action(async (args: string[] | undefined, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const a = args ?? [];
      if (a.length === 0 || a.length > 2) {
        throw CliError.client('Usage: task remove-tag [taskId] <tagName>');
      }
      const { task: resolved, tag } =
        a.length === 2 ? resolveTaskTag(ctx, a[0], a[1]) : resolveTaskTag(ctx, a[0]);

      ctx.ui.startSpinner(`Removing tag '${tag}'...`);
      await ctx.client.delete(
        `/v2/task/${resolved.id}/tag/${encodeURIComponent(tag)}${customQuery(ctx, resolved)}`
      );
      ctx.ui.stopSpinner();

      ctx.output.printMessage(`Tag '${tag}' removed from task ${resolved.raw}`);
    });

  task
    .command('add-dep')
    .description('Add a dependency to a task (auto-detects ID from branch)')
    .argument('[id]', 'Task ID')
    .option('--depends-on <id>', 'Task that this task depends on')
    .option('--dependency-of <id>', 'Task that depends on this task')
    .action(
      async (
        id: string | undefined,
        opts: { dependsOn?: string; dependencyOf?: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(id, true, taskOpts(ctx));
        if (!opts.dependsOn && !opts.dependencyOf) {
          throw CliError.client('Provide --depends-on or --dependency-of.');
        }
        const body: Record<string, unknown> = {};
        if (opts.dependsOn) body.depends_on = parseTaskId(opts.dependsOn).id;
        if (opts.dependencyOf) body.dependency_of = parseTaskId(opts.dependencyOf).id;

        ctx.ui.startSpinner('Adding dependency...');
        await ctx.client.post(
          `/v2/task/${resolved.id}/dependency${customQuery(ctx, resolved)}`,
          body
        );
        ctx.ui.stopSpinner();

        ctx.output.printMessage('Dependency added');
      }
    );

  task
    .command('remove-dep')
    .description('Remove a dependency from a task (auto-detects ID from branch)')
    .argument('[id]', 'Task ID')
    .option('--depends-on <id>', 'Task that this task depends on')
    .option('--dependency-of <id>', 'Task that depends on this task')
    .action(
      async (
        id: string | undefined,
        opts: { dependsOn?: string; dependencyOf?: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(id, true, taskOpts(ctx));
        if (!opts.dependsOn && !opts.dependencyOf) {
          throw CliError.client('Provide --depends-on or --dependency-of.');
        }
        const body: Record<string, unknown> = {};
        if (opts.dependsOn) body.depends_on = parseTaskId(opts.dependsOn).id;
        if (opts.dependencyOf) body.dependency_of = parseTaskId(opts.dependencyOf).id;

        ctx.ui.startSpinner('Removing dependency...');
        await ctx.client.deleteWithBody(
          `/v2/task/${resolved.id}/dependency${customQuery(ctx, resolved)}`,
          body
        );
        ctx.ui.stopSpinner();

        ctx.output.printMessage('Dependency removed');
      }
    );

  task
    .command('link')
    .description('Link two tasks (explicit IDs only)')
    .argument('<id>', 'Source task ID')
    .argument('<targetId>', 'Target task ID')
    .action(async (id: string, targetId: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const resolved = parseTaskId(id);
      const target = parseTaskId(targetId);

      ctx.ui.startSpinner('Linking tasks...');
      await ctx.client.post(
        `/v2/task/${resolved.id}/link/${target.id}${customQuery(ctx, resolved)}`,
        {}
      );
      ctx.ui.stopSpinner();

      ctx.output.printMessage(`Task ${resolved.raw} linked to ${target.raw}`);
    });

  task
    .command('unlink')
    .description('Unlink two tasks (explicit IDs only)')
    .argument('<id>', 'Source task ID')
    .argument('<targetId>', 'Target task ID')
    .action(async (id: string, targetId: string, _opts: Record<string, unknown>, cmd: Command) => {
      const ctx = buildContext(cmd);
      const resolved = parseTaskId(id);
      const target = parseTaskId(targetId);

      ctx.ui.startSpinner('Unlinking tasks...');
      await ctx.client.delete(
        `/v2/task/${resolved.id}/link/${target.id}${customQuery(ctx, resolved)}`
      );
      ctx.ui.stopSpinner();

      ctx.output.printMessage(`Task ${resolved.raw} unlinked from ${target.raw}`);
    });

  task
    .command('move')
    .description('Move a task to a different list (auto-detects ID from branch)')
    .argument('[id]', 'Task ID')
    .requiredOption('--list <id>', 'Target list ID')
    .action(async (id: string | undefined, opts: { list: string }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const resolved = requireTask(id, true, taskOpts(ctx));
      const ws = ctx.resolveWorkspace();

      ctx.ui.startSpinner('Moving task...');
      await ctx.client.put(`/v3/workspaces/${ws}/tasks/${resolved.id}/home_list/${opts.list}`, {});
      ctx.ui.stopSpinner();

      ctx.output.printMessage(`Task ${resolved.raw} moved to list ${opts.list}`);
    });

  task
    .command('set-estimate')
    .description('Set a time estimate on a task (auto-detects ID from branch)')
    .argument('[id]', 'Task ID')
    .requiredOption('--time <ms>', 'Time estimate in milliseconds', parseIntArg)
    .option('--assignee <userId>', 'Assignee user ID for per-user estimate')
    .action(
      async (id: string | undefined, opts: { time: number; assignee?: string }, cmd: Command) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(id, true, taskOpts(ctx));

        ctx.ui.startSpinner('Setting estimate...');
        const resp = opts.assignee
          ? await ctx.client.patch(
              `/v3/workspaces/${ctx.resolveWorkspace()}/tasks/${resolved.id}/time_estimates_by_user`,
              {
                time_estimates: [
                  { user_id: Number.parseInt(opts.assignee, 10), time_estimate: opts.time },
                ],
              }
            )
          : await ctx.client.put(`/v2/task/${resolved.id}${customQuery(ctx, resolved)}`, {
              time_estimate: opts.time,
            });
        ctx.ui.stopSpinner();

        if (Array.isArray(resp)) {
          ctx.output.printItems(resp, ['assignee', 'time', 'user_id'], 'user_id');
        } else if (Array.isArray(resp?.time_estimates)) {
          ctx.output.printItems(resp.time_estimates, ['assignee', 'time', 'user_id'], 'user_id');
        } else {
          ctx.output.printSingle(resp, TASK_FIELDS, 'id');
        }
      }
    );

  task
    .command('replace-estimates')
    .description('Replace all per-user time estimates on a task (auto-detects ID from branch)')
    .argument('[id]', 'Task ID')
    .option(
      '--estimate <ASSIGNEE:MS>',
      'Estimate as ASSIGNEE:MS (repeatable; "unassigned" supported)'
    )
    .option('--body <json>', 'Raw JSON array of estimates (overrides --estimate)')
    .action(
      async (
        id: string | undefined,
        opts: { estimate?: string[]; body?: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(id, true, taskOpts(ctx));

        if (!opts.body && (!opts.estimate || opts.estimate.length === 0)) {
          throw CliError.client('Provide at least one --estimate or --body.');
        }
        const estimates = opts.body
          ? parseEstimatesBody(opts.body)
          : (opts.estimate ?? []).map(parseEstimate);

        ctx.ui.startSpinner('Replacing estimates...');
        const resp = await ctx.client.put(
          `/v3/workspaces/${ctx.resolveWorkspace()}/tasks/${resolved.id}/time_estimates_by_user`,
          estimates
        );
        ctx.ui.stopSpinner();

        const items = Array.isArray(resp) ? resp : (resp?.time_estimates ?? [resp]);
        ctx.output.printItems(items, ['assignee', 'time'], 'assignee');
      }
    );

  task
    .command('count')
    .description('Count tasks in a list')
    .requiredOption('--list <id>', 'List ID')
    .option('--status <status...>', 'Filter by status (repeatable)')
    .action(async (opts: { list: string; status?: string[] }, cmd: Command) => {
      const ctx = buildContext(cmd);
      const params = new URLSearchParams();
      params.set('include_closed', 'true');
      for (const s of opts.status ?? []) params.append('statuses[]', s);
      const base = params.toString();

      ctx.ui.startSpinner('Fetching tasks...');
      const { items, hasMore } = await walkPage(
        ctx.client,
        'tasks',
        (page) => `/v2/list/${opts.list}/task?${base}&page=${page}`,
        { all: true, limit: ctx.cli.limit }
      );
      ctx.ui.stopSpinner();

      console.log(items.length);
      if (hasMore) {
        process.stderr.write(
          'Warning: page-fetch safety limit reached; count may be a lower bound.\n'
        );
      }
    });

  task
    .command('batch-update')
    .description('Update title/tags on multiple tasks; reports per-task success/failure')
    .argument('<ids...>', 'Task IDs')
    .option('--name <name>', 'New name to apply to all tasks')
    .option('--add-tag <tag...>', 'Tag to add (repeatable)')
    .option('--remove-tag <tag...>', 'Tag to remove (repeatable)')
    .action(
      async (
        ids: string[],
        opts: { name?: string; addTag?: string[]; removeTag?: string[] },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        if (!opts.name && !opts.addTag?.length && !opts.removeTag?.length) {
          throw CliError.client('Provide --name, --add-tag, or --remove-tag.');
        }

        const results: Record<string, unknown>[] = [];
        ctx.ui.startSpinner(`Updating ${ids.length} task(s)...`);
        for (const rawId of ids) {
          const resolved = parseTaskId(rawId);
          try {
            if (opts.name) {
              await ctx.client.put(`/v2/task/${resolved.id}${customQuery(ctx, resolved)}`, {
                name: opts.name,
              });
            }
            for (const tag of opts.addTag ?? []) {
              await ctx.client.post(
                `/v2/task/${resolved.id}/tag/${encodeURIComponent(tag)}${customQuery(ctx, resolved)}`,
                {}
              );
            }
            for (const tag of opts.removeTag ?? []) {
              await ctx.client.delete(
                `/v2/task/${resolved.id}/tag/${encodeURIComponent(tag)}${customQuery(ctx, resolved)}`
              );
            }
            results.push({ id: resolved.raw, ok: true, error: null });
          } catch (e) {
            results.push({
              id: resolved.raw,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        ctx.ui.stopSpinner();

        ctx.output.printItems(results, ['id', 'ok', 'error'], 'id');
        const failed = results.filter((r) => !r.ok).length;
        ctx.output.printMessage(
          `${results.length - failed}/${results.length} tasks updated successfully`
        );
        if (failed > 0) {
          process.exitCode = 1;
        }
      }
    );
}
