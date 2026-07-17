import { Command, Option } from 'commander';
import { DEFAULT_MAX_CHARS } from './cli.js';
import { registerCommands } from './commands/index.js';
import { CliError } from './error.js';

const program = new Command();

const parseIntArg = (v: string) => Number.parseInt(v, 10);

program
  .name('clickup-cli-js')
  .description('CLI for the ClickUp API, optimized for AI agents')
  .version('0.1.0')
  .option('--token <token>', 'API token (overrides config file)')
  .option('--workspace <id>', 'Workspace ID (overrides config default)')
  .option(
    '--output <mode>',
    'Output format: table, compact, json, json-compact, csv, brief',
    'table'
  )
  .option('--fields <list>', 'Comma-separated list of fields to display')
  .option(
    '--output-file <path>',
    'Write the full response to a file; stdout gets a short notice instead'
  )
  .option('--no-header', 'Omit table header row', false)
  .option('--all', 'Fetch all pages', false)
  .option('--limit <n>', 'Cap total results', parseIntArg)
  .option('--page <n>', 'Manual page selection (v2 page-based)', parseIntArg)
  .option('--cursor <cursor>', 'Opaque cursor (v3 cursor-based)')
  .option('--start <ms>', 'Boundary timestamp in Unix ms (v2 comment endpoints)', parseIntArg)
  .option('--start-id <id>', 'Boundary comment id (v2 comment endpoints)')
  .option('-q, --quiet', 'Only print IDs, one per line', false)
  .addOption(
    new Option('--timeout <secs>', 'HTTP timeout in seconds').default('30').argParser(parseIntArg)
  )
  .addOption(
    new Option('--max-chars <n>', 'Max chars per text value (0=off)')
      .default(String(DEFAULT_MAX_CHARS))
      .argParser(parseIntArg)
  )
  .addOption(new Option('--max-tokens <n>', 'Soft token budget cap').argParser(parseIntArg));

registerCommands(program);

program.hook('preAction', () => {
  const opts = program.opts() as Record<string, unknown>;
  const validModes = ['table', 'compact', 'json', 'json-compact', 'csv', 'brief'];
  if (typeof opts.output === 'string' && !validModes.includes(opts.output)) {
    throw new CliError(
      'client',
      `Invalid output mode '${opts.output}'. Valid: ${validModes.join(', ')}`
    );
  }
});

async function checkForUpdates(): Promise<void> {
  if (process.env.CI || !process.stdout.isTTY) return;
  try {
    const updateNotifier = (await import('update-notifier')).default;
    const pkg = {
      name: 'clickup-cli-js',
      version: '0.1.0',
    };
    const notifier = updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 });
    notifier.notify({ isGlobal: true });
  } catch {
    // update-notifier is optional — never fail on it
  }
}

async function main() {
  void checkForUpdates();
  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    if (e instanceof CliError) {
      const opts = program.opts() as Record<string, unknown>;
      const outputMode = typeof opts.output === 'string' ? opts.output : 'table';
      e.print(outputMode);
      process.exit(e.exitCode());
    }
    if (e instanceof Error) {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exit(1);
    }
    process.exit(1);
  }
}

void main();

export { program };
