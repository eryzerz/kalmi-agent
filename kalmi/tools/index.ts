import type { ToolSet } from 'ai';
import { initMCP } from './mcp.js';

export type BuildToolsResult = {
  tools: ToolSet;
  cleanup: () => Promise<void>;
};

export async function buildTools(): Promise<BuildToolsResult> {
  const serversConfigured = (process.env.MCP_SERVERS || '').trim();

  if (!serversConfigured) {
    console.error('No MCP_SERVERS configured. Running with no tools.', serversConfigured);
    return { tools: {}, cleanup: async () => { } };
  }

  const { tools: mcpTools, cleanup: mcpCleanup } = await initMCP();

  const tools = {
    ...mcpTools,
    // Add custom AI SDK tools here:
    // example: tool({ description: '...', parameters: z.object({ ... }), execute: async (args) => { ... } }),
  };

  return { tools, cleanup: mcpCleanup };
}
