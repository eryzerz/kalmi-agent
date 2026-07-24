import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { retry, type RetryConfig } from './retry.js';

type MCPServerDef = {
  name: string;
  transport: { type: 'sse' | 'http'; url: string; headers?: Record<string, string> };
};

function loadServerDefs(): MCPServerDef[] {
  const names = (process.env.MCP_SERVERS || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  return names.map((name) => {
    const upper = name.toUpperCase();
    const url = process.env[`MCP_${upper}_URL`];
    if (!url) {
      throw new Error(
        `MCP_${upper}_URL is required for MCP server "${name}". Add it to your .env file.`,
      );
    }

    const transport = (process.env[`MCP_${upper}_TRANSPORT`] || 'http') as 'sse' | 'http';
    const apiKey = process.env[`MCP_${upper}_API_KEY`];
    const rawHeaders = process.env[`MCP_${upper}_HEADERS`];

    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    if (rawHeaders) {
      try {
        const parsed = JSON.parse(rawHeaders);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            headers[k] = String(v);
          }
        }
      } catch {
        console.warn(`Failed to parse MCP_${upper}_HEADERS as JSON, ignoring.`);
      }
    }

    return { name, transport: { type: transport, url, headers } };
  });
}

export type MCPBridge = {
  tools: Awaited<ReturnType<MCPClient['tools']>>;
  cleanup: () => Promise<void>;
};

export async function initMCP(): Promise<MCPBridge> {
  const servers = loadServerDefs();
  const clients: MCPClient[] = [];

  const retryConfig: RetryConfig = {
    onAttempt: (attempt, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  MCP connection attempt ${attempt} failed: ${msg}`);
    },
  };

  for (const def of servers) {
    console.error(`Connecting to MCP server "${def.name}" via ${def.transport.type} at ${def.transport.url}`);

    try {
      const client = await retry(
        async () => {
          return await createMCPClient({
            transport: def.transport,
            clientName: def.name,
          });
        },
        retryConfig,
      );
      clients.push(client);
      console.error(`  "${def.name}" connected successfully`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  "${def.name}" unreachable after all attempts: ${msg}`);
    }
  }

  const toolSets: Record<string, unknown>[] = [];
  for (const client of clients) {
    try {
      const tools = await retry(() => client.tools(), retryConfig);
      toolSets.push(tools as Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  Failed to discover tools: ${msg}`);
    }
  }

  const tools = Object.assign({}, ...toolSets);
  const totalServers = servers.length;
  const connectedServers = clients.length;

  console.error(
    `Loaded ${Object.keys(tools).length} tools from ${connectedServers}/${totalServers} MCP server(s)`,
  );

  async function cleanup() {
    const results = await Promise.allSettled(clients.map((c) => c.close()));
    for (const result of results) {
      if (result.status === 'rejected') {
        const reason = result.reason as unknown;
        console.warn(`  Failed to close MCP client: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    }
  }

  return { tools, cleanup };
}
