import fs from 'node:fs';
import path from 'node:path';

export interface ChatLogEntry {
  timestamp: string;
  user: string;
  assistant: string;
  toolCalls: { name: string; args: unknown }[];
  toolResults: { name: string; result: unknown }[];
}

const LOGS_DIR = path.join(process.cwd(), '.kalmi', 'logs');

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

export function getLastTurns(
  sessionId: string,
  count: number,
): ChatLogEntry[] {
  const entries = getLog(sessionId);
  return entries.slice(-count);
}

export function getTurnCount(sessionId: string): number {
  const file = logPath(sessionId);
  if (!fs.existsSync(file)) return 0;

  const raw = fs.readFileSync(file, 'utf-8').trim();
  if (!raw) return 0;

  return raw.split('\n').length;
}

export function getLastTurnSummary(sessionId: string): string | null {
  const last = getLastTurns(sessionId, 1);
  if (last.length === 0) return null;
  const entry = last[0];
  const preview =
    entry.user.length > 80 ? entry.user.slice(0, 80) + '...' : entry.user;
  return `"${preview}"`;
}
