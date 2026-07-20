import 'dotenv/config';
import './ops/telemetry.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { runAgentTUI } from '@ai-sdk/tui';
import { ToolLoopAgent } from 'ai';
import {
  createSession,
  switchSession,
  getCurrentSession,
  listSessions,
  deleteSession,
  listPrompts,
  loadPrompt,
  appendTurn,
} from './runtime/index.js';
import { buildTools } from './tools/index.js';

const args = process.argv.slice(2);

function printUsage() {
  console.log('Usage: pnpm kalmi [command]');
  console.log('');
  console.log('Commands:');
  console.log('  (no args)        Start the agent TUI with the current session');
  console.log('  --new <name>     Create a new session [--prompt <name>] [--model <id>]');
  console.log('  --switch <id>    Switch to a session by id');
  console.log('  --list           List all sessions');
  console.log('  --delete <id>    Delete a session');
  console.log('  --prompts        List available system prompts');
  console.log('  --help           Show this help');
}

function parseFlag(
  flag: string,
  args: string[],
): { value: string | null; consumed: number } {
  const idx = args.indexOf(flag);
  if (idx === -1) return { value: null, consumed: 0 };
  const val = args[idx + 1];
  if (!val || val.startsWith('--')) return { value: null, consumed: 0 };
  return { value: val, consumed: 2 };
}

if (args.includes('--help')) {
  printUsage();
  process.exit(0);
}

if (args.includes('--prompts')) {
  console.log('Available system prompts:');
  for (const p of listPrompts()) {
    console.log(`  ${p.name.padEnd(12)} ${p.description}`);
  }
  process.exit(0);
}

if (args.includes('--list')) {
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log('No sessions. Create one with: pnpm agent --new <name>');
  } else {
    const currentId = (() => {
      try {
        return getCurrentSession().id;
      } catch {
        return null;
      }
    })();
    console.log('Sessions:');
    for (const s of sessions) {
      const marker = s.id === currentId ? '*' : ' ';
      console.log(
        ` ${marker} ${s.id.slice(0, 8)}  ${s.name.padEnd(16)} ${s.model.padEnd(28)} ${s.createdAt.toISOString().slice(0, 10)}`,
      );
    }
  }
  process.exit(0);
}

const newFlag = parseFlag('--new', args);
if (newFlag.value !== null) {
  const promptFlag = parseFlag('--prompt', args);
  const modelFlag = parseFlag('--model', args);
  const promptName = promptFlag.value ?? 'default';
  const prompt = loadPrompt(promptName);
  if (!prompt) {
    console.error(`Unknown prompt: ${promptName}`);
    console.log('Available prompts:');
    for (const p of listPrompts()) {
      console.log(`  ${p.name}`);
    }
    process.exit(1);
  }
  const session = createSession(newFlag.value, promptName, modelFlag?.value ?? process.env.OPENROUTER_MODEL);
  console.log(`Created session "${session.name}" (${session.id.slice(0, 8)})`);
  console.log(`Prompt: ${promptName}`);
  console.log(`Model:  ${session.model}`);
}

const switchFlag = parseFlag('--switch', args);
if (switchFlag.value !== null) {
  const session = switchSession(switchFlag.value);
  if (!session) {
    console.error(`Session not found: ${switchFlag.value}`);
    process.exit(1);
  }
  console.log(`Switched to "${session.name}" (${session.id.slice(0, 8)})`);
}

const deleteFlag = parseFlag('--delete', args);
if (deleteFlag.value !== null) {
  const ok = deleteSession(deleteFlag.value);
  if (ok) {
    console.log(`Deleted session ${deleteFlag.value.slice(0, 8)}`);
    process.exit(0);
  } else {
    console.error(`Session not found: ${deleteFlag.value}`);
    process.exit(1);
  }
}

const session = getCurrentSession();
console.log(`Session: ${session.name}  |  Model: ${session.model}`);
console.log('');

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
})

const { tools, cleanup } = await buildTools();

const usesCogneeCache = 'remember' in tools || 'recall' in tools;

const instructions = usesCogneeCache
  ? `${session.systemPrompt}\n\nWhen calling "remember" or "recall":\n- Pass session_id: "${session.id}" for conversation-specific memory (fast cache).\n- Omit session_id for general facts that should persist across all sessions (permanent knowledge graph).`
  : session.systemPrompt;

let pendingTurn: string | null = null;

const agent = new ToolLoopAgent({
  model: openrouter(session.model, { provider: { sort: 'price' } }),
  instructions,
  tools,
  prepareStep: ({ initialInstructions, messages }) => {
    if (!pendingTurn) {
      const userMessages = messages.filter((m: any) => m.role === 'user');
      const lastUser = userMessages[userMessages.length - 1];
      if (lastUser?.content) {
        pendingTurn = typeof lastUser.content === 'string'
          ? lastUser.content
          : JSON.stringify(lastUser.content);
      }
    }

    const now = new Date();
    return {
      instructions: `${initialInstructions}\n\nCurrent time: ${now.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    };
  },
  onFinish: (event) => {
    if (!pendingTurn) return;

    const tc = (event as any).toolCalls || (event as any).dynamicToolCalls || [];
    const tr = (event as any).toolResults || (event as any).dynamicToolResults || [];

    appendTurn(session.id, {
      timestamp: new Date().toISOString(),
      user: pendingTurn,
      assistant: (event as any).text ?? '',
      toolCalls: tc.map((t: any) => ({ name: t.toolName, args: t.args })),
      toolResults: tr.map((t: any) => ({ name: t.toolName, result: t.result })),
    });
    pendingTurn = null;
  },
});

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

await runAgentTUI({
  title: `kalmi — ${session.name}`,
  agent,
});

await cleanup();
