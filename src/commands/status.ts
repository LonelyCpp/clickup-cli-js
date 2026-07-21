import type { Command } from 'commander';
import { ConfigManager } from '../config.js';
import { CliError } from '../error.js';
import { createUI } from '../ui.js';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show current configuration and status')
    .action(() => {
      const ui = createUI({ outputMode: 'table', quiet: false });
      let config: ReturnType<typeof ConfigManager.load> | undefined;
      let configPath: string;
      try {
        config = ConfigManager.load();
        configPath = ConfigManager.configPath();
      } catch (e) {
        if (e instanceof CliError) {
          configPath = ConfigManager.configPath();
          const content = [
            'clickup-cli-js',
            '',
            `Config:    ${configPath}`,
            'Token:     (not configured)',
            'Workspace: (not configured)',
            '',
            "Run 'clickup-cli-js setup' to configure.",
          ].join('\n');
          ui.box(content, { padding: 1 });
          return;
        }
        throw e;
      }

      const token = config.auth.token;
      const maskedToken = token
        ? `${token.slice(0, 6)}\u2026${token.slice(-4)}`
        : '(not configured)';
      const workspace = config.defaults.workspace_id ?? '(not configured)';
      const gitEnabled = config.git.enabled ?? true;
      const gitVerbose = config.git.verbose ?? true;

      const lines = [
        'clickup-cli-js',
        '',
        `Config:    ${configPath}`,
        `Token:     ${maskedToken}`,
        `Workspace: ${workspace}`,
        `Git detect: ${gitEnabled ? 'enabled' : 'disabled'} (verbose: ${gitVerbose ? 'on' : 'off'})`,
      ];
      if (!token) {
        lines.push('', "Run 'clickup-cli-js setup' to configure.");
      }

      ui.box(lines.join('\n'), { padding: 1 });
    });
}
