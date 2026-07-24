import { z } from 'zod';

export const SessionRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  system_prompt: z.string(),
  model: z.string(),
  created_at: z.string(),
});

export const CurrentSessionRowSchema = z.object({
  session_id: z.string().uuid(),
});

export const ChatLogEntrySchema = z.object({
  timestamp: z.string(),
  user: z.string(),
  assistant: z.unknown(),
  toolCalls: z.array(z.unknown()).optional(),
  toolResults: z.array(z.unknown()).optional(),
}).passthrough();

export const ToolCallSchema = z.object({
  toolName: z.string(),
  args: z.unknown().optional(),
}).passthrough();

export const ToolResultSchema = z.object({
  toolName: z.string(),
  result: z.unknown(),
  type: z.string().optional(),
}).passthrough();

export const AgentEventSchema = z.object({
  text: z.string().optional().default(''),
  toolCalls: z.array(ToolCallSchema).optional().default([]),
  dynamicToolCalls: z.array(ToolCallSchema).optional().default([]),
  toolResults: z.array(ToolResultSchema).optional().default([]),
  dynamicToolResults: z.array(ToolResultSchema).optional().default([]),
}).passthrough();

export const CheckpointMessagesSchema = z.array(
  z.object({
    role: z.string(),
    content: z.unknown(),
  }).passthrough(),
);
