import { getDb } from './db.js';
import { CheckpointMessagesSchema } from './schemas.js';
import { MalformedDataError, formatZodErrors } from './errors.js';

export function saveCheckpoint(sessionId: string, messages: any[]): void {
  const db = getDb();
  const json = JSON.stringify(messages);
  db.prepare('INSERT OR REPLACE INTO checkpoints (session_id, messages) VALUES (?, ?)')
    .run(sessionId, json);
}

export function getCheckpoint(sessionId: string): any[] | null {
  const row = getDb()
    .prepare('SELECT messages FROM checkpoints WHERE session_id = ?')
    .get(sessionId) as any;
  if (!row?.messages) return null;

  try {
    const parsed = JSON.parse(row.messages);
    const result = CheckpointMessagesSchema.safeParse(parsed);
    if (result.success) return result.data;
    console.warn(new MalformedDataError(
      'Checkpoint data has unexpected shape, discarding',
      'getCheckpoint',
      formatZodErrors(result.error),
    ).message);
    return null;
  } catch {
    console.warn(new MalformedDataError(
      'Checkpoint JSON is corrupted, discarding',
      'getCheckpoint',
      ['JSON parse failed'],
    ).message);
    return null;
  }
}

export function clearCheckpoint(sessionId: string): void {
  getDb()
    .prepare('DELETE FROM checkpoints WHERE session_id = ?')
    .run(sessionId);
}
