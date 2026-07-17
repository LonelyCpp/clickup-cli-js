import type { Command } from 'commander';

export function registerMcp(program: Command): void {
  const mcp = program.command('mcp').description('MCP server commands');

  mcp
    .command('serve')
    .description('Start MCP server (stdio JSON-RPC)')
    .option('--profile <name>', 'Tool preset: all, read, safe')
    .option('--read-only', 'Alias for --profile read')
    .option('--groups <list>', 'Include only these resource groups (comma-separated)')
    .option('--exclude-groups <list>', 'Drop these resource groups')
    .option('--tools <list>', 'Include only these tools by name')
    .option('--exclude-tools <list>', 'Drop these tools by name')
    .action(async (opts) => {
      const { startMcpServer } = await import('../mcp/server.js');
      await startMcpServer({
        profile: opts.profile,
        readOnly: opts.readOnly,
        groups: opts.groups?.split(',').map((s: string) => s.trim()),
        excludeGroups: opts.excludeGroups?.split(',').map((s: string) => s.trim()),
        tools: opts.tools?.split(',').map((s: string) => s.trim()),
        excludeTools: opts.excludeTools?.split(',').map((s: string) => s.trim()),
      });
    });
}
