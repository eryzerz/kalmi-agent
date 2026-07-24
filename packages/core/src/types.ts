export interface Session {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  createdAt: Date;
}

export interface PromptDefinition {
  name: string;
  description: string;
  content: string;
}

export interface ChatLogEntry {
  timestamp: string;
  user: string;
  assistant: unknown;
  toolCalls?: unknown[];
  toolResults?: unknown[];

[key: string]: unknown;
}
