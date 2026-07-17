import { password, select } from '@inquirer/prompts';
import type { Command } from 'commander';
import type { CliOptions } from '../cli.js';
import { ClickUpClient } from '../client.js';
import { type Config, ConfigManager } from '../config.js';
import { CliError } from '../error.js';
import { createUI } from '../ui.js';

function getRoot(cmd: Command): Command {
  let root = cmd;
  while (root.parent) root = root.parent;
  return root;
}

function maskToken(token: string): string {
  if (!token) return '(not configured)';
  if (token.length <= 10) return `${token.slice(0, 2)}\u2026${token.slice(-2)}`;
  return `${token.slice(0, 6)}\u2026${token.slice(-4)}`;
}

export function registerSetup(program: Command): void {
  program
    .command('setup')
    .description('Configure API token and default workspace interactively')
    .action(async (_opts: unknown, cmd: Command) => {
      const opts = getRoot(cmd).opts() as CliOptions;
      const ui = createUI({ outputMode: opts.output, quiet: opts.quiet });

      let existing: Config | null = null;
      try {
        existing = ConfigManager.load();
      } catch {
        existing = null;
      }
      if (existing?.auth?.token) {
        ui.breadcrumb('Existing configuration found. Updating...');
      }

      let token = opts.token;
      if (!token) {
        token = await password({
          message: 'Enter your ClickUp API token:',
          mask: '*',
          validate: (v) => (v.trim().length > 0 ? true : 'Token cannot be empty'),
        });
      }
      token = token.trim();

      const client = new ClickUpClient(token, opts.timeout);

      ui.startSpinner('Verifying token...');
      let user: Record<string, unknown>;
      try {
        user = await client.get('/v2/user');
      } finally {
        ui.stopSpinner();
      }

      let workspaceId = opts.workspace;
      let workspaceName = workspaceId ?? null;
      if (!workspaceId) {
        ui.startSpinner('Fetching workspaces...');
        let teams: Record<string, unknown>[];
        try {
          const res = await client.get('/v2/team');
          teams = Array.isArray(res?.teams) ? res.teams : [];
        } finally {
          ui.stopSpinner();
        }

        if (teams.length === 0) {
          throw CliError.config('No workspaces found for this token.');
        }

        if (teams.length === 1) {
          workspaceId = String(teams[0].id);
          workspaceName = String(teams[0].name ?? workspaceId);
        } else {
          const choices = teams.map((t) => ({
            name: String(t.name ?? t.id),
            value: String(t.id),
            description: `ID: ${t.id}`,
          }));
          const picked = await select({
            message: 'Select a default workspace:',
            choices,
          });
          workspaceId = picked;
          const match = teams.find((t) => String(t.id) === String(picked));
          workspaceName = String(match?.name ?? picked);
        }
      }

      ui.startSpinner('Saving configuration...');
      try {
        const config: Config = {
          auth: { token },
          defaults: {
            workspace_id: workspaceId,
            output: existing?.defaults?.output,
          },
          git: existing?.git ?? {},
        };
        ConfigManager.save(config);
      } finally {
        ui.stopSpinner();
      }

      const userLabel =
        (typeof user.username === 'string' && user.username) ||
        (typeof user.email === 'string' && user.email) ||
        '(unknown)';

      const content = [
        'Setup complete!',
        '',
        `User:      ${userLabel}`,
        `Token:     ${maskToken(token)}`,
        `Workspace: ${workspaceName} (${workspaceId})`,
        '',
        `Config:    ${ConfigManager.configPath()}`,
      ].join('\n');
      ui.box(content, { padding: 1 });
    });
}
