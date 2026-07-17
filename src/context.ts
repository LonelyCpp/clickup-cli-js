import type { CliOptions } from './cli.js';
import { ClickUpClient } from './client.js';
import { type Config, resolveToken, resolveWorkspace } from './config.js';
import { OutputConfig } from './output.js';
import { type UI, createUI } from './ui.js';

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
    cli.outputFile
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
