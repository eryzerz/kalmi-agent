import { getDb } from './db.js';

export function saveCheckpoint(sessionId: string, messages: any[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO checkpoints (session_id, messages) VALUES (?, ?)')
    .run(sessionId, JSON.stringify(messages));
}

export function getCheckpoint(sessionId: string): any[] | null {
  const row = getDb()
    .prepare('SELECT messages FROM checkpoints WHERE session_id = ?')
    .get(sessionId) as any;
  if (!row) return null;
  return JSON.parse(row.messages);
}

export function clearCheckpoint(sessionId: string): void {
  getDb()
    .prepare('DELETE FROM checkpoints WHERE session_id = ?')
    .run(sessionId);
}
