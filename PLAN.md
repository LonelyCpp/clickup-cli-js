# clickup-cli-js — Build Plan

> Working scratchpad. Tracks the plan and decisions for a TypeScript port of
> [nicholasbester/clickup-cli](https://github.com/nicholasbester/clickup-cli)
> (a Rust CLI for the ClickUp API, optimized for AI agents).

## Goal

A pure-JS/TS reimplementation. No Rust binary, no postinstall download —
`npm i -g clickup-cli-js` and it runs on Node 18+. The differentiator vs the
reference's npm package (which just fetches a prebuilt Rust binary): a single
installable JS package with no native toolchain, plus genuinely better
token-efficient output for AI agents.

## Confirmed decisions

| Decision | Value |
|---|---|
| Package name | `clickup-cli-js` |
| Language | TypeScript (ESM) |
| Scope | Core commands + MCP server (defer enterprise/chat/doc long tail) |
| Config format | JSON (not TOML — not interchangeable with the Rust CLI's config) |
| Destructive confirmations | Required. In non-TTY / `CI` contexts, destructive commands **refuse** unless `--yes` is explicitly passed (protects agents from accidental deletes). |
| `--open` / `--copy` | Skipped for now (agent-path focus); trivial to add later. |
| API ground truth | Rust source + ClickUp `developer.clickup.com/llms.txt` reference |

## Tech stack (all popular, all latest, all ESM-native)

| Concern | Library | UX role |
|---|---|---|
| CLI framework | `commander` 15 | nested subcommands + global flags |
| Build | `tsup` 8 | TS→ESM + dts |
| Colors | `chalk` 5 | red errors, green success, dim hints, cyan breadcrumbs |
| Spinners | `ora` 9 | progress during every network call |
| Prompts | `@inquirer/prompts` 8 | interactive `setup`, workspace picker, destructive-confirm |
| Tables | `cli-table3` 0.6 | human-friendly tables (`--output table`) |
| Boxes | `boxen` 8 | `status` summary, post-setup success card |
| Symbols | `figures` 6 | ✓ ✗ ⚠ → instead of ASCII |
| Update checks | `update-notifier` 7 | nudge on newer npm release |
| Config paths | `env-paths` 3 | platform-correct `~/.config` / `~/Library/Application Support` |
| MCP | `@modelcontextprotocol/sdk` 1.29 | stdio JSON-RPC server |
| Test | `vitest` 4 + `nock` 14 | TS-native tests + `fetch` mocking |
| Lint/format | `@biomejs/biome` 2.5 | one fast tool, both roles |

All ESM-only libs are fine: package is `"type": "module"`, target Node 18+,
tsup emits ESM.

## Token-efficiency design (the differentiator)

All in `output.ts` + command layer. All preserve the agent contract
(self-describing + shape-stable). No regression risk vs the Rust baseline.

### Tier A — strictly better than the Rust baseline

1. **Type-preserving compact JSON** — `priority:3`, `private:true`,
   `archived:false` as native JSON types instead of quoted strings. Applies
   to MCP responses + CLI `json-compact`. Beats Rust's `compact_items` which
   stringifies every value.

2. **`--max-chars N`** (default 60, `0`=off) — truncate long text values
   (name, description, comment_text) to N chars + `…`. Caps the worst-case
   unbounded-text leak. Same columns, shorter values. Agent passes
   `--max-chars 0` or `--output json` when it needs full text.

3. **`--output compact`** — pipe-delimited rows with header, no alignment
   padding. `id|name|status|priority|assignees|due_date` then
   `abc123|Fix bug|Open|3|alice, bob|2026-03-17`. ~20-35% smaller than
   aligned tables on ragged data. `table` stays for humans, `compact` for
   agents.

### Tier B — additive aggregate capabilities (Rust CLI lacks these)

4. **`--summary`** on list commands →
   `12 tasks: 4 Open, 6 In Progress, 2 Done | overdue: 3 | assignees: alice(5), bob(4), unassigned(3)`
   — ~20 tokens instead of a 150-token table. Perfect for "how's this list
   doing?" agent queries.

5. **`count` action** → `task count --list X --status "in progress"`
   prints just `4`. One token. Agent gets a number to branch on without
   parsing rows.

6. **`--max-tokens N`** soft cap → agent declares a token budget; the CLI
   returns as many full rows as fit + a `{truncated, shown, total, next_page}`
   footer. Prevents context blowout with a recovery path. More honest than a
   hard `--limit` which silently drops data.

### Deferred (Tier C — revisit later)

- Always-envelope MCP responses (uniform `{items, pagination}` shape)
- `--drop-empty` sparse columns (omit entirely-empty columns)

## Project structure (mirrors the Rust `src/` layout)

```
clickup-cli-js/
  package.json  tsconfig.json  tsup.config.ts  biome.json  README.md
  bin/
    clickup-cli.js   (shebang → dist/main.js)
    clkup.js         (alias → same)
  src/
    main.ts            # entry: update-notifier, build Commander tree, dispatch
    cli.ts             # global flags + CliContext (mirrors lib.rs Cli struct)
    context.ts         # createContext(): { client, output, ui, resolveWorkspace }
    ui.ts              # ora/chalk/boxen/figures gate (TTY + NO_COLOR + CI aware)
    client.ts          # ClickUpClient — fetch + retry + rate-limit (← client.rs)
    config.ts          # JSON config via env-paths + .clickup.json walk + priority chain
    output.ts          # OutputConfig: table/compact/json/json-compact/csv/quiet + flatten + Tier A/B
    error.ts           # CliError + exit codes 0-5 + hints (← error.rs)
    git.ts             # branch task-ID detection (← git.rs)
    input.ts           # @path / @- / @@ text-arg resolution (← input.rs)
    pagination.ts      # walkPage / walkCursor / walkStartId (← commands/pagination.rs)
    commands/
      index.ts         # register(program)
      setup.ts  auth.ts  workspace.ts  space.ts  folder.ts  list.ts
      task.ts  comment.ts  tag.ts  field.ts  time.ts  view.ts  member.ts  user.ts
      status.ts
    mcp/
      server.ts  tools.ts  dispatch.ts  filter.ts
  tests/
    client.test.ts  config.test.ts  output.test.ts  error.test.ts
    git.test.ts  input.test.ts  pagination.test.ts  ui.test.ts
    cli.test.ts  mcp-filter.test.ts  task.test.ts
```

## Command framework pattern

Decouple logic from Commander so it's reusable by MCP. Each
`commands/<resource>.ts` exports:

- `register(program: Command)` — declares subcommands + flags
- Pure handler functions `async function listTasks(opts, ctx)` that take a
  typed options object + a `Ctx` (`{ client, output, ui, cli, resolveWorkspace }`)
  and return `Promise<void>` (or a result for MCP)

`main.ts` builds the Commander tree, parses globals, constructs `Ctx`, and
dispatches. **Handlers are the single source of truth** — the MCP layer calls
them too, so logic isn't duplicated.

## Core module design

### `client.ts`
Wraps `fetch`. `new ClickUpClient(token, timeoutSecs)`. Methods
`get/post/put/delete/patch/deleteWithBody/uploadFile`. Base URL from
`CLICKUP_API_URL` (default `https://api.clickup.com/api`). Retry: 429 → wait
`X-RateLimit-Reset` seconds, retry once; 5xx → exponential backoff 1/2/4s,
max 3. Map status → `CliError` (401 Auth, 403 Forbidden, 404 NotFound, 429
RateLimited, 5xx ServerError). Parse `err`/`message` from error bodies.
Truncate error body to 200 chars (char-safe, not byte).

### `config.ts`
JSON. `Config.configPath()` → env-paths `clickup-cli` config dir + `config.json`.
`findProjectConfig()` walks up from CWD for `.clickup.json`. Resolution
priority: `--token` flag → `CLICKUP_TOKEN` env → `.clickup.json` → global. Same
for workspace. Shape:
`{ auth: { token }, defaults: { workspace_id, output }, git: { enabled, verbose } }`.

### `output.ts`
`OutputConfig.fromCli(mode, fields, noHeader, quiet, maxChars)`.
`printItems(items, defaultFields, idField)`:
- quiet → IDs only
- `json` → full
- `json-compact` → filtered fields, **type-preserving** (Tier A-1)
- `compact` → pipe-delimited rows, header + no padding (Tier A-3)
- `csv` → comma-delimited
- `table` → `cli-table3` aligned (default, humans)

`flattenValue()` ports the nested-object flattening (status.status,
priority.priority, assignees → `username, username`, Unix-ms strings →
`YYYY-MM-DD`, null → `-`). Applies `--max-chars` truncation to text values
(Tier A-2).

`summary(items)` → the `--summary` aggregate string (Tier B-4).
`count(items)` → integer count (Tier B-5).
`fitToTokenBudget(items, maxTokens)` → truncates rows + emits
`{truncated, shown, total, next_page}` footer (Tier B-6).

### `error.ts`
`CliError` class with `exitCode()` (1/2/3/4/5), `print(outputMode)` (json vs
plain + hint). Port `hint()` messages verbatim from `error.rs`.

Exit codes:
- 0: success
- 1: client error (400, bad input)
- 2: auth/permission error (401, 403)
- 3: not found (404)
- 4: rate limited (429)
- 5: server error (5xx)

### `git.ts`
Port the two regexes (`\bCU-([0-9a-z]+)` and `\b([A-Z][A-Z0-9]+-\d+)\b`),
prefix stripping (`feat/`, `fix/`, …), excluded custom prefixes (`FEATURE`,
`WIP`, …). `resolveTask(cli, explicit, allowBranch)` → explicit →
`CLICKUP_TASK_ID` env → branch. `requireTask()` errors helpfully.
Destructive commands pass `allowBranch=false`. The `git.rs` unit tests port
directly — pure regex tests, high value, low cost.

### `input.ts`
`resolveValueArg(value)`: `@path` → read file; `@-` → stdin; `@@text` →
literal `@text`; else verbatim. Strip one trailing newline. Wire as a
Commander coercion for every free-form text flag (`--description`, `--text`,
`--content`, …).

### `pagination.ts`
`walkPage`, `walkCursor`, `walkStartId` ported as async functions returning
`any[]`. Respect `--all`, `--limit` (applied after walking), `--page`,
`--cursor`, `--start`/`--start-id`. Hard cap 100 pages. `extractArray(resp,
keys)` helper.

### `ui.ts`
Single gate: spinners/colors/boxes off when piped, `CI=true`, or `NO_COLOR`
set. JSON output never gets decoration. Exposes `spinner`, `success`,
`error`, `hint`, `breadcrumb`, `box`.

## Command groups to implement (with subcommands)

- **setup**: `[--token T]` (interactive + non-interactive; inquirer workspace picker)
- **auth**: `whoami`, `check`
- **workspace**: `list`, `seats`, `plan`
- **space**: `list [--archived]`, `get`, `create --name [--private]`, `update`, `delete`
- **folder**: `list --space`, `get`, `create --space --name`, `update`, `delete`
- **list**: `list --folder|--space`, `get`, `create`, `update`, `delete`, `add-task`, `remove-task`
- **task**: `list`, `search`, `get [--subtasks] [--custom-task-id] [--markdown]`, `create`, `update`, `delete`, `time-in-status`, `add-tag`, `remove-tag`, `add-dep`, `remove-dep`, `link`, `unlink`, `move`, `set-estimate`, `replace-estimates` (largest group — port `task.rs` closely)
- **comment**: `list`, `create`, `update`, `delete`, `replies`, `reply`
- **tag**: `list`, `create`, `update`, `delete` (note the `tag_fg`/`tag_bg` vs `fg_color`/`bg_color` API quirk)
- **field**: `list`, `create`, `set`, `unset`, `ensure`
- **time**: `list`, `get`, `current`, `create`, `update`, `delete`, `start`, `stop`, `tags`, `add-tags`, `remove-tags`, `rename-tag`, `history`
- **view**: `list`, `get`, `create`, `update`, `delete`, `tasks`
- **member**: `list`; **user**: `invite`, `get`, `update`, `remove`
- **status**: show config + masked token + workspace (boxen card)

### Deferred command groups
`chat`, `doc` (v3 comms); `webhook`, `template`; `guest`, `group`, `role`,
`shared`, `audit-log`, `acl` (Enterprise); `checklist`, `task-type`,
`attachment`, `goal`; `completions`, `agent-config` (utilities).

## MCP server design

`mcp/server.ts` starts a stdio JSON-RPC server via
`@modelcontextprotocol/sdk`. For each implemented CLI action,
`mcp/tools.ts` declares a tool with an input schema (derived from the
command's flags) and a handler that calls the **same** core handler the CLI
uses, then formats the result as type-preserving compact JSON (Tier A-1).
`mcp/filter.ts` implements `--profile {all|read|safe}`, `--read-only`,
`--groups`, `--exclude-groups`, `--tools`, `--exclude-tools` (and
`CLICKUP_MCP_*` env equivalents) — filtered tools are hidden from
`tools/list` and rejected at `tools/call`. Subcommand `mcp serve` launches it.

## Fidelity notes (hard-won API knowledge to preserve)

- `team_id` = workspace_id in v2
- All timestamps are Unix **milliseconds**; priority 1=Urgent/2=High/3=Normal/4=Low; dates `YYYY-MM-DD`
- Custom task IDs need `custom_task_ids=true&team_id=<ws>` auto-injected
- Destructive/ambiguous commands (`task delete`, `link`, `unlink`, `guest share/unshare`) never auto-detect from branch
- `task get --markdown` → `include_markdown_description=true`; surface `markdown_description` column
- Bulk `time-in-status` uses repeated `task_ids=` query params (not comma-joined)
- `replace-estimates` body is an array of `{assignee, time}` (not wrapped)
- Time entries: **negative duration = running timer** (critical for `time current`)
- Time estimates by user / replace: **Business Plan+ only**, max 10 estimates/request, `assignee: "unassigned"` supported
- Guests, audit-log, ACL, user invite/get/edit/remove: **Enterprise only**
- Tag create uses `tag_fg`/`tag_bg`; tag update uses `fg_color`/`bg_color` (API inconsistency)
- v3 endpoints (chat, docs, audit logs, ACLs, attachments) use cursor pagination
- `Get Tasks`: capped at 100/page; `include_timl` for tasks-in-multiple-lists; `custom_fields` only includes fields applicable to the task's `custom_item_id`
- Task comments: reverse chronological, 25/page, advance with `start` + `start_id` together (from last comment)

## Phased delivery

| Phase | Deliverable | Done when |
|---|---|---|
| **0 — Scaffold + core infra** | package/tsconfig/tsup/biome, bin entries, `client/config/output/error/git/input/pagination/context/ui`, `status` cmd | `vitest` unit tests green; `clickup-cli-js status` shows boxed config; `--help` works |
| **1 — Core commands** | setup (inquirer + boxen), auth, workspace, space, folder, list, task | ora spinners on all calls; table/compact/json/json-compact/csv/quiet correct; git-branch detect works; `--summary`/`count`/`--max-tokens` on task list; smoke tests pass |
| **2 — Collaboration + tracking** | comment, tag, field, time, view, member, user | per-group tests; destructive-confirm prompts; `--max-chars`/`--summary`/`count` where applicable |
| **3 — MCP server** | `mcp serve` with tools for all above + `--profile/--read-only/--groups/--tools` filtering | `mcp-filter` tests; connects from a sample MCP client |
| **4 — Polish + publish** | README, `clkup` alias, update-notifier wired, exit codes E2E | `npm pack` + clean-room `npm i -g clickup-cli-js` test |

## Testing strategy

Port the Rust test files directly (they're well-structured):

- **Pure/unit** (port 1:1): `git.test.ts` (regex extraction — ~20 cases),
  `input.test.ts`, `output.test.ts` (flatten + timestamp + Tier A/B
  token-efficiency), `error.test.ts` (exit codes), `pagination.test.ts`
  (`extractArray`)
- **HTTP-mocked** (`nock`): `client.test.ts` (retry, rate-limit, error
  mapping), `config.test.ts`
- **Smoke**: `cli.test.ts` spawns the built bin, asserts `--help`, `task get`,
  output modes
- **MCP**: `mcp-filter.test.ts`
