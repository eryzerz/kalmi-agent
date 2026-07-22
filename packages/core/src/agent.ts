import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ToolLoopAgent, type ToolSet } from 'ai';
import type { Session } from './types.js';
import { appendTurn } from './chatlog.js';
import { saveCheckpoint, clearCheckpoint } from './checkpoint.js';
import { buildTools } from './tools.js';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

let pendingTurn: string | null = null;

export interface AgentOptions {
  session: Session;
  resumeFrom?: any[];
}

export async function createAgent(
  options: AgentOptions,
): Promise<{ agent: ToolLoopAgent; cleanup: () => Promise<void> }> {
  const { session, resumeFrom } = options;

  const { tools, cleanup } = await buildTools();

  const usesCogneeCache = 'remember' in tools || 'recall' in tools;

  const instructions = usesCogneeCache
    ? `${session.systemPrompt}\n\nWhen calling "remember" or "recall":\n- Pass session_id: "${session.id}" for conversation-specific memory (fast cache).\n- Omit session_id for general facts that should persist across all sessions (permanent knowledge graph).`
    : session.systemPrompt;

  const agent = new ToolLoopAgent({
    model: openrouter(session.model, { provider: { sort: 'price' } }),
    instructions,
    tools,
    prepareCall: resumeFrom
      ? (options) => {
          const { prompt: _, ...rest } = options;
          return { ...rest, messages: resumeFrom };
        }
      : undefined,
    prepareStep: ({ initialInstructions, messages }) => {
      saveCheckpoint(session.id, messages);

      if (!pendingTurn) {
        const userMessages = messages.filter((m: any) => m.role === 'user');
        const lastUser = userMessages[userMessages.length - 1];
        if (lastUser?.content) {
          pendingTurn =
            typeof lastUser.content === 'string'
              ? lastUser.content
              : JSON.stringify(lastUser.content);
        }
      }

      const now = new Date();
      return {
        instructions: `${initialInstructions}\n\nCurrent time: ${now.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
      };
    },
    onEnd: (event) => {
      clearCheckpoint(session.id);

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

  return { agent, cleanup };
}
