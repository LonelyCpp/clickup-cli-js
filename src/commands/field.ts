import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ConfigManager } from '../config.js';
import { type Context, createContext } from '../context.js';
import { CliError } from '../error.js';
import { type ResolvedTask, requireTask } from '../git.js';

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

const FIELD_FIELDS = ['id', 'name', 'type', 'required'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFieldId(value: string): boolean {
  return UUID_RE.test(value);
}

export function resolveFieldId(fields: unknown[], fieldIdOrName: string): string | undefined {
  if (isFieldId(fieldIdOrName)) {
    return fieldIdOrName;
  }
  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (
        f !== null &&
        typeof f === 'object' &&
        (f as Record<string, unknown>).name === fieldIdOrName
      ) {
        return String((f as Record<string, unknown>).id);
      }
    }
  }
  return undefined;
}

export function taskHasFieldValue(task: unknown, fieldId: string): boolean {
  if (task === null || typeof task !== 'object') return false;
  const customFields = (task as Record<string, unknown>).custom_fields;
  if (!Array.isArray(customFields)) return false;
  for (const cf of customFields) {
    if (cf !== null && typeof cf === 'object') {
      const obj = cf as Record<string, unknown>;
      if (obj.id === fieldId && obj.value !== null && obj.value !== undefined) {
        return true;
      }
    }
  }
  return false;
}

export function registerField(program: Command): void {
  const field = program.command('field').description('Manage custom fields');

  field
    .command('list')
    .description('List custom fields at list, folder, space, or workspace level')
    .option('--list <id>', 'List ID')
    .option('--folder <id>', 'Folder ID')
    .option('--space <id>', 'Space ID')
    .option('--workspace-level', 'Workspace-level fields')
    .action(
      async (
        opts: { list?: string; folder?: string; space?: string; workspaceLevel?: boolean },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const scopes: string[] = [];
        if (opts.list) scopes.push('list');
        if (opts.folder) scopes.push('folder');
        if (opts.space) scopes.push('space');
        if (opts.workspaceLevel) scopes.push('workspace');
        if (scopes.length === 0) {
          throw CliError.client(
            'Specify exactly one of --list, --folder, --space, or --workspace-level.'
          );
        }
        if (scopes.length > 1) {
          throw CliError.client(
            'Specify only one of --list, --folder, --space, or --workspace-level.'
          );
        }
        let path: string;
        if (opts.list) path = `/v2/list/${opts.list}/field`;
        else if (opts.folder) path = `/v2/folder/${opts.folder}/field`;
        else if (opts.space) path = `/v2/space/${opts.space}/field`;
        else path = `/v2/team/${ctx.resolveWorkspace()}/field`;

        ctx.ui.startSpinner('Fetching fields...');
        const resp = await ctx.client.get(path);
        ctx.ui.stopSpinner();
        const items = Array.isArray(resp?.fields) ? resp.fields : [];
        ctx.output.printItems(items, FIELD_FIELDS, 'id');
      }
    );

  field
    .command('set')
    .description('Set a custom field value on a task (auto-detects task from branch)')
    .argument('<fieldId>', 'Custom field ID')
    .argument('[taskId]', 'Task ID')
    .requiredOption('--value <value>', 'Field value')
    .action(
      async (
        fieldId: string,
        taskId: string | undefined,
        opts: { value: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(taskId, true, taskOpts(ctx));
        ctx.ui.startSpinner('Setting field...');
        await ctx.client.post(
          `/v2/task/${resolved.id}/field/${fieldId}${customQuery(ctx, resolved)}`,
          { value: opts.value }
        );
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Field ${fieldId} set on task ${resolved.raw}`);
      }
    );

  field
    .command('unset')
    .description('Remove a custom field value from a task (auto-detects task from branch)')
    .argument('<fieldId>', 'Custom field ID')
    .argument('[taskId]', 'Task ID')
    .action(
      async (
        fieldId: string,
        taskId: string | undefined,
        _opts: Record<string, unknown>,
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(taskId, true, taskOpts(ctx));
        ctx.ui.startSpinner('Removing field...');
        await ctx.client.delete(
          `/v2/task/${resolved.id}/field/${fieldId}${customQuery(ctx, resolved)}`
        );
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Field ${fieldId} removed from task ${resolved.raw}`);
      }
    );

  field
    .command('ensure')
    .description(
      'Set a custom field value on a task only if the task does not already have a value for it (auto-detects task from branch; field can be ID or name)'
    )
    .argument('<field>', 'Custom field ID or name')
    .argument('[taskId]', 'Task ID')
    .requiredOption('--value <value>', 'Field value')
    .action(
      async (
        fieldIdOrName: string,
        taskId: string | undefined,
        opts: { value: string },
        cmd: Command
      ) => {
        const ctx = buildContext(cmd);
        const resolved = requireTask(taskId, true, taskOpts(ctx));

        ctx.ui.startSpinner('Fetching task...');
        const task = await ctx.client.get(`/v2/task/${resolved.id}${customQuery(ctx, resolved)}`);
        ctx.ui.stopSpinner();

        let fieldId: string;
        if (isFieldId(fieldIdOrName)) {
          fieldId = fieldIdOrName;
        } else {
          const listId = task?.list?.id;
          if (!listId) {
            throw CliError.client(
              'Could not determine task list for field name lookup. Pass a field ID instead.'
            );
          }
          ctx.ui.startSpinner('Looking up field...');
          const fieldsResp = await ctx.client.get(`/v2/list/${listId}/field`);
          ctx.ui.stopSpinner();
          const fields = Array.isArray(fieldsResp?.fields) ? fieldsResp.fields : [];
          const resolvedId = resolveFieldId(fields, fieldIdOrName);
          if (!resolvedId) {
            throw CliError.client(`Custom field '${fieldIdOrName}' not found in list ${listId}.`);
          }
          fieldId = resolvedId;
        }

        if (taskHasFieldValue(task, fieldId)) {
          ctx.output.printMessage(
            `Field ${fieldIdOrName} already has a value on task ${resolved.raw}; skipping.`
          );
          return;
        }

        ctx.ui.startSpinner('Setting field...');
        await ctx.client.post(
          `/v2/task/${resolved.id}/field/${fieldId}${customQuery(ctx, resolved)}`,
          { value: opts.value }
        );
        ctx.ui.stopSpinner();
        ctx.output.printMessage(`Field ${fieldIdOrName} set on task ${resolved.raw}`);
      }
    );
}
