export {
  createSession,
  switchSession,
  getCurrentSession,
  listSessions,
  deleteSession,
} from './session.js';

export {
  saveCheckpoint,
  getCheckpoint,
  clearCheckpoint,
} from './checkpoint.js';

export { appendTurn, getLog } from './chatlog.js';

export { initTelemetry } from './telemetry.js';

export { loadPrompt, listPrompts } from './prompts.js';

export type { Session, PromptDefinition, ChatLogEntry } from './types.js';

export {
  TransientError,
  PermanentError,
  PartialResultError,
  MalformedDataError,
  classifyError,
} from './errors.js';

export { retry, DeadlineExceededError, MaxRetriesExceededError } from './retry.js';
export type { RetryConfig } from './retry.js';
