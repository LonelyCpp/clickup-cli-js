import type { ClickUpClient } from '../client.js';
import { isFieldId, resolveFieldId, taskHasFieldValue } from '../commands/field.js';
import { parseTaskId } from '../git.js';
import { compactItems } from '../output.js';
import { extractArray, walkPage, walkStartId } from '../pagination.js';

const TASK_FIELDS = ['id', 'name', 'status', 'priority', 'assignees', 'due_date'];
const COMMENT_FIELDS = ['id', 'comment_text', 'user', 'date'];
const SPACE_FIELDS = ['id', 'name', 'private', 'archived'];
const FOLDER_FIELDS = ['id', 'name', 'task_count'];
const LIST_FIELDS = ['id', 'name', 'task_count'];
const VIEW_FIELDS = ['id', 'name', 'type'];
const TAG_FIELDS = ['name', 'tag_fg', 'tag_bg'];
const FIELD_FIELDS = ['id', 'name', 'type', 'required'];
const TIME_FIELDS = ['id', 'user', 'task', 'start', 'duration', 'billable', 'description'];
const HISTORY_FIELDS = ['id', 'user', 'duration', 'at'];
const MEMBER_FIELDS = ['id', 'username', 'email', 'color'];

function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

function numArg(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === 'number' ? v : undefined;
}

function boolArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === 'boolean' ? v : undefined;
}

function strArrayArg(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x));
}

function requireStr(args: Record<string, unknown>, key: string): string {
  const v = strArg(args, key);
  if (v === undefined) throw new Error(`Missing required parameter: ${key}`);
  return v;
}

function resolveWs(args: Record<string, unknown>, workspaceId: string | undefined): string {
  if (typeof args.team_id === 'string') return args.team_id;
  if (workspaceId) return workspaceId;
  throw new Error('No workspace_id. Provide team_id or run setup.');
}

function customQuery(taskId: string, workspaceId: string | undefined): string {
  const resolved = parseTaskId(taskId);
  if (resolved.isCustom && workspaceId) {
    return `?custom_task_ids=true&team_id=${workspaceId}`;
  }
  return '';
}

function dateToMs(dateStr: string): number {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`Invalid date '${dateStr}'. Use YYYY-MM-DD format.`);
  }
  return dt.getTime();
}

function hasListPaginationArgs(args: Record<string, unknown>): boolean {
  return args.page !== undefined || args.limit !== undefined || args.all !== undefined;
}

function hasStartIdArgs(args: Record<string, unknown>): boolean {
  return (
    args.limit !== undefined ||
    args.all !== undefined ||
    args.start !== undefined ||
    args.start_id !== undefined
  );
}

async function paginatedList(
  client: ClickUpClient,
  itemsKey: string,
  buildPath: (page: number) => string,
  args: Record<string, unknown>,
  fields: string[]
): Promise<unknown> {
  const page = numArg(args, 'page') ?? 0;
  const limit = numArg(args, 'limit');
  const all = boolArg(args, 'all') === true;

  if (!hasListPaginationArgs(args)) {
    const resp = await client.get(buildPath(0));
    const items = extractArray(resp, [itemsKey, 'data']) ?? [];
    return compactItems(items, fields);
  }

  if (all) {
    const { items, hasMore } = await walkPage(client, itemsKey, buildPath, {
      all: true,
      limit,
      page,
    });
    return {
      items: compactItems(items, fields),
      pagination: { page, limit: limit ?? null, has_more: hasMore },
    };
  }

  const resp = await client.get(buildPath(page));
  const items = extractArray(resp, [itemsKey, 'data']) ?? [];
  const lastPage = resp?.last_page === true || items.length === 0;
  return {
    items: compactItems(items, fields),
    pagination: { page, limit: limit ?? null, has_more: !lastPage },
  };
}

function buildTaskListParams(args: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  params.set('include_closed', String(boolArg(args, 'include_closed') === true));
  for (const s of strArrayArg(args, 'statuses') ?? []) params.append('statuses[]', s);
  for (const a of strArrayArg(args, 'assignees') ?? []) params.append('assignees[]', a);
  for (const t of strArrayArg(args, 'tags') ?? []) params.append('tags[]', t);
  if (strArg(args, 'order_by')) params.set('order_by', strArg(args, 'order_by') as string);
  if (boolArg(args, 'reverse')) params.set('reverse', 'true');
  return params;
}

function buildTaskSearchParams(args: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const s of strArrayArg(args, 'space_ids') ?? []) params.append('space_ids[]', s);
  for (const f of strArrayArg(args, 'folder_ids') ?? []) params.append('project_ids[]', f);
  for (const l of strArrayArg(args, 'list_ids') ?? []) params.append('list_ids[]', l);
  for (const s of strArrayArg(args, 'statuses') ?? []) params.append('statuses[]', s);
  for (const a of strArrayArg(args, 'assignees') ?? []) params.append('assignees[]', a);
  for (const t of strArrayArg(args, 'tags') ?? []) params.append('tags[]', t);
  return params;
}

function resolveCommentScope(args: Record<string, unknown>): { kind: string; id: string } {
  const taskId = strArg(args, 'task_id');
  const listId = strArg(args, 'list_id');
  const viewId = strArg(args, 'view_id');
  const present: { kind: string; id: string }[] = [];
  if (taskId) present.push({ kind: 'task', id: taskId });
  if (listId) present.push({ kind: 'list', id: listId });
  if (viewId) present.push({ kind: 'view', id: viewId });
  if (present.length === 0) {
    throw new Error('Specify exactly one of task_id, list_id, or view_id.');
  }
  if (present.length > 1) {
    throw new Error('Specify only one of task_id, list_id, or view_id.');
  }
  return present[0];
}

function commentBasePath(scope: { kind: string; id: string }): string {
  switch (scope.kind) {
    case 'task':
      return `/v2/task/${scope.id}/comment`;
    case 'list':
      return `/v2/list/${scope.id}/comment`;
    case 'view':
      return `/v2/view/${scope.id}/comment`;
    default:
      return '';
  }
}

async function commentList(
  client: ClickUpClient,
  basePath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const start = numArg(args, 'start');
  const startId = strArg(args, 'start_id');
  const limit = numArg(args, 'limit');
  const all = boolArg(args, 'all') === true;

  const buildPath = (s: number | null, sid: string | null): string => {
    const params: string[] = [];
    if (s != null) params.push(`start=${s}`);
    if (sid) params.push(`start_id=${sid}`);
    return params.length ? `${basePath}?${params.join('&')}` : basePath;
  };

  if (!hasStartIdArgs(args)) {
    const resp = await client.get(basePath);
    const items = extractArray(resp, ['comments', 'data']) ?? [];
    return compactItems(items, COMMENT_FIELDS);
  }

  const { items, hasMore } = await walkStartId(client, 'comments', buildPath, {
    all,
    limit,
    start,
    startId,
  });
  return {
    items: compactItems(items, COMMENT_FIELDS),
    pagination: { limit: limit ?? null, has_more: hasMore },
  };
}

function resolveViewScope(args: Record<string, unknown>, ws: string): string {
  if (boolArg(args, 'workspace_level')) return `/v2/team/${ws}/view`;
  if (strArg(args, 'space_id')) return `/v2/space/${strArg(args, 'space_id')}/view`;
  if (strArg(args, 'folder_id')) return `/v2/folder/${strArg(args, 'folder_id')}/view`;
  if (strArg(args, 'list_id')) return `/v2/list/${strArg(args, 'list_id')}/view`;
  throw new Error('Exactly one of workspace_level, space_id, folder_id, or list_id is required.');
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  client: ClickUpClient,
  workspaceId: string | undefined
): Promise<unknown> {
  switch (name) {
    case 'clickup_whoami':
      return client.get('/v2/user');

    case 'clickup_workspace_list': {
      const res = await client.get('/v2/team');
      const teams = Array.isArray(res?.teams) ? res.teams : [];
      return teams.map((t: Record<string, unknown>) => ({
        id: t.id,
        name: t.name,
        members: Array.isArray(t.members) ? t.members.length : 0,
      }));
    }
    case 'clickup_workspace_seats': {
      const ws = resolveWs(args, workspaceId);
      const res = await client.get(`/v2/team/${ws}/seats`);
      return res?.seats ?? res;
    }
    case 'clickup_workspace_plan': {
      const ws = resolveWs(args, workspaceId);
      const res = await client.get(`/v2/team/${ws}/plan`);
      return res?.plan ?? res;
    }

    case 'clickup_space_list': {
      const ws = resolveWs(args, workspaceId);
      const archived = boolArg(args, 'archived') ? 'true' : 'false';
      return paginatedList(
        client,
        'spaces',
        (page) => `/v2/team/${ws}/space?archived=${archived}&page=${page}`,
        args,
        SPACE_FIELDS
      );
    }
    case 'clickup_space_get':
      return client.get(`/v2/space/${requireStr(args, 'id')}`);
    case 'clickup_space_create': {
      const ws = resolveWs(args, workspaceId);
      const body: Record<string, unknown> = { name: requireStr(args, 'name') };
      if (boolArg(args, 'private')) body.private = true;
      return client.post(`/v2/team/${ws}/space`, body);
    }
    case 'clickup_space_update': {
      const body: Record<string, unknown> = {};
      if (strArg(args, 'name')) body.name = strArg(args, 'name');
      return client.put(`/v2/space/${requireStr(args, 'id')}`, body);
    }
    case 'clickup_space_delete': {
      await client.delete(`/v2/space/${requireStr(args, 'id')}`);
      return { message: `Space ${requireStr(args, 'id')} deleted` };
    }

    case 'clickup_folder_list': {
      const spaceId = requireStr(args, 'space_id');
      const archived = boolArg(args, 'archived') ? 'true' : 'false';
      return paginatedList(
        client,
        'folders',
        (page) => `/v2/space/${spaceId}/folder?archived=${archived}&page=${page}`,
        args,
        FOLDER_FIELDS
      );
    }
    case 'clickup_folder_get':
      return client.get(`/v2/folder/${requireStr(args, 'id')}`);
    case 'clickup_folder_create': {
      const spaceId = requireStr(args, 'space_id');
      return client.post(`/v2/space/${spaceId}/folder`, { name: requireStr(args, 'name') });
    }
    case 'clickup_folder_update':
      return client.put(`/v2/folder/${requireStr(args, 'id')}`, { name: requireStr(args, 'name') });
    case 'clickup_folder_delete': {
      await client.delete(`/v2/folder/${requireStr(args, 'id')}`);
      return { message: `Folder ${requireStr(args, 'id')} deleted` };
    }

    case 'clickup_list_list': {
      const folderId = strArg(args, 'folder_id');
      const spaceId = strArg(args, 'space_id');
      if (Boolean(folderId) === Boolean(spaceId)) {
        throw new Error('Either folder_id or space_id is required (but not both).');
      }
      const archived = boolArg(args, 'archived') ? 'true' : 'false';
      const basePath = folderId ? `/v2/folder/${folderId}/list` : `/v2/space/${spaceId}/list`;
      return paginatedList(
        client,
        'lists',
        (page) => `${basePath}?archived=${archived}&page=${page}`,
        args,
        LIST_FIELDS
      );
    }
    case 'clickup_list_get':
      return client.get(`/v2/list/${requireStr(args, 'id')}`);
    case 'clickup_list_create': {
      const folderId = strArg(args, 'folder_id');
      const spaceId = strArg(args, 'space_id');
      if (Boolean(folderId) === Boolean(spaceId)) {
        throw new Error('Either folder_id or space_id is required (but not both).');
      }
      const basePath = folderId ? `/v2/folder/${folderId}/list` : `/v2/space/${spaceId}/list`;
      const body: Record<string, unknown> = { name: requireStr(args, 'name') };
      if (strArg(args, 'content')) body.content = strArg(args, 'content');
      if (strArg(args, 'due_date'))
        body.due_date = String(dateToMs(strArg(args, 'due_date') as string));
      return client.post(basePath, body);
    }
    case 'clickup_list_update': {
      const body: Record<string, unknown> = {};
      if (strArg(args, 'name')) body.name = strArg(args, 'name');
      if (strArg(args, 'content')) body.content = strArg(args, 'content');
      if (strArg(args, 'due_date'))
        body.due_date = String(dateToMs(strArg(args, 'due_date') as string));
      return client.put(`/v2/list/${requireStr(args, 'id')}`, body);
    }
    case 'clickup_list_delete': {
      await client.delete(`/v2/list/${requireStr(args, 'id')}`);
      return { message: `List ${requireStr(args, 'id')} deleted` };
    }
    case 'clickup_list_add_task': {
      const listId = requireStr(args, 'list_id');
      const taskId = requireStr(args, 'task_id');
      await client.post(`/v2/list/${listId}/task/${taskId}`, {});
      return { message: `Task ${taskId} added to list ${listId}` };
    }
    case 'clickup_list_remove_task': {
      const listId = requireStr(args, 'list_id');
      const taskId = requireStr(args, 'task_id');
      await client.delete(`/v2/list/${listId}/task/${taskId}`);
      return { message: `Task ${taskId} removed from list ${listId}` };
    }

    case 'clickup_task_list': {
      const listId = requireStr(args, 'list_id');
      const base = buildTaskListParams(args).toString();
      return paginatedList(
        client,
        'tasks',
        (page) => `/v2/list/${listId}/task?${base}&page=${page}`,
        args,
        TASK_FIELDS
      );
    }
    case 'clickup_task_search': {
      const ws = resolveWs(args, workspaceId);
      const base = buildTaskSearchParams(args).toString();
      return paginatedList(
        client,
        'tasks',
        (page) => `/v2/team/${ws}/task?${base}&page=${page}`,
        args,
        TASK_FIELDS
      );
    }
    case 'clickup_task_get': {
      const taskId = requireStr(args, 'task_id');
      const customTaskId = boolArg(args, 'custom_task_id');
      const resolved = parseTaskId(taskId);
      const isCustom = customTaskId || resolved.isCustom;
      const params = new URLSearchParams();
      params.set('include_subtasks', String(boolArg(args, 'subtasks') === true));
      params.set('include_markdown_description', String(boolArg(args, 'markdown') === true));
      if (isCustom) {
        params.set('custom_task_ids', 'true');
        params.set('team_id', resolveWs(args, workspaceId));
      }
      return client.get(`/v2/task/${resolved.id}?${params.toString()}`);
    }
    case 'clickup_task_create': {
      const listId = requireStr(args, 'list_id');
      const body: Record<string, unknown> = { name: requireStr(args, 'name') };
      if (strArg(args, 'description')) body.markdown_content = strArg(args, 'description');
      if (strArg(args, 'status')) body.status = strArg(args, 'status');
      if (numArg(args, 'priority') != null) body.priority = numArg(args, 'priority');
      const assignees = strArrayArg(args, 'assignees');
      if (assignees?.length) body.assignees = assignees.map((a) => Number.parseInt(a, 10));
      const tags = strArrayArg(args, 'tags');
      if (tags?.length) body.tags = tags;
      if (strArg(args, 'due_date'))
        body.due_date = String(dateToMs(strArg(args, 'due_date') as string));
      if (strArg(args, 'parent')) body.parent = strArg(args, 'parent');
      return client.post(`/v2/list/${listId}/task`, body);
    }
    case 'clickup_task_update': {
      const taskId = requireStr(args, 'task_id');
      const body: Record<string, unknown> = {};
      if (strArg(args, 'name')) body.name = strArg(args, 'name');
      if (strArg(args, 'status')) body.status = strArg(args, 'status');
      if (numArg(args, 'priority') != null) body.priority = numArg(args, 'priority');
      if (strArg(args, 'description') != null) body.markdown_content = strArg(args, 'description');
      if (strArg(args, 'parent')) body.parent = strArg(args, 'parent');
      const assignees: Record<string, unknown> = {};
      const addAssignees = strArrayArg(args, 'add_assignees');
      const remAssignees = strArrayArg(args, 'rem_assignees');
      if (addAssignees?.length) assignees.add = addAssignees.map((a) => Number.parseInt(a, 10));
      if (remAssignees?.length) assignees.rem = remAssignees.map((a) => Number.parseInt(a, 10));
      if (Object.keys(assignees).length > 0) body.assignees = assignees;
      return client.put(`/v2/task/${taskId}${customQuery(taskId, workspaceId)}`, body);
    }
    case 'clickup_task_delete': {
      const taskId = requireStr(args, 'task_id');
      await client.delete(`/v2/task/${taskId}${customQuery(taskId, workspaceId)}`);
      return { message: `Task ${taskId} deleted` };
    }
    case 'clickup_task_time_in_status': {
      const taskId = requireStr(args, 'task_id');
      return client.get(`/v2/task/${taskId}/time_in_status${customQuery(taskId, workspaceId)}`);
    }
    case 'clickup_task_add_tag': {
      const taskId = requireStr(args, 'task_id');
      const tag = requireStr(args, 'tag');
      await client.post(
        `/v2/task/${taskId}/tag/${encodeURIComponent(tag)}${customQuery(taskId, workspaceId)}`,
        {}
      );
      return { message: `Tag '${tag}' added to task ${taskId}` };
    }
    case 'clickup_task_remove_tag': {
      const taskId = requireStr(args, 'task_id');
      const tag = requireStr(args, 'tag');
      await client.delete(
        `/v2/task/${taskId}/tag/${encodeURIComponent(tag)}${customQuery(taskId, workspaceId)}`
      );
      return { message: `Tag '${tag}' removed from task ${taskId}` };
    }
    case 'clickup_task_add_dep': {
      const taskId = requireStr(args, 'task_id');
      const dependsOn = strArg(args, 'depends_on');
      const dependencyOf = strArg(args, 'dependency_of');
      if (!dependsOn && !dependencyOf) {
        throw new Error('Provide depends_on or dependency_of.');
      }
      const body: Record<string, unknown> = {};
      if (dependsOn) body.depends_on = parseTaskId(dependsOn).id;
      if (dependencyOf) body.dependency_of = parseTaskId(dependencyOf).id;
      await client.post(`/v2/task/${taskId}/dependency${customQuery(taskId, workspaceId)}`, body);
      return { message: 'Dependency added' };
    }
    case 'clickup_task_remove_dep': {
      const taskId = requireStr(args, 'task_id');
      const dependsOn = strArg(args, 'depends_on');
      const dependencyOf = strArg(args, 'dependency_of');
      if (!dependsOn && !dependencyOf) {
        throw new Error('Provide depends_on or dependency_of.');
      }
      const body: Record<string, unknown> = {};
      if (dependsOn) body.depends_on = parseTaskId(dependsOn).id;
      if (dependencyOf) body.dependency_of = parseTaskId(dependencyOf).id;
      await client.deleteWithBody(
        `/v2/task/${taskId}/dependency${customQuery(taskId, workspaceId)}`,
        body
      );
      return { message: 'Dependency removed' };
    }
    case 'clickup_task_link': {
      const taskId = requireStr(args, 'task_id');
      const targetId = requireStr(args, 'target_id');
      const resolved = parseTaskId(taskId);
      const target = parseTaskId(targetId);
      await client.post(
        `/v2/task/${resolved.id}/link/${target.id}${customQuery(taskId, workspaceId)}`,
        {}
      );
      return { message: `Task ${taskId} linked to ${targetId}` };
    }
    case 'clickup_task_unlink': {
      const taskId = requireStr(args, 'task_id');
      const targetId = requireStr(args, 'target_id');
      const resolved = parseTaskId(taskId);
      const target = parseTaskId(targetId);
      await client.delete(
        `/v2/task/${resolved.id}/link/${target.id}${customQuery(taskId, workspaceId)}`
      );
      return { message: `Task ${taskId} unlinked from ${targetId}` };
    }
    case 'clickup_task_move': {
      const taskId = requireStr(args, 'task_id');
      const listId = requireStr(args, 'list_id');
      const ws = resolveWs(args, workspaceId);
      const resolved = parseTaskId(taskId);
      await client.put(`/v3/workspaces/${ws}/tasks/${resolved.id}/home_list/${listId}`, {});
      return { message: `Task ${taskId} moved to list ${listId}` };
    }
    case 'clickup_task_set_estimate': {
      const taskId = requireStr(args, 'task_id');
      const time = numArg(args, 'time');
      if (time == null) throw new Error('Missing required parameter: time');
      const assignee = strArg(args, 'assignee');
      if (assignee) {
        return client.patch(
          `/v3/workspaces/${resolveWs(args, workspaceId)}/tasks/${parseTaskId(taskId).id}/time_estimates_by_user`,
          {
            time_estimates: [{ user_id: Number.parseInt(assignee, 10), time_estimate: time }],
          }
        );
      }
      return client.put(`/v2/task/${taskId}${customQuery(taskId, workspaceId)}`, {
        time_estimate: time,
      });
    }
    case 'clickup_task_replace_estimates': {
      const taskId = requireStr(args, 'task_id');
      const estimates = args.estimates;
      if (!Array.isArray(estimates))
        throw new Error('Missing required parameter: estimates (array)');
      const resp = await client.put(
        `/v3/workspaces/${resolveWs(args, workspaceId)}/tasks/${parseTaskId(taskId).id}/time_estimates_by_user`,
        estimates
      );
      const items = Array.isArray(resp) ? resp : (resp?.time_estimates ?? [resp]);
      return compactItems(items, ['assignee', 'time', 'user_id']);
    }
    case 'clickup_task_count': {
      const listId = requireStr(args, 'list_id');
      const params = new URLSearchParams();
      params.set('include_closed', 'true');
      for (const s of strArrayArg(args, 'statuses') ?? []) params.append('statuses[]', s);
      const base = params.toString();
      const { items, hasMore } = await walkPage(
        client,
        'tasks',
        (page) => `/v2/list/${listId}/task?${base}&page=${page}`,
        { all: true }
      );
      return hasMore
        ? {
            count: items.length,
            note: 'Page-fetch safety limit reached; count may be a lower bound.',
          }
        : { count: items.length };
    }

    case 'clickup_comment_list': {
      const scope = resolveCommentScope(args);
      return commentList(client, commentBasePath(scope), args);
    }
    case 'clickup_comment_create': {
      const scope = resolveCommentScope(args);
      const body: Record<string, unknown> = { comment_text: requireStr(args, 'text') };
      if (boolArg(args, 'notify_all')) body.notify_all = true;
      return client.post(commentBasePath(scope), body);
    }
    case 'clickup_comment_update': {
      const commentId = requireStr(args, 'comment_id');
      const body: Record<string, unknown> = { comment_text: requireStr(args, 'text') };
      if (boolArg(args, 'resolved')) body.resolved = true;
      return client.put(`/v2/comment/${commentId}`, body);
    }
    case 'clickup_comment_delete': {
      const commentId = requireStr(args, 'comment_id');
      await client.delete(`/v2/comment/${commentId}`);
      return { message: `Comment ${commentId} deleted` };
    }
    case 'clickup_comment_replies': {
      const commentId = requireStr(args, 'comment_id');
      return commentList(client, `/v2/comment/${commentId}/reply`, args);
    }
    case 'clickup_comment_reply': {
      const commentId = requireStr(args, 'comment_id');
      return client.post(`/v2/comment/${commentId}/reply`, {
        comment_text: requireStr(args, 'text'),
      });
    }

    case 'clickup_tag_list': {
      const spaceId = requireStr(args, 'space_id');
      const res = await client.get(`/v2/space/${spaceId}/tag`);
      const items = Array.isArray(res?.tags) ? res.tags : [];
      return compactItems(items, TAG_FIELDS);
    }
    case 'clickup_tag_create': {
      const spaceId = requireStr(args, 'space_id');
      const body: Record<string, unknown> = { name: requireStr(args, 'name') };
      if (strArg(args, 'fg_color')) body.tag_fg = strArg(args, 'fg_color');
      if (strArg(args, 'bg_color')) body.tag_bg = strArg(args, 'bg_color');
      await client.post(`/v2/space/${spaceId}/tag`, body);
      return { message: `Tag '${requireStr(args, 'name')}' created` };
    }
    case 'clickup_tag_update': {
      const spaceId = requireStr(args, 'space_id');
      const tag = requireStr(args, 'tag');
      const body: Record<string, unknown> = { name: tag };
      if (strArg(args, 'name')) body.new_name = strArg(args, 'name');
      if (strArg(args, 'fg_color')) body.fg_color = strArg(args, 'fg_color');
      if (strArg(args, 'bg_color')) body.bg_color = strArg(args, 'bg_color');
      await client.put(`/v2/space/${spaceId}/tag`, body);
      return { message: `Tag '${tag}' updated` };
    }
    case 'clickup_tag_delete': {
      const spaceId = requireStr(args, 'space_id');
      const tag = requireStr(args, 'tag');
      await client.delete(`/v2/space/${spaceId}/tag/${encodeURIComponent(tag)}`);
      return { message: `Tag '${tag}' deleted` };
    }

    case 'clickup_field_list': {
      const listId = strArg(args, 'list_id');
      const folderId = strArg(args, 'folder_id');
      const spaceId = strArg(args, 'space_id');
      const workspaceLevel = boolArg(args, 'workspace_level');
      const scopes = [listId, folderId, spaceId, workspaceLevel].filter((v) => Boolean(v));
      if (scopes.length === 0) {
        throw new Error('Specify exactly one of list_id, folder_id, space_id, or workspace_level.');
      }
      if (scopes.length > 1) {
        throw new Error('Specify only one of list_id, folder_id, space_id, or workspace_level.');
      }
      let path: string;
      if (listId) path = `/v2/list/${listId}/field`;
      else if (folderId) path = `/v2/folder/${folderId}/field`;
      else if (spaceId) path = `/v2/space/${spaceId}/field`;
      else path = `/v2/team/${resolveWs(args, workspaceId)}/field`;
      const res = await client.get(path);
      const items = Array.isArray(res?.fields) ? res.fields : [];
      return compactItems(items, FIELD_FIELDS);
    }
    case 'clickup_field_set': {
      const fieldId = requireStr(args, 'field_id');
      const taskId = requireStr(args, 'task_id');
      await client.post(`/v2/task/${taskId}/field/${fieldId}${customQuery(taskId, workspaceId)}`, {
        value: requireStr(args, 'value'),
      });
      return { message: `Field ${fieldId} set on task ${taskId}` };
    }
    case 'clickup_field_unset': {
      const fieldId = requireStr(args, 'field_id');
      const taskId = requireStr(args, 'task_id');
      await client.delete(`/v2/task/${taskId}/field/${fieldId}${customQuery(taskId, workspaceId)}`);
      return { message: `Field ${fieldId} removed from task ${taskId}` };
    }
    case 'clickup_field_ensure': {
      const fieldIdOrName = requireStr(args, 'field_id');
      const taskId = requireStr(args, 'task_id');
      const value = requireStr(args, 'value');
      const query = customQuery(taskId, workspaceId);

      const task = await client.get(`/v2/task/${taskId}${query}`);

      let fieldId: string;
      if (isFieldId(fieldIdOrName)) {
        fieldId = fieldIdOrName;
      } else {
        const listId = task?.list?.id;
        if (!listId) {
          throw new Error(
            'Could not determine task list for field name lookup. Pass a field ID instead.'
          );
        }
        const fieldsResp = await client.get(`/v2/list/${listId}/field`);
        const fields = Array.isArray(fieldsResp?.fields) ? fieldsResp.fields : [];
        const resolvedId = resolveFieldId(fields, fieldIdOrName);
        if (!resolvedId) {
          throw new Error(`Custom field '${fieldIdOrName}' not found in list ${listId}.`);
        }
        fieldId = resolvedId;
      }

      if (taskHasFieldValue(task, fieldId)) {
        return {
          message: `Field ${fieldIdOrName} already has a value on task ${taskId}; skipping.`,
        };
      }

      await client.post(`/v2/task/${taskId}/field/${fieldId}${query}`, { value });
      return { message: `Field ${fieldIdOrName} set on task ${taskId}` };
    }

    case 'clickup_time_list': {
      const ws = resolveWs(args, workspaceId);
      const params = new URLSearchParams();
      const startDate = strArg(args, 'start_date');
      if (startDate) {
        params.set('start_date', String(dateToMs(startDate)));
      } else {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        params.set('start_date', String(thirtyDaysAgo));
      }
      const endDate = strArg(args, 'end_date');
      if (endDate) {
        params.set('end_date', String(dateToMs(endDate)));
      } else {
        params.set('end_date', String(Date.now()));
      }
      if (strArg(args, 'task_id')) params.set('task_id', strArg(args, 'task_id') as string);
      const res = await client.get(`/v2/team/${ws}/time_entry?${params.toString()}`);
      const items = extractArray(res, ['data']) ?? [];
      return compactItems(items, TIME_FIELDS);
    }
    case 'clickup_time_get': {
      const ws = resolveWs(args, workspaceId);
      return client.get(`/v2/team/${ws}/time_entry/${requireStr(args, 'entry_id')}`);
    }
    case 'clickup_time_current': {
      const ws = resolveWs(args, workspaceId);
      return client.get(`/v2/team/${ws}/time_entry/current`);
    }
    case 'clickup_time_create': {
      const ws = resolveWs(args, workspaceId);
      const body: Record<string, unknown> = {
        start: dateToMs(requireStr(args, 'start')),
        duration: numArg(args, 'duration'),
      };
      if (strArg(args, 'task_id')) body.task_id = strArg(args, 'task_id');
      if (strArg(args, 'description')) body.description = strArg(args, 'description');
      if (boolArg(args, 'billable')) body.billable = true;
      const tags = strArrayArg(args, 'tags');
      if (tags?.length) body.tags = tags;
      return client.post(`/v2/team/${ws}/time_entry`, body);
    }
    case 'clickup_time_update': {
      const ws = resolveWs(args, workspaceId);
      const body: Record<string, unknown> = {};
      if (strArg(args, 'start')) body.start = dateToMs(strArg(args, 'start') as string);
      if (numArg(args, 'duration') != null) body.duration = numArg(args, 'duration');
      if (strArg(args, 'task_id')) body.task_id = strArg(args, 'task_id');
      if (strArg(args, 'description') != null) body.description = strArg(args, 'description');
      if (boolArg(args, 'billable')) body.billable = true;
      const tags = strArrayArg(args, 'tags');
      if (tags?.length) body.tags = tags;
      return client.put(`/v2/team/${ws}/time_entry/${requireStr(args, 'entry_id')}`, body);
    }
    case 'clickup_time_delete': {
      const ws = resolveWs(args, workspaceId);
      await client.delete(`/v2/team/${ws}/time_entry/${requireStr(args, 'entry_id')}`);
      return { message: `Time entry ${requireStr(args, 'entry_id')} deleted` };
    }
    case 'clickup_time_start': {
      const ws = resolveWs(args, workspaceId);
      const body: Record<string, unknown> = {};
      if (strArg(args, 'task_id')) body.task_id = strArg(args, 'task_id');
      if (strArg(args, 'description')) body.description = strArg(args, 'description');
      if (boolArg(args, 'billable')) body.billable = true;
      const tags = strArrayArg(args, 'tags');
      if (tags?.length) body.tags = tags;
      return client.post(`/v2/team/${ws}/time_entry/start`, body);
    }
    case 'clickup_time_stop': {
      const ws = resolveWs(args, workspaceId);
      return client.post(`/v2/team/${ws}/time_entry/stop`, {});
    }
    case 'clickup_time_tags': {
      const ws = resolveWs(args, workspaceId);
      const res = await client.get(`/v2/team/${ws}/time_entry/tags`);
      const items = extractArray(res, ['tags']) ?? [];
      return compactItems(items, TAG_FIELDS);
    }
    case 'clickup_time_add_tags': {
      const ws = resolveWs(args, workspaceId);
      const entryId = requireStr(args, 'entry_id');
      const body: Record<string, unknown> = { name: requireStr(args, 'tag') };
      if (strArg(args, 'tag_bg')) body.tag_bg = strArg(args, 'tag_bg');
      if (strArg(args, 'tag_fg')) body.tag_fg = strArg(args, 'tag_fg');
      await client.post(`/v2/team/${ws}/time_entry/${entryId}/tag`, body);
      return { message: `Tag '${requireStr(args, 'tag')}' added to time entry ${entryId}` };
    }
    case 'clickup_time_remove_tags': {
      const ws = resolveWs(args, workspaceId);
      const entryId = requireStr(args, 'entry_id');
      const tag = requireStr(args, 'tag');
      await client.deleteWithBody(`/v2/team/${ws}/time_entry/${entryId}/tag`, { name: tag });
      return { message: `Tag '${tag}' removed from time entry ${entryId}` };
    }
    case 'clickup_time_rename_tag': {
      const ws = resolveWs(args, workspaceId);
      const oldName = requireStr(args, 'name');
      const newName = requireStr(args, 'new_name');
      await client.put(`/v2/team/${ws}/time_entry/tags/${encodeURIComponent(oldName)}`, {
        name: newName,
      });
      return { message: `Tag '${oldName}' renamed to '${newName}'` };
    }
    case 'clickup_time_history': {
      const ws = resolveWs(args, workspaceId);
      const res = await client.get(
        `/v2/team/${ws}/time_entry/${requireStr(args, 'entry_id')}/history`
      );
      const items = extractArray(res, ['data']) ?? [];
      return compactItems(items, HISTORY_FIELDS);
    }

    case 'clickup_view_list': {
      const ws = resolveWs(args, workspaceId);
      const basePath = resolveViewScope(args, ws);
      const res = await client.get(basePath);
      const items = Array.isArray(res?.views) ? res.views : [];
      return compactItems(items, VIEW_FIELDS);
    }
    case 'clickup_view_get':
      return client.get(`/v2/view/${requireStr(args, 'id')}`);
    case 'clickup_view_create': {
      const ws = resolveWs(args, workspaceId);
      const basePath = resolveViewScope(args, ws);
      return client.post(basePath, {
        name: requireStr(args, 'name'),
        type: requireStr(args, 'type'),
      });
    }
    case 'clickup_view_update': {
      const body: Record<string, unknown> = {};
      if (strArg(args, 'name')) body.name = strArg(args, 'name');
      return client.put(`/v2/view/${requireStr(args, 'id')}`, body);
    }
    case 'clickup_view_delete': {
      await client.delete(`/v2/view/${requireStr(args, 'id')}`);
      return { message: `View ${requireStr(args, 'id')} deleted` };
    }
    case 'clickup_view_tasks': {
      const id = requireStr(args, 'id');
      return paginatedList(
        client,
        'tasks',
        (page) => `/v2/view/${id}/task?page=${page}`,
        args,
        TASK_FIELDS
      );
    }

    case 'clickup_member_list': {
      const taskId = strArg(args, 'task_id');
      const listId = strArg(args, 'list_id');
      if (Boolean(taskId) === Boolean(listId)) {
        throw new Error('Either task_id or list_id is required (but not both).');
      }
      const basePath = taskId ? `/v2/task/${taskId}/member` : `/v2/list/${listId}/member`;
      const res = await client.get(basePath);
      const items = Array.isArray(res?.members) ? res.members : [];
      return compactItems(items, MEMBER_FIELDS);
    }

    case 'clickup_user_invite': {
      const ws = resolveWs(args, workspaceId);
      return client.post(`/v2/team/${ws}/user`, { email: requireStr(args, 'email') });
    }
    case 'clickup_user_get': {
      const ws = resolveWs(args, workspaceId);
      return client.get(`/v2/team/${ws}/user/${requireStr(args, 'user_id')}`);
    }
    case 'clickup_user_update': {
      const ws = resolveWs(args, workspaceId);
      const body: Record<string, unknown> = {};
      if (strArg(args, 'name')) body.name = strArg(args, 'name');
      if (strArg(args, 'role')) body.role = strArg(args, 'role');
      return client.put(`/v2/team/${ws}/user/${requireStr(args, 'user_id')}`, body);
    }
    case 'clickup_user_remove': {
      const ws = resolveWs(args, workspaceId);
      await client.delete(`/v2/team/${ws}/user/${requireStr(args, 'user_id')}`);
      return { message: `User ${requireStr(args, 'user_id')} removed` };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
