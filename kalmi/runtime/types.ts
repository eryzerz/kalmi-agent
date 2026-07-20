export interface Session {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  createdAt: Date;
}

export interface SessionStore {
  sessions: Session[];
  currentSessionId: string | null;
}

export interface PromptDefinition {
  name: string;
  description: string;
  content: string;
}
