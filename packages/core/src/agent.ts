import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ToolLoopAgent, type ToolSet } from 'ai';
import type { Session } from './types.js';
import { appendTurn } from './chatlog.js';
import { saveCheckpoint, clearCheckpoint } from './checkpoint.js';
import { buildTools } from './tools.js';
import { AgentEventSchema } from './schemas.js';
import { PartialResultError, MalformedDataError, formatZodErrors } from './errors.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set. LLM calls will fail with 401.');
}

const openrouter = createOpenRouter({
  apiKey: OPENROUTER_API_KEY,
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
      ? (prepareOptions) => {
          const { prompt: _, ...rest } = prepareOptions;
          return { ...rest, messages: resumeFrom };
        }
      : undefined,
    prepareStep: ({ initialInstructions, messages }) => {
      try {
        saveCheckpoint(session.id, messages);
      } catch (err) {
        console.warn(`Failed to save checkpoint: ${err instanceof Error ? err.message : String(err)}`);
      }

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
      try {
        clearCheckpoint(session.id);
      } catch {
        // non-critical
      }

      if (!pendingTurn) return;

      const parsed = AgentEventSchema.safeParse(event);

      if (!parsed.success) {
        console.warn(new MalformedDataError(
          'Agent event has unexpected shape, using best-effort extraction',
          'agent.onEnd',
          formatZodErrors(parsed.error),
          event,
        ).message);
      }

      const raw = parsed.success ? parsed.data : event as any;

      const toolCalls = [
        ...(raw.toolCalls ?? []),
        ...(raw.dynamicToolCalls ?? []),
      ];
      const toolResults = [
        ...(raw.toolResults ?? []),
        ...(raw.dynamicToolResults ?? []),
      ];

      const text = raw.text ?? '';

      try {
        appendTurn(session.id, {
          timestamp: new Date().toISOString(),
          user: pendingTurn,
          assistant: text,
          toolCalls: toolCalls.map((t: any) => ({
            name: t.toolName ?? t.name ?? 'unknown',
            args: t.args,
          })),
          toolResults: toolResults.map((t: any) => ({
            name: t.toolName ?? t.name ?? 'unknown',
            result: t.result,
          })),
        });
      } catch (err) {
        console.warn(`Failed to append turn to chat log: ${err instanceof Error ? err.message : String(err)}`);
      }

      pendingTurn = null;
    },
  });

  return { agent, cleanup };
}
