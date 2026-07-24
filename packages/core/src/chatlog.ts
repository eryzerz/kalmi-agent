import fs from 'node:fs';
import path from 'node:path';
import type { ChatLogEntry } from './types.js';
import { ChatLogEntrySchema } from './schemas.js';
import { MalformedDataError, formatZodErrors } from './errors.js';

const LOGS_DIR = path.resolve(import.meta.dirname, '..', '..', '..', '.kalmi', 'logs');

function logPath(sessionId: string): string {
  return path.join(LOGS_DIR, `${sessionId}.jsonl`);
}

export function appendTurn(sessionId: string, entry: ChatLogEntry): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(logPath(sessionId), JSON.stringify(entry) + '\n');
}

export function getLog(sessionId: string): ChatLogEntry[] {
  const file = logPath(sessionId);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf-8').trim();
  if (!raw) return [];

  const entries: ChatLogEntry[] = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      const result = ChatLogEntrySchema.safeParse(parsed);
      if (result.success) {
        entries.push(result.data);
      } else {
        console.warn(new MalformedDataError(
          `Chat log line ${i + 1} has unexpected shape, discarding`,
          'getLog',
          formatZodErrors(result.error),
          parsed,
        ).message);
      }
    } catch {
      console.warn(new MalformedDataError(
        `Chat log line ${i + 1} is corrupted JSON, discarding`,
        'getLog',
        ['JSON parse failed'],
      ).message);
    }
  }

  return entries;
}
