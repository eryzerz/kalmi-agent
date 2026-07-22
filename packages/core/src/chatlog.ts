import fs from 'node:fs';
import path from 'node:path';
import type { ChatLogEntry } from './types.js';

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
  return raw.split('\n').map((line) => JSON.parse(line));
}
