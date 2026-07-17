# clickup-cli-js

A CLI for the [ClickUp API](https://developer.clickup.com/reference), optimized for AI agents. TypeScript port of [clickup-cli](https://github.com/nicholasbester/clickup-cli) with improved token-efficient output.

## Why?

ClickUp's API responses are massive — easily 12,000+ tokens for 5 tasks. This CLI flattens nested objects, selects essential fields, and renders compact output. ~98% token reduction vs raw JSON.

**Improvements over the original:**
- **Type-preserving compact JSON** — numbers stay numbers (`priority: 3`), booleans stay booleans (`active: true`), not stringified
- **`--max-chars`** — truncate long text values to cap token cost (default 60, `0`=off)
- **`--output compact`** — pipe-delimited rows, no alignment padding (~20-35% smaller than tables)
- **`--summary`** — aggregate summary instead of rows (`12 tasks: 4 Open, 6 In Progress | overdue: 3`)
- **`count`** — just the number (`task count --list X --status "in progress"` → `4`)
- **`--max-tokens`** — soft token budget cap with truncation footer

## Install

```bash
npm install -g clickup-cli-js
```

Requires Node.js 18+.

## Quick Start

```bash
# Configure your API token (interactive)
clickup-cli-js setup

# Or non-interactive
clickup-cli-js setup --token pk_your_token_here

# Verify
clickup-cli-js auth whoami

# Show current config
clickup-cli-js status
```

## Usage

```bash
# Hierarchy navigation
clickup-cli-js workspace list
clickup-cli-js space list
clickup-cli-js folder list --space 12345
clickup-cli-js list list --folder 67890

# Task management
clickup-cli-js task list --list 12345
clickup-cli-js task create --list 12345 --name "My Task" --priority 3
clickup-cli-js task get abc123
clickup-cli-js task update abc123 --status "in progress"
clickup-cli-js task search --status "in progress" --assignee 44106202

# Token-efficient modes
clickup-cli-js task list --list 12345 --output compact
clickup-cli-js task list --list 12345 --output json-compact
clickup-cli-js task list --list 12345 --summary
clickup-cli-js task count --list 12345 --status "in progress"
clickup-cli-js task list --list 12345 --max-tokens 200

# Auto-detect task ID from git branch
clickup-cli-js task get          # resolves abc123 from feat/CU-abc123-foo
clickup-cli-js task update --status "in progress"

# Comments and collaboration
clickup-cli-js comment list --task abc123
clickup-cli-js comment create --task abc123 --text "Looking good!"
clickup-cli-js tag list --space 12345
clickup-cli-js field list --list 12345

# Time tracking
clickup-cli-js time start --task abc123 --description "Working on feature"
clickup-cli-js time stop
clickup-cli-js time list --start-date 2026-03-01 --end-date 2026-03-31

# Views
clickup-cli-js view list --space 12345
clickup-cli-js view tasks VIEW_ID
```

## Output Modes

| Flag | Description |
|------|-------------|
| *(default)* | Aligned table with essential fields |
| `--output compact` | Pipe-delimited rows, no padding (agent-friendly) |
| `--output json` | Full API response |
| `--output json-compact` | Filtered fields as type-preserving JSON |
| `--output csv` | CSV format |
| `-q` / `--quiet` | IDs only, one per line |

## Token-Efficiency Features

### Type-preserving compact JSON (`json-compact` + MCP)

Numbers and booleans stay native JSON types, not quoted strings:

```json
[{"id": "abc", "priority": 3, "active": true, "name": "Fix bug"}]
```

vs the original which stringified everything:

```json
[{"id": "abc", "priority": "3", "active": "true", "name": "Fix bug"}]
```

### `--max-chars N` (default 60)

Truncates long text values with `…`:

```bash
clickup-cli-js task list --list 123 --max-chars 30   # truncate to 30 chars
clickup-cli-js task list --list 123 --max-chars 0    # no truncation
```

### `--output compact`

Pipe-delimited rows without alignment padding:

```
id|name|status|priority|assignees|due_date
abc123|Fix bug|Open|3|alice, bob|2026-03-17
```

### `--summary`

Aggregate summary instead of rows:

```bash
clickup-cli-js task list --list 123 --summary
# 12 tasks: 4 Open, 6 In Progress, 2 Done | overdue: 3 | assignees: alice(5), bob(4), unassigned(3)
```

### `count`

Just the number:

```bash
clickup-cli-js task count --list 123 --status "in progress"
# 4
```

### `--max-tokens N`

Soft token budget — returns rows that fit + a truncation footer:

```bash
clickup-cli-js task list --list 123 --max-tokens 200
# ...rows...
# {"truncated":true,"shown":15,"total":87}
```

## Command Groups

| Group | Commands |
|-------|----------|
| `setup` | Configure token and workspace |
| `auth` | whoami, check |
| `workspace` | list, seats, plan |
| `space` | list, get, create, update, delete |
| `folder` | list, get, create, update, delete |
| `list` | list, get, create, update, delete, add-task, remove-task |
| `task` | list, search, get, create, update, delete, time-in-status, add-tag, remove-tag, add-dep, remove-dep, link, unlink, move, set-estimate, replace-estimates, count |
| `comment` | list, create, update, delete, replies, reply |
| `tag` | list, create, update, delete |
| `field` | list, set, unset |
| `time` | list, get, current, create, update, delete, start, stop, tags, add-tags, remove-tags, rename-tag, history |
| `view` | list, get, create, update, delete, tasks |
| `member` | list |
| `user` | invite, get, update, remove (Enterprise) |
| `status` | Show current config |
| `mcp` | serve — MCP server for LLM tool integration |

## Global Flags

| Flag | Description |
|------|-------------|
| `--token TOKEN` | Override config file token |
| `--workspace ID` | Override default workspace |
| `--output MODE` | table, compact, json, json-compact, csv |
| `--fields LIST` | Comma-separated field names |
| `--no-header` | Omit table header row |
| `--all` | Fetch all pages |
| `--limit N` | Cap total results |
| `--page N` | Manual page (v2 page-based) |
| `--cursor X` | Manual cursor (v3 cursor-based) |
| `--start MS` + `--start-id ID` | Boundary pair (v2 comment endpoints) |
| `-q` / `--quiet` | IDs only |
| `--timeout SECS` | HTTP timeout (default 30) |
| `--max-chars N` | Max chars per text value (default 60, 0=off) |
| `--max-tokens N` | Soft token budget cap |

## Auto-detect Task ID from Git Branch

When a task-scoped command runs without an explicit ID, the CLI resolves the ID from the current git branch:

- `feat/CU-abc123-foo` → `abc123`
- `PROJ-42-add-login` → `PROJ-42` (custom task ID, auto-injects `custom_task_ids=true&team_id=<ws>`)

Resolution order: explicit arg → `CLICKUP_TASK_ID` env var → git branch.

Destructive commands (`task delete`, `task link`, `task unlink`) never auto-detect — pass the ID explicitly.

Disable with `CLICKUP_GIT_DETECT=0` env var.

## Destructive Confirmations

Delete operations (`task delete`, `space delete`, `folder delete`, `list delete`, `comment delete`, `tag delete`, `time delete`, `view delete`, `user remove`) require confirmation:

- **Interactive (TTY)**: prompts with `@inquirer/prompts` confirm
- **Non-interactive (CI/non-TTY)**: refuses unless `--yes` is passed

```bash
clickup-cli-js task delete abc123 --yes   # skip confirmation
```

## MCP Server

The CLI includes an MCP (Model Context Protocol) server for LLM tool integration:

```bash
clickup-cli-js mcp serve
```

Exposes 60 tools covering all implemented ClickUp API endpoints. Responses use type-preserving compact JSON for token efficiency.

Add to your MCP client config (e.g., `.mcp.json`):

```json
{
  "mcpServers": {
    "clickup": {
      "command": "clickup-cli-js",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Limiting MCP Tools

```bash
clickup-cli-js mcp serve --read-only
clickup-cli-js mcp serve --groups task,comment,time
clickup-cli-js mcp serve --profile safe
clickup-cli-js mcp serve --exclude-tools clickup_task_delete
```

Or via environment variables: `CLICKUP_MCP_PROFILE`, `CLICKUP_MCP_READ_ONLY`, `CLICKUP_MCP_GROUPS`, `CLICKUP_MCP_EXCLUDE_GROUPS`, `CLICKUP_MCP_TOOLS`, `CLICKUP_MCP_EXCLUDE_TOOLS`.

## Configuration

### Config Files

| Level | File |
|-------|------|
| **Project** | `.clickup.json` (current directory, walks up) |
| **Global** | `~/.config/clickup-cli/config.json` (Linux) or `~/Library/Preferences/clickup-cli/config.json` (macOS) |

```json
{
  "auth": { "token": "pk_..." },
  "defaults": { "workspace_id": "12345" },
  "git": { "enabled": true, "verbose": true }
}
```

### Token Resolution (highest priority wins)

1. `--token` CLI flag
2. `CLICKUP_TOKEN` environment variable
3. `.clickup.json` (project-level)
4. Global config

### Workspace Resolution

1. `--workspace` CLI flag
2. `CLICKUP_WORKSPACE` environment variable
3. `.clickup.json` (project-level)
4. Global config

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Client error (bad input) |
| 2 | Auth/permission error (401, 403) |
| 3 | Not found (404) |
| 4 | Rate limited (429) |
| 5 | Server error (5xx) |

## Free-form Text Flags

Flags like `--description`, `--text`, `--content` accept:

- `@path` — read value from a file
- `@-` — read value from stdin
- `@@text` — literal text starting with `@`
- anything else — used verbatim

## Attribution

This project is a TypeScript port of [clickup-cli](https://github.com/nicholasbester/clickup-cli) by [Nicholas Bester](https://github.com/nicholasbester), a Rust CLI for the ClickUp API. The command structure, API endpoint mappings, git-branch task-ID detection, pagination strategies, and token-efficient output philosophy are derived from the original project, which is licensed under Apache-2.0.

## License

Apache-2.0
