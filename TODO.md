# clickup-cli-js — Task List

> Working scratchpad. Tracks implementation progress against PLAN.md.
> Update status as work proceeds. One `in_progress` item at a time.

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Phase 0 — Scaffold + core infra

- [x] **0.1** Initialize project: `package.json` (name `clickup-cli-js`, type module, bin entries `clickup-cli` + `clkup`), `tsconfig.json`, `tsup.config.ts`, `biome.json`
- [x] **0.2** Install deps: commander, chalk, ora, @inquirer/prompts, cli-table3, boxen, figures, update-notifier, env-paths, @modelcontextprotocol/sdk; dev: tsup, typescript, vitest, nock, @biomejs/biome
- [x] **0.3** `bin/clickup-cli.js` + `bin/clkup.js` shebang launchers → `dist/main.js`
- [x] **0.4** `src/error.ts` — `CliError` class, exit codes 0-5, `print(outputMode)` + hints (port `error.rs`)
- [x] **0.5** `src/config.ts` — JSON config via `env-paths`, `.clickup.json` walk, priority chain (`--token` > env > project > global)
- [x] **0.6** `src/client.ts` — `ClickUpClient` with `fetch`, retry (429 + 5xx backoff), rate-limit headers, error mapping, `uploadFile` (port `client.rs`)
- [x] **0.7** `src/output.ts` — `OutputConfig` with modes `table`/`compact`/`json`/`json-compact`/`csv`/`quiet`, `flattenValue`, type-preserving compact JSON (Tier A-1), `--max-chars` (Tier A-2), `--output compact` (Tier A-3), `summary()` (Tier B-4), `count()` (Tier B-5), `fitToTokenBudget()` (Tier B-6)
- [x] **0.8** `src/input.ts` — `resolveValueArg` (`@path`/`@-`/`@@text`) (port `input.rs`)
- [x] **0.9** `src/git.ts` — branch task-ID detection, two regexes, prefix stripping, excluded prefixes, `resolveTask`/`requireTask` (port `git.rs`)
- [x] **0.10** `src/pagination.ts` — `walkPage`/`walkCursor`/`walkStartId` + `extractArray` (port `commands/pagination.rs`)
- [x] **0.11** `src/ui.ts` — TTY/CI/NO_COLOR gate for ora/chalk/boxen/figures; expose `spinner`/`success`/`error`/`hint`/`breadcrumb`/`box`
- [x] **0.12** `src/cli.ts` — global flags struct (`--token --workspace --output --fields --no-header --all --limit --page --cursor --start --start-id -q --timeout --max-chars --max-tokens`)
- [x] **0.13** `src/context.ts` — `createContext()` returning `{ client, output, ui, resolveWorkspace, resolveToken }`
- [x] **0.14** `src/commands/index.ts` — `register(program)` skeleton + dispatch
- [x] **0.15** `src/commands/status.ts` — boxed config summary (boxen)
- [x] **0.16** `src/main.ts` — entry: update-notifier, build Commander tree, parse globals, construct `Ctx`, dispatch, map `CliError` → exit code
- [x] **0.17** Unit tests: `error.test.ts`, `config.test.ts`, `output.test.ts` (port `test_output.rs` + Tier A/B cases), `input.test.ts`, `git.test.ts` (port `git.rs` tests), `pagination.test.ts` (`extractArray`)
- [x] **0.18** Verify: `npm run build` clean, `vitest` green, `clickup-cli-js --help` works, `clickup-cli-js status` shows boxed config
- [x] **0.19** Initial commit

## Phase 1 — Core commands

- [x] **1.1** `commands/setup.ts` — interactive (`@inquirer/prompts` token + workspace picker) + `--token` non-interactive; boxen success card
- [x] **1.2** `commands/auth.ts` — `whoami`, `check`
- [x] **1.3** `commands/workspace.ts` — `list`, `seats`, `plan`; export `resolveWorkspace`
- [x] **1.4** `commands/space.ts` — `list [--archived]`, `get`, `create --name [--private]`, `update`, `delete` (destructive-confirm)
- [x] **1.5** `commands/folder.ts` — `list --space`, `get`, `create --space --name`, `update`, `delete` (destructive-confirm)
- [x] **1.6** `commands/list.ts` — `list --folder|--space`, `get`, `create`, `update`, `delete`, `add-task`, `remove-task` (destructive-confirm)
- [x] **1.7** `commands/task.ts` — `list` (+ `--summary`, `count` action, `--max-tokens`), `search`, `get [--subtasks] [--custom-task-id] [--markdown]`, `create`, `update`, `delete` (destructive-confirm, no branch detect), `time-in-status`, `add-tag`, `remove-tag`, `add-dep`, `remove-dep`, `link`, `unlink`, `move`, `set-estimate`, `replace-estimates` (port `task.rs` closely)
- [x] **1.8** Wire `ora` spinners on every network call in core commands (suppressed when non-TTY/CI/json/quiet)
- [x] **1.9** Smoke tests: `cli.test.ts` (`--help`, `task get`, output modes, `--summary`, `count`, `--max-tokens`), `task.test.ts`
- [x] **1.10** Verify all output modes correct on real ClickUp API (or mocks); git-branch detect works end-to-end

## Phase 2 — Collaboration + tracking

- [x] **2.1** `commands/comment.ts` — `list` (start-id pagination), `create`, `update`, `delete`, `replies`, `reply`
- [x] **2.2** `commands/tag.ts` — `list`, `create` (tag_fg/tag_bg), `update` (fg_color/bg_color), `delete` (destructive-confirm)
- [x] **2.3** `commands/field.ts` — `list`, `create`, `set`, `unset`, `ensure`
- [x] **2.4** `commands/time.ts` — `list`, `get`, `current` (negative-duration=running), `create`, `update`, `delete`, `start`, `stop`, `tags`, `add-tags`, `remove-tags`, `rename-tag`, `history`
- [x] **2.5** `commands/view.ts` — `list`, `get`, `create`, `update`, `delete`, `tasks` (page pagination)
- [x] **2.6** `commands/member.ts` — `list`; `commands/user.ts` — `invite`, `get`, `update`, `remove`
- [x] **2.7** Apply `--max-chars`/`--summary`/`count` where applicable across these groups
- [x] **2.8** Per-group tests; destructive-confirm prompts verified (refuse in non-TTY/CI without `--yes`)

## Phase 3 — MCP server

- [x] **3.1** `mcp/server.ts` — stdio JSON-RPC server via `@modelcontextprotocol/sdk`; `mcp serve` subcommand
- [x] **3.2** `mcp/tools.ts` — input-schema definitions for every implemented action (62 tools across 13 groups)
- [x] **3.3** `mcp/dispatch.ts` — calls the same ClickUp API endpoints; returns type-preserving compact JSON (Tier A-1)
- [x] **3.4** `mcp/filter.ts` — `--profile {all|read|safe}`, `--read-only`, `--groups`, `--exclude-groups`, `--tools`, `--exclude-tools` + `CLICKUP_MCP_*` env equivalents; hide from `tools/list` + reject at `tools/call`
- [x] **3.5** `mcp-filter.test.ts` (11 tests)
- [x] **3.6** Verify connects from a sample MCP client

## Phase 4 — Polish + publish

- [x] **4.1** README (install, quick start, command groups, output modes, MCP setup, token-efficiency notes)
- [x] **4.2** `clkup-js` alias verified (same entry, same flags)
- [x] **4.3** `update-notifier` wired into `main.ts` (cached 1/day, dim nudge)
- [x] **4.4** Exit codes verified E2E across all error categories
- [x] **4.5** `npm pack` + clean-room `npm i -g clickup-cli-js` test on a fresh dir
- [x] **4.6** Final commit + tag

---

## Notes / scratch

(Use this space for decisions, blockers, and discoveries during implementation.)
