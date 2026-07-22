import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';

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
        Object.assign(headers, JSON.parse(rawHeaders));
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

  for (const def of servers) {
    console.error(`Connecting to MCP server "${def.name}" via ${def.transport.type} at ${def.transport.url}`);
    const client = await createMCPClient({
      transport: def.transport,
      clientName: def.name,
    });
    clients.push(client);
  }

  const toolSets = await Promise.all(clients.map((c) => c.tools()));
  const tools = Object.assign({}, ...toolSets);

  console.error(`Loaded ${Object.keys(tools).length} tools from ${servers.length} MCP server(s)`);

  async function cleanup() {
    await Promise.all(clients.map((c) => c.close()));
  }

  return { tools, cleanup };
}
