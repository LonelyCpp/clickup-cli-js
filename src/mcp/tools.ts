export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  _group: string;
}

const TASK_FIELDS_DESC =
  'Returns compact array with id, name, status, priority, assignees, due_date (native JSON types preserved).';

export const TOOL_DEFINITIONS: ToolDef[] = [
  {
    name: 'clickup_whoami',
    description: 'Get the currently authenticated user (id, username, email).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _group: 'auth',
  },

  {
    name: 'clickup_workspace_list',
    description: 'List available workspaces (teams). Returns compact array of {id, name, members}.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _group: 'workspace',
  },
  {
    name: 'clickup_workspace_seats',
    description: 'Show workspace seat usage (used, total, available).',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: [],
    },
    _group: 'workspace',
  },
  {
    name: 'clickup_workspace_plan',
    description: 'Show workspace plan details (name, tier, features).',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: [],
    },
    _group: 'workspace',
  },

  {
    name: 'clickup_space_list',
    description:
      'List spaces in a workspace. Returns compact array of {id, name, private, archived}.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        archived: { type: 'boolean', description: 'Include archived spaces' },
        page: { type: 'integer', description: 'Page number (0-based)' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: [],
    },
    _group: 'space',
  },
  {
    name: 'clickup_space_get',
    description: 'Get a single space by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Space ID' } },
      required: ['id'],
    },
    _group: 'space',
  },
  {
    name: 'clickup_space_create',
    description: 'Create a space in a workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        name: { type: 'string', description: 'Space name' },
        private: { type: 'boolean', description: 'Make the space private' },
      },
      required: ['name'],
    },
    _group: 'space',
  },
  {
    name: 'clickup_space_update',
    description: 'Update a space (e.g. rename).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Space ID' },
        name: { type: 'string', description: 'New space name' },
      },
      required: ['id'],
    },
    _group: 'space',
  },
  {
    name: 'clickup_space_delete',
    description: 'Delete a space.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Space ID' } },
      required: ['id'],
    },
    _group: 'space',
  },

  {
    name: 'clickup_folder_list',
    description: 'List folders in a space. Returns compact array of {id, name, task_count}.',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: { type: 'string', description: 'Space ID' },
        archived: { type: 'boolean', description: 'Include archived folders' },
        page: { type: 'integer', description: 'Page number (0-based)' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: ['space_id'],
    },
    _group: 'folder',
  },
  {
    name: 'clickup_folder_get',
    description: 'Get a single folder by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Folder ID' } },
      required: ['id'],
    },
    _group: 'folder',
  },
  {
    name: 'clickup_folder_create',
    description: 'Create a folder in a space.',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: { type: 'string', description: 'Space ID' },
        name: { type: 'string', description: 'Folder name' },
      },
      required: ['space_id', 'name'],
    },
    _group: 'folder',
  },
  {
    name: 'clickup_folder_update',
    description: 'Update a folder (rename).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Folder ID' },
        name: { type: 'string', description: 'New folder name' },
      },
      required: ['id', 'name'],
    },
    _group: 'folder',
  },
  {
    name: 'clickup_folder_delete',
    description: 'Delete a folder.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Folder ID' } },
      required: ['id'],
    },
    _group: 'folder',
  },

  {
    name: 'clickup_list_list',
    description:
      'List lists in a folder or space. Returns compact array of {id, name, task_count}.',
    inputSchema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Folder ID (provide this OR space_id)' },
        space_id: {
          type: 'string',
          description: 'Space ID for folderless lists (provide this OR folder_id)',
        },
        archived: { type: 'boolean', description: 'Include archived lists' },
        page: { type: 'integer', description: 'Page number (0-based)' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: [],
    },
    _group: 'list',
  },
  {
    name: 'clickup_list_get',
    description: 'Get a single list by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'List ID' } },
      required: ['id'],
    },
    _group: 'list',
  },
  {
    name: 'clickup_list_create',
    description: 'Create a list in a folder or space.',
    inputSchema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Folder ID (provide this OR space_id)' },
        space_id: {
          type: 'string',
          description: 'Space ID for folderless list (provide this OR folder_id)',
        },
        name: { type: 'string', description: 'List name' },
        content: { type: 'string', description: 'List description' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      },
      required: ['name'],
    },
    _group: 'list',
  },
  {
    name: 'clickup_list_update',
    description: 'Update a list (name, content, due date).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'List ID' },
        name: { type: 'string', description: 'New list name' },
        content: { type: 'string', description: 'List description' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      },
      required: ['id'],
    },
    _group: 'list',
  },
  {
    name: 'clickup_list_delete',
    description: 'Delete a list.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'List ID' } },
      required: ['id'],
    },
    _group: 'list',
  },
  {
    name: 'clickup_list_add_task',
    description: 'Add a task to a list.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'List ID' },
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['list_id', 'task_id'],
    },
    _group: 'list',
  },
  {
    name: 'clickup_list_remove_task',
    description: 'Remove a task from a list.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'List ID' },
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['list_id', 'task_id'],
    },
    _group: 'list',
  },

  {
    name: 'clickup_task_list',
    description: `List tasks in a ClickUp list. ${TASK_FIELDS_DESC} Use clickup_task_search for cross-list queries.`,
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'ID of the list to read tasks from' },
        statuses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Status names to filter by',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'User IDs to filter by',
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by' },
        include_closed: { type: 'boolean', description: 'Include closed tasks' },
        order_by: { type: 'string', description: 'Order by field' },
        reverse: { type: 'boolean', description: 'Reverse order' },
        page: { type: 'integer', description: 'Page number (0-based)' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: ['list_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_search',
    description: `Search tasks across a workspace with filters. ${TASK_FIELDS_DESC}`,
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        space_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Space IDs to filter by',
        },
        folder_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Folder IDs to filter by',
        },
        list_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List IDs to filter by',
        },
        statuses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Status names to filter by',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'User IDs to filter by',
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by' },
        page: { type: 'integer', description: 'Page number (0-based)' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: [],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_get',
    description: 'Get a single task by ID. Returns full task object. Supports custom task IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        subtasks: { type: 'boolean', description: 'Include subtasks' },
        custom_task_id: { type: 'boolean', description: 'Treat the ID as a custom task ID' },
        markdown: { type: 'boolean', description: 'Include markdown description' },
      },
      required: ['task_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_create',
    description: 'Create a task in a list. Returns the created task object.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'List ID to create the task in' },
        name: { type: 'string', description: 'Task name' },
        description: { type: 'string', description: 'Task description (markdown)' },
        status: { type: 'string', description: 'Initial status' },
        priority: { type: 'integer', description: 'Priority (1=Urgent, 4=Low)' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Assignee user IDs' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        parent: { type: 'string', description: 'Parent task ID' },
      },
      required: ['list_id', 'name'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_update',
    description:
      'Update a task (name, status, priority, description, assignees, parent). Returns updated task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        name: { type: 'string', description: 'New name' },
        status: { type: 'string', description: 'New status' },
        priority: { type: 'integer', description: 'Priority (1=Urgent, 4=Low)' },
        description: { type: 'string', description: 'New description (markdown)' },
        parent: { type: 'string', description: 'Parent task ID' },
        add_assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Assignee user IDs to add',
        },
        rem_assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Assignee user IDs to remove',
        },
      },
      required: ['task_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_delete',
    description: 'Delete a task.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Task ID or custom task ID' } },
      required: ['task_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_time_in_status',
    description: 'Show time spent in each status for a task.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Task ID or custom task ID' } },
      required: ['task_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_add_tag',
    description: 'Add a tag to a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        tag: { type: 'string', description: 'Tag name' },
      },
      required: ['task_id', 'tag'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_remove_tag',
    description: 'Remove a tag from a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        tag: { type: 'string', description: 'Tag name' },
      },
      required: ['task_id', 'tag'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_add_dep',
    description: 'Add a dependency to a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        depends_on: { type: 'string', description: 'Task that this task depends on' },
        dependency_of: { type: 'string', description: 'Task that depends on this task' },
      },
      required: ['task_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_remove_dep',
    description: 'Remove a dependency from a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        depends_on: { type: 'string', description: 'Task that this task depends on' },
        dependency_of: { type: 'string', description: 'Task that depends on this task' },
      },
      required: ['task_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_link',
    description: 'Link two tasks together.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Source task ID' },
        target_id: { type: 'string', description: 'Target task ID' },
      },
      required: ['task_id', 'target_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_unlink',
    description: 'Unlink two tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Source task ID' },
        target_id: { type: 'string', description: 'Target task ID' },
      },
      required: ['task_id', 'target_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_move',
    description: 'Move a task to a different list.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        list_id: { type: 'string', description: 'Target list ID' },
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: ['task_id', 'list_id'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_set_estimate',
    description: 'Set a time estimate on a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        time: { type: 'integer', description: 'Time estimate in milliseconds' },
        assignee: { type: 'string', description: 'Assignee user ID for per-user estimate' },
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: ['task_id', 'time'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_replace_estimates',
    description: 'Replace all per-user time estimates on a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        estimates: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of {assignee, time} or {user_id, time_estimate} objects',
        },
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: ['task_id', 'estimates'],
    },
    _group: 'task',
  },
  {
    name: 'clickup_task_count',
    description: 'Count tasks in a list, optionally filtered by status.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'List ID' },
        statuses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Status names to filter by',
        },
      },
      required: ['list_id'],
    },
    _group: 'task',
  },

  {
    name: 'clickup_comment_list',
    description:
      'List comments on a task, list, or view. Returns compact array of {id, comment_text, user, date}.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Task ID (provide one of task_id/list_id/view_id)',
        },
        list_id: {
          type: 'string',
          description: 'List ID (provide one of task_id/list_id/view_id)',
        },
        view_id: {
          type: 'string',
          description: 'View ID (provide one of task_id/list_id/view_id)',
        },
        start: { type: 'integer', description: 'Boundary timestamp in Unix ms' },
        start_id: { type: 'string', description: 'Boundary comment ID' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: [],
    },
    _group: 'comment',
  },
  {
    name: 'clickup_comment_create',
    description: 'Create a comment on a task, list, or view. Returns the created comment.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Task ID (provide one of task_id/list_id/view_id)',
        },
        list_id: {
          type: 'string',
          description: 'List ID (provide one of task_id/list_id/view_id)',
        },
        view_id: {
          type: 'string',
          description: 'View ID (provide one of task_id/list_id/view_id)',
        },
        text: { type: 'string', description: 'Comment text' },
        notify_all: { type: 'boolean', description: 'Notify all assignees' },
      },
      required: ['text'],
    },
    _group: 'comment',
  },
  {
    name: 'clickup_comment_update',
    description: 'Update a comment. Returns the updated comment.',
    inputSchema: {
      type: 'object',
      properties: {
        comment_id: { type: 'string', description: 'Comment ID' },
        text: { type: 'string', description: 'New comment text' },
        resolved: { type: 'boolean', description: 'Mark the comment as resolved' },
      },
      required: ['comment_id', 'text'],
    },
    _group: 'comment',
  },
  {
    name: 'clickup_comment_delete',
    description: 'Delete a comment.',
    inputSchema: {
      type: 'object',
      properties: { comment_id: { type: 'string', description: 'Comment ID' } },
      required: ['comment_id'],
    },
    _group: 'comment',
  },
  {
    name: 'clickup_comment_replies',
    description:
      'List replies to a comment. Returns compact array of {id, comment_text, user, date}.',
    inputSchema: {
      type: 'object',
      properties: {
        comment_id: { type: 'string', description: 'Comment ID' },
        start: { type: 'integer', description: 'Boundary timestamp in Unix ms' },
        start_id: { type: 'string', description: 'Boundary comment ID' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: ['comment_id'],
    },
    _group: 'comment',
  },
  {
    name: 'clickup_comment_reply',
    description: 'Reply to a comment. Returns the created reply.',
    inputSchema: {
      type: 'object',
      properties: {
        comment_id: { type: 'string', description: 'Comment ID' },
        text: { type: 'string', description: 'Reply text' },
      },
      required: ['comment_id', 'text'],
    },
    _group: 'comment',
  },

  {
    name: 'clickup_tag_list',
    description: 'List tags in a space. Returns compact array of {name, tag_fg, tag_bg}.',
    inputSchema: {
      type: 'object',
      properties: { space_id: { type: 'string', description: 'Space ID' } },
      required: ['space_id'],
    },
    _group: 'tag',
  },
  {
    name: 'clickup_tag_create',
    description: 'Create a tag in a space.',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: { type: 'string', description: 'Space ID' },
        name: { type: 'string', description: 'Tag name' },
        fg_color: { type: 'string', description: 'Foreground color (hex)' },
        bg_color: { type: 'string', description: 'Background color (hex)' },
      },
      required: ['space_id', 'name'],
    },
    _group: 'tag',
  },
  {
    name: 'clickup_tag_update',
    description: 'Update a tag in a space.',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: { type: 'string', description: 'Space ID' },
        tag: { type: 'string', description: 'Current tag name' },
        name: { type: 'string', description: 'New tag name' },
        fg_color: { type: 'string', description: 'Foreground color (hex)' },
        bg_color: { type: 'string', description: 'Background color (hex)' },
      },
      required: ['space_id', 'tag'],
    },
    _group: 'tag',
  },
  {
    name: 'clickup_tag_delete',
    description: 'Delete a tag in a space.',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: { type: 'string', description: 'Space ID' },
        tag: { type: 'string', description: 'Tag name' },
      },
      required: ['space_id', 'tag'],
    },
    _group: 'tag',
  },

  {
    name: 'clickup_field_list',
    description:
      'List custom fields at list, folder, space, or workspace level. Returns compact array of {id, name, type, required}.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'List ID (provide one scope)' },
        folder_id: { type: 'string', description: 'Folder ID (provide one scope)' },
        space_id: { type: 'string', description: 'Space ID (provide one scope)' },
        workspace_level: {
          type: 'boolean',
          description: 'Workspace-level fields (provide one scope)',
        },
        team_id: { type: 'string', description: 'Workspace ID for workspace-level fields' },
      },
      required: [],
    },
    _group: 'field',
  },
  {
    name: 'clickup_field_set',
    description: 'Set a custom field value on a task.',
    inputSchema: {
      type: 'object',
      properties: {
        field_id: { type: 'string', description: 'Custom field ID' },
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
        value: { type: 'string', description: 'Field value' },
      },
      required: ['field_id', 'task_id', 'value'],
    },
    _group: 'field',
  },
  {
    name: 'clickup_field_unset',
    description: 'Remove a custom field value from a task.',
    inputSchema: {
      type: 'object',
      properties: {
        field_id: { type: 'string', description: 'Custom field ID' },
        task_id: { type: 'string', description: 'Task ID or custom task ID' },
      },
      required: ['field_id', 'task_id'],
    },
    _group: 'field',
  },

  {
    name: 'clickup_time_list',
    description:
      'List time entries (default: last 30 days). Returns compact array of {id, user, task, start, duration, billable, description}.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        task_id: { type: 'string', description: 'Filter by task ID' },
      },
      required: [],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_get',
    description: 'Get a single time entry by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        entry_id: { type: 'string', description: 'Time entry ID' },
      },
      required: ['entry_id'],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_current',
    description: 'Show the currently running time entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: [],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_create',
    description: 'Create a time entry. Returns the created entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        duration: { type: 'integer', description: 'Duration in milliseconds' },
        task_id: { type: 'string', description: 'Task ID' },
        description: { type: 'string', description: 'Description' },
        billable: { type: 'boolean', description: 'Billable entry' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      },
      required: ['start', 'duration'],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_update',
    description: 'Update a time entry. Returns the updated entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        entry_id: { type: 'string', description: 'Time entry ID' },
        start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        duration: { type: 'integer', description: 'Duration in milliseconds' },
        task_id: { type: 'string', description: 'Task ID' },
        description: { type: 'string', description: 'Description' },
        billable: { type: 'boolean', description: 'Billable entry' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      },
      required: ['entry_id'],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_delete',
    description: 'Delete a time entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        entry_id: { type: 'string', description: 'Time entry ID' },
      },
      required: ['entry_id'],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_start',
    description: 'Start a timer. Returns the running time entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        task_id: { type: 'string', description: 'Task ID' },
        description: { type: 'string', description: 'Description' },
        billable: { type: 'boolean', description: 'Billable timer' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      },
      required: [],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_stop',
    description: 'Stop the running timer. Returns the stopped time entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: [],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_tags',
    description: 'List time tracking tags. Returns compact array of {name, tag_fg, tag_bg}.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: [],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_add_tags',
    description: 'Add a tag to a time entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        entry_id: { type: 'string', description: 'Time entry ID' },
        tag: { type: 'string', description: 'Tag name' },
        tag_bg: { type: 'string', description: 'Tag background color' },
        tag_fg: { type: 'string', description: 'Tag foreground color' },
      },
      required: ['entry_id', 'tag'],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_remove_tags',
    description: 'Remove a tag from a time entry.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        entry_id: { type: 'string', description: 'Time entry ID' },
        tag: { type: 'string', description: 'Tag name' },
      },
      required: ['entry_id', 'tag'],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_rename_tag',
    description: 'Rename a time tracking tag.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        name: { type: 'string', description: 'Current tag name' },
        new_name: { type: 'string', description: 'New tag name' },
      },
      required: ['name', 'new_name'],
    },
    _group: 'time',
  },
  {
    name: 'clickup_time_history',
    description: 'Show history of a time entry. Returns compact array of {id, user, duration, at}.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        entry_id: { type: 'string', description: 'Time entry ID' },
      },
      required: ['entry_id'],
    },
    _group: 'time',
  },

  {
    name: 'clickup_view_list',
    description:
      'List views at workspace, space, folder, or list level. Returns compact array of {id, name, type}.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_level: {
          type: 'boolean',
          description: 'List workspace-level views (provide one scope)',
        },
        space_id: { type: 'string', description: 'Space ID (provide one scope)' },
        folder_id: { type: 'string', description: 'Folder ID (provide one scope)' },
        list_id: { type: 'string', description: 'List ID (provide one scope)' },
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: [],
    },
    _group: 'view',
  },
  {
    name: 'clickup_view_get',
    description: 'Get a single view by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'View ID' } },
      required: ['id'],
    },
    _group: 'view',
  },
  {
    name: 'clickup_view_create',
    description: 'Create a view. Returns the created view.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'View name' },
        type: { type: 'string', description: 'View type' },
        workspace_level: {
          type: 'boolean',
          description: 'Create at workspace level (provide one scope)',
        },
        space_id: { type: 'string', description: 'Space ID (provide one scope)' },
        folder_id: { type: 'string', description: 'Folder ID (provide one scope)' },
        list_id: { type: 'string', description: 'List ID (provide one scope)' },
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
      },
      required: ['name', 'type'],
    },
    _group: 'view',
  },
  {
    name: 'clickup_view_update',
    description: 'Update a view (e.g. rename). Returns the updated view.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'View ID' },
        name: { type: 'string', description: 'New view name' },
      },
      required: ['id'],
    },
    _group: 'view',
  },
  {
    name: 'clickup_view_delete',
    description: 'Delete a view.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'View ID' } },
      required: ['id'],
    },
    _group: 'view',
  },
  {
    name: 'clickup_view_tasks',
    description: `List tasks in a view. ${TASK_FIELDS_DESC}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'View ID' },
        page: { type: 'integer', description: 'Page number (0-based)' },
        limit: { type: 'integer', description: 'Max results' },
        all: { type: 'boolean', description: 'Fetch all pages' },
      },
      required: ['id'],
    },
    _group: 'view',
  },

  {
    name: 'clickup_member_list',
    description:
      'List members of a task or list. Returns compact array of {id, username, email, color}.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID (provide one of task_id/list_id)' },
        list_id: { type: 'string', description: 'List ID (provide one of task_id/list_id)' },
      },
      required: [],
    },
    _group: 'member',
  },

  {
    name: 'clickup_user_invite',
    description: 'Invite a user to the workspace (Enterprise). Returns the invited user.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        email: { type: 'string', description: 'Email to invite' },
      },
      required: ['email'],
    },
    _group: 'user',
  },
  {
    name: 'clickup_user_get',
    description: 'Get a user (Enterprise).',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        user_id: { type: 'string', description: 'User ID' },
      },
      required: ['user_id'],
    },
    _group: 'user',
  },
  {
    name: 'clickup_user_update',
    description: 'Update a user (Enterprise). Returns the updated user.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        user_id: { type: 'string', description: 'User ID' },
        name: { type: 'string', description: 'New name' },
        role: { type: 'string', description: 'New role' },
      },
      required: ['user_id'],
    },
    _group: 'user',
  },
  {
    name: 'clickup_user_remove',
    description: 'Remove a user from the workspace (Enterprise).',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: {
          type: 'string',
          description: 'Workspace ID (uses configured workspace if omitted)',
        },
        user_id: { type: 'string', description: 'User ID' },
      },
      required: ['user_id'],
    },
    _group: 'user',
  },
];
