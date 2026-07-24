import { randomUUID } from 'node:crypto';
import type { Session } from './types.js';
import { loadPrompt, listPrompts } from './prompts.js';
import { getDb } from './db.js';
import { SessionRowSchema } from './schemas.js';
import { MalformedDataError, formatZodErrors } from './errors.js';

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';

function rowToSession(row: unknown): Session {
  const result = SessionRowSchema.safeParse(row);
  if (result.success) {
    return {
      id: result.data.id,
      name: result.data.name,
      systemPrompt: result.data.system_prompt,
      model: result.data.model,
      createdAt: new Date(result.data.created_at),
    };
  }
  console.warn(new MalformedDataError(
    'Session row has unexpected shape, using fallback values',
    'rowToSession',
    formatZodErrors(result.error),
    row,
  ).message);
  const r = row as any;
  return {
    id: r?.id ?? 'unknown',
    name: r?.name ?? 'unknown',
    systemPrompt: r?.system_prompt ?? '',
    model: r?.model ?? DEFAULT_MODEL,
    createdAt: r?.created_at ? new Date(r.created_at) : new Date(0),
  };
}

function ensureDefaultSession(): void {
  const db = getDb();
  const row = db.prepare('SELECT session_id FROM current_session WHERE id = 0').get() as any;
  if (!row?.session_id) {
    const defaultPromptDef = loadPrompt('default') ?? listPrompts()[0];
    if (!defaultPromptDef) {
      console.error('No prompts available. Cannot create default session.');
      return;
    }
    const session: Session = {
      id: randomUUID(),
      name: 'default',
      systemPrompt: defaultPromptDef.content,
      model: DEFAULT_MODEL,
      createdAt: new Date(),
    };
    const insert = db.prepare(
      'INSERT INTO sessions (id, name, system_prompt, model, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run(session.id, session.name, session.systemPrompt, session.model, session.createdAt.toISOString());
    db.prepare('INSERT INTO current_session (id, session_id) VALUES (0, ?)').run(session.id);
  }
}
ensureDefaultSession();

export function createSession(
  name: string,
  promptName: string = 'default',
  model: string = DEFAULT_MODEL,
): Session {
  const promptDef = loadPrompt(promptName) ?? loadPrompt('default');
  if (!promptDef) {
    throw new Error('No prompts available. Cannot create session.');
  }
  const session: Session = {
    id: randomUUID(),
    name,
    systemPrompt: promptDef.content,
    model,
    createdAt: new Date(),
  };
  const db = getDb();
  db.prepare(
    'INSERT INTO sessions (id, name, system_prompt, model, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(session.id, session.name, session.systemPrompt, session.model, session.createdAt.toISOString());
  db.prepare('UPDATE current_session SET session_id = ? WHERE id = 0').run(session.id);
  return session;
}

function findSession(idOrPrefix: string): Session | undefined {
  const db = getDb();
  const exact = db.prepare('SELECT * FROM sessions WHERE id = ?').get(idOrPrefix);
  if (exact) return rowToSession(exact);
  if (idOrPrefix.length >= 8) {
    const matches = db.prepare('SELECT * FROM sessions WHERE id LIKE ?').all(idOrPrefix + '%');
    if (matches.length === 1) return rowToSession(matches[0]);
  }
  return undefined;
}

export function switchSession(id: string): Session | undefined {
  const session = findSession(id);
  if (session) {
    getDb().prepare('UPDATE current_session SET session_id = ? WHERE id = 0').run(session.id);
  }
  return session;
}

export function getCurrentSession(): Session {
  const db = getDb();
  const row = db.prepare(
    'SELECT s.* FROM sessions s JOIN current_session c ON s.id = c.session_id WHERE c.id = 0',
  ).get();
  if (!row) {
    throw new Error('No active session. Run `pnpm kalmi:tui:new` to create one.');
  }
  return rowToSession(row);
}

export function listSessions(): Session[] {
  const rows = getDb().prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
  return rows.map(rowToSession);
}

export function deleteSession(id: string): boolean {
  const session = findSession(id);
  if (!session) return false;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
  const current = db.prepare('SELECT session_id FROM current_session WHERE id = 0').get() as any;
  if (current?.session_id === session.id) {
    const first = db.prepare('SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1').get() as any;
    db.prepare('UPDATE current_session SET session_id = ? WHERE id = 0').run(first?.id ?? null);
  }
  return true;
}
