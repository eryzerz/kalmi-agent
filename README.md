# kalmi

A terminal-based AI agent powered by the [Vercel AI SDK](https://sdk.vercel.ai/) with multi-server [MCP](https://modelcontextprotocol.io/) support — persistent memory via [cognee](https://cognee.ai/), web access via [FastCRW](https://fastcrw.com/), and OpenTelemetry tracing to [Jaeger](https://www.jaegertracing.io/).

## Architecture

### System

```mermaid
graph TD
    subgraph Host
        tui[<b>@kalmi/tui</b><br/>Ink v5 terminal UI]
        core[<b>@kalmi/core</b><br/>agent factory + tools + sessions]
        tui --> core
        core --> |OTLP gRPC| jaeger[Jaeger<br/>all-in-one]
    end

    subgraph Docker
        subgraph cognee-network
            cognee_mcp[<b>cognee-mcp</b><br/>SSE :8001]
            crw[<b>crw-server</b><br/>HTTP :3001/mcp]
            postgres[Postgres<br/>:5432]
            neo4j[Neo4j<br/>:7687]
            redis[Redis<br/>:6379]
        end
        jaeger[Jaeger<br/>UI :16686]
    end

    core --> |MCP / SSE| cognee_mcp
    core --> |MCP / HTTP| crw
    core --> |OpenRouter API| LLM[OpenRouter<br/>300+ models]

    cognee_mcp --> postgres
    cognee_mcp --> neo4j
    cognee_mcp --> redis
    crw --> |render| Web["🌐 Web pages"]
```

### Data Flow

```mermaid
sequenceDiagram
    actor User
    participant TUI as @kalmi/tui (Ink)
    participant Agent as ToolLoopAgent
    participant LLM as OpenRouter
    participant Cognee as cognee-mcp
    participant CRW as crw-server
    participant Jaeger as Jaeger

    User->>TUI: type message
    TUI->>Agent: agent.generate({ prompt })
    Note over Agent: prepareStep<br/>injects current time<br/>saves checkpoint
    Agent->>LLM: generateText({ messages, tools })

    alt tool call: remember/recall
        LLM-->>Agent: tool_call: remember
        Agent->>Cognee: MCP call (SSE)
        Cognee->>Cognee: postgres / neo4j / redis
        Cognee-->>Agent: result
    else tool call: crw_scrape
        LLM-->>Agent: tool_call: crw_scrape
        Agent->>CRW: MCP call (HTTP)
        CRW->>Web: fetch page
        CRW-->>Agent: markdown
    end

    Agent->>LLM: generateText({ messages, toolResults })
    LLM-->>Agent: final response
    Agent-->>TUI: result.text
    Agent->>Jaeger: OTel spans
    Note over Agent: onEnd<br/>clears checkpoint<br/>appends JSONL log
    TUI-->>User: render markdown
```

### Monorepo Structure

```
kalmi-agent/
├── packages/
│   └── core/                   @kalmi/core — shared library
│       └── src/
│           ├── index.ts               session, checkpoint, chatlog, telemetry, prompts (light)
│           ├── agent.ts               ToolLoopAgent factory with OpenRouter (heavy)
│           ├── tools.ts               merges MCP tools + custom tools (heavy)
│           ├── mcp.ts                 multi-server MCP client manager
│           ├── session.ts             SQLite-backed session CRUD
│           ├── checkpoint.ts          SQLite checkpoint save / get / clear
│           ├── chatlog.ts             JSONL turn logger
│           ├── telemetry.ts           OTel tracer + Jaeger gRPC exporter
│           ├── prompts.ts             built-in system prompts
│           ├── db.ts                  SQLite schema + connection (better-sqlite3)
│           ├── types.ts               Session, PromptDefinition, ChatLogEntry
│           └── tools/                 sys tools (read, write, bash, grep, glob)
├── apps/
│   ├── tui/                    @kalmi/tui — Ink terminal UI
│   │   └── src/
│   │       ├── entry.ts              dotenv load, session init, render App
│   │       └── app.tsx               Ink chat component with agent.generate()
│   └── web/                    @kalmi/web — Next.js web UI (planned)
└── .kalmi/                     generated
    ├── kalmi.db                SQLite database (sessions, checkpoints)
    └── logs/{sessionId}.jsonl  per-session JSONL conversation logs
```

### Subpath Exports

`@kalmi/core` uses subpath exports to keep light consumers from pulling in heavy dependencies (OpenRouter, MCP):

| Export | Contents | Heavy deps? |
|---|---|---|
| `@kalmi/core` | sessions, checkpoints, chatlog, telemetry, prompts | No |
| `@kalmi/core/agent` | `createAgent()` with OpenRouter + MCP tools | Yes |
| `@kalmi/core/tools` | `buildTools()` — MCP + custom tool merge | Yes |

Apps import the heavy exports via dynamic `import()` to load `.env` before any heavy module initializes.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Docker](https://www.docker.com/) with Compose

## Installation

```bash
git clone <repo-url> kalmi-agent
cd kalmi-agent
pnpm install
cp .env.example .env
```

Edit `.env` — at minimum set your OpenRouter key and model:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=z-ai/glm-5.2
```

### External services

Each service runs in Docker. Start them before launching kalmi.

#### Cognee (memory + knowledge graph)

```bash
# Clone and start the full stack
git clone https://github.com/topoteretes/cognee.git
cd cognee
cp .env.template .env
# Edit .env — set LLM_API_KEY, EMBEDDING_API_KEY, EMBEDDING_ENDPOINT, etc.

docker compose --profile mcp --profile neo4j --profile postgres --profile redis up -d

# Connect Redis if it misses the network (one-time)
docker network connect cognee-network redis
```

Services: postgres (:5432), neo4j (:7474 / :7687), redis (:6379), cognee-mcp (:8001/sse)

#### CRW / FastCRW (web scraping)

```bash
docker run -d \
  --name crw \
  --network cognee-network \
  -p 3001:3000 \
  ghcr.io/us/crw:latest
```

Exposes MCP endpoint at `http://localhost:3001/mcp` and REST API at `/v1/scrape`, `/v1/crawl`, `/v1/map`.

#### Jaeger (tracing)

```bash
docker volume create jaeger_data

docker run -d \
  --name jaeger \
  --user root \
  --network cognee-network \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 16686:16686 \
  -e SPAN_STORAGE_TYPE=badger \
  -e BADGER_EPHEMERAL=false \
  -e BADGER_DIRECTORY_KEY=/tmp/jaeger \
  -e BADGER_DIRECTORY_VALUE=/tmp/jaeger \
  -v jaeger_data:/tmp/jaeger \
  jaegertracing/all-in-one:latest
```

UI at `http://localhost:16686`. Traces persist across restarts via the `jaeger_data` volume.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Yes | — | OpenRouter API key |
| `OPENROUTER_MODEL` | Yes | — | Default model (e.g. `openai/gpt-4o`, `anthropic/claude-sonnet`) |
| `MCP_SERVERS` | No | — | Comma-separated MCP server names (e.g. `cognee,crw`) |
| `MCP_{NAME}_TRANSPORT` | Per server | `http` | Transport type: `sse` or `http` |
| `MCP_{NAME}_URL` | Per server | — | MCP endpoint URL |
| `MCP_{NAME}_API_KEY` | Per server | — | Bearer token for authenticated servers |
| `MCP_{NAME}_HEADERS` | No | — | JSON object of additional headers |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | `http://localhost:4317` | OTLP gRPC endpoint for tracing |

### Example `.env`

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4o

MCP_SERVERS=cognee,crw
MCP_COGNEE_TRANSPORT=sse
MCP_COGNEE_URL=http://localhost:8001/sse
MCP_CRW_TRANSPORT=http
MCP_CRW_URL=http://localhost:3001/mcp

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## Running

```bash
pnpm kalmi:tui                 # start TUI with current session
```

TUI commands (type in the chat):

- `Esc` — exit

## Sessions

Sessions are stored in SQLite (`.kalmi/kalmi.db`) — no JSON file, no manual editing. Each session stores:

- UUID and name
- System prompt (preset)
- Model ID
- Creation timestamp

The `current_session` table tracks the active session. On first run, a default session is created automatically.


### Chat History Display

When a session starts, the last 10 turns from `.kalmi/logs/{sessionId}.jsonl` are loaded and rendered in the TUI — user messages, tool calls, and assistant responses appear inline, giving context for a new message.

## MCP Tools

When MCP servers are configured, the agent automatically discovers and merges all available tools. No manual wiring needed — add a server to `MCP_SERVERS` and configure its `MCP_{NAME}_*` vars.

### cognee

| Tool | Description |
|---|---|
| `remember` | Store data in memory (session cache or permanent graph) |
| `recall` | Retrieve data from memory (session-first, then graph) |
| `forget` | Delete dataset or all owned memory |
| `visualize_graph_ui` | Open knowledge graph visualization |
| `upload_file_ui` | Open workspace for file upload |

The agent is instructed to pass `session_id` (the kalmi session UUID) for fast session cache, or omit it for permanent graph storage.

### CRW (FastCRW)

| Tool | Description |
|---|---|
| `crw_scrape` | Fetch a URL and return clean markdown |
| `crw_crawl` | Multi-page crawl from a seed URL |
| `crw_map` | Discover all URLs on a site |
| `crw_extract` | Extract structured JSON from pages |
| `crw_parse_file` | Parse local PDFs to markdown |

## Adding a custom tool

Custom AI SDK tools go in `packages/core/src/tools/`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const myTool = tool({
  description: 'Description for the LLM',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    // your logic
    return 'result';
  },
});
```

Then add it to the `tools` object in `packages/core/src/tools.ts`:

```typescript
const tools = {
  ...mcpTools,
  myTool,
};
```

## Tracing

kalmi exports OpenTelemetry spans to Jaeger. Tracer setup is in `packages/core/src/telemetry.ts` — spans are created via `@ai-sdk/otel` integration with the `ai` SDK. Each agent turn produces:

```
invoke_agent {model}         ← root span
  ├── chat {model}           ← each LLM step
  │   ├── execute_tool ...   ← MCP tool calls
  │   └── ...
  └── ...
```

Tracing is initialized once in `apps/tui/src/entry.ts` with `initTelemetry()`. Set `OTEL_EXPORTER_OTLP_ENDPOINT` in `.env` (defaults to `http://localhost:4317`). Open `http://localhost:16686` and select service `kalmi`.

## Chat Logs

Every conversation turn is automatically logged to `.kalmi/logs/{sessionId}.jsonl` — one JSON object per line:

```jsonl
{"timestamp":"2026-07-20T12:00:00Z","user":"tell me about plekhanov","assistant":"Plekhanov was...","toolCalls":[{"name":"remember","args":{"data":"..."}}],"toolResults":[{"name":"remember","result":"..."}]}
```

Logs are per-session, append-only — each session UUID gets its own file.

On TUI startup, the last 10 turns are loaded and displayed inline for conversation context.

## Roadmap

- [x] **Core agent** — ToolLoopAgent with OpenRouter, session management, and MCP multi-server support
- [x] **Monorepo restructuring** — `@kalmi/core` (shared library) + `@kalmi/tui` (Ink terminal UI)
- [x] **SQLite sessions** — Replaced JSON file with SQLite-backed sessions, checkpoints, and resume flow
- [x] **Ink TUI** — Terminal chat UI with markdown rendering, tool call progress, and chat history display
- [x] **Persistent memory + RAG** — Knowledge graph via cognee (Neo4j + Postgres + Redis), session-scoped caching
- [x] **Web access** — Scraping, crawling, and site mapping via CRW / FastCRW
- [x] **Observability** — OpenTelemetry tracing to Jaeger, JSONL conversation logs
- [ ] **Web gateway** (`apps/web`) — Next.js frontend with `useChat`, importing `@kalmi/core/agent` server-side
- [ ] **Discord gateway** — Bot interface for Discord servers
- [ ] **Telegram gateway** — Bot interface for Telegram chats
- [ ] **Skills** — Reusable prompt + tool packs for domain-specific workflows
- [ ] **Events scheduler** — Cron-based background tasks (recurring scrapes, scheduled summarization)
- [ ] **Evaluation** — LLM-as-judge for measuring response quality and tool use accuracy
