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
  assistant: string;
  toolCalls: { name: string; args: unknown }[];
  toolResults: { name: string; result: unknown }[];
}
