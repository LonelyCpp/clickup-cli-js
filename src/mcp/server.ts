import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ClickUpClient } from '../client.js';
import { ConfigManager, resolveToken } from '../config.js';
import { dispatchTool } from './dispatch.js';
import { Filter, type FilterOptions, filterFromEnv } from './filter.js';
import { TOOL_DEFINITIONS } from './tools.js';

export async function startMcpServer(filterOpts?: FilterOptions): Promise<void> {
  const config = ConfigManager.load();
  const token = resolveToken(undefined, config);
  const workspaceId = config.defaults.workspace_id;
  const client = new ClickUpClient(token, 30);

  const filter = filterOpts ? new Filter(filterOpts) : filterFromEnv();

  const allowedTools = filter.apply(TOOL_DEFINITIONS);

  const server = new Server(
    { name: 'clickup-cli-js', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allowedTools.map(({ _group, ...tool }) => tool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!filter.allows(name)) {
      return {
        content: [
          { type: 'text' as const, text: `Tool '${name}' is not available (filtered out)` },
        ],
        isError: true,
      };
    }

    try {
      const result = await dispatchTool(name, args || {}, client, workspaceId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
