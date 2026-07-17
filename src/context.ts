import { ClickUpClient } from './client.js';
import { OutputConfig } from './output.js';
import { createUI, type UI } from './ui.js';
import { resolveToken, resolveWorkspace, type Config } from './config.js';
import type { CliOptions } from './cli.js';

export interface Context {
  client: ClickUpClient;
  output: OutputConfig;
  ui: UI;
  cli: CliOptions;
  config: Config;
  resolveWorkspace: () => string;
  resolveToken: () => string;
}

export function createContext(cli: CliOptions, config: Config): Context {
  const token = resolveToken(cli.token, config);
  const client = new ClickUpClient(token, cli.timeout);
  const output = OutputConfig.fromCli(
    cli.output,
    cli.fields,
    cli.noHeader,
    cli.quiet,
    cli.maxChars,
    cli.maxTokens,
  );
  const ui = createUI({ outputMode: cli.output, quiet: cli.quiet });

  return {
    client,
    output,
    ui,
    cli,
    config,
    resolveWorkspace: () => resolveWorkspace(cli.workspace, config),
    resolveToken: () => token,
  };
}
