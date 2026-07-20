import { randomUUID } from 'node:crypto';
import type { Session } from './types';
import { loadPrompt, listPrompts } from './prompts';
import fs from 'node:fs';
import path from 'node:path';

const STORE_DIR = path.join(process.cwd(), '.kalmi');
const STORE_PATH = path.join(STORE_DIR, 'sessions.json');
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL!;

interface SessionStore {
  sessions: Session[];
  currentSessionId: string | null;
}

let store: SessionStore;

function readStore(): SessionStore {
  const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  return {
    sessions: raw.sessions.map((s: any) => ({
      ...s,
      createdAt: new Date(s.createdAt),
    })),
    currentSessionId: raw.currentSessionId,
  };
}

function writeStore(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function initStore(): void {
  if (fs.existsSync(STORE_PATH)) {
    store = readStore();
    return;
  }
  const defaultPrompt = loadPrompt('default') ?? listPrompts()[0];
  const session: Session = {
    id: randomUUID(),
    name: 'default',
    systemPrompt: defaultPrompt.content,
    model: DEFAULT_MODEL,
    createdAt: new Date(),
  };
  store = { sessions: [session], currentSessionId: session.id };
  writeStore();
}

export function createSession(
  name: string,
  promptName: string = 'default',
  model: string = DEFAULT_MODEL,
): Session {
  const prompt = loadPrompt(promptName) ?? loadPrompt('default')!;
  const session: Session = {
    id: randomUUID(),
    name,
    systemPrompt: prompt.content,
    model,
    createdAt: new Date(),
  };
  store.sessions.push(session);
  store.currentSessionId = session.id;
  writeStore();
  return session;
}

function findSession(idOrPrefix: string): Session | undefined {
  const exact = store.sessions.find((s) => s.id === idOrPrefix);
  if (exact) return exact;
  if (idOrPrefix.length >= 8) {
    const matches = store.sessions.filter((s) =>
      s.id.startsWith(idOrPrefix),
    );
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

export function switchSession(id: string): Session | undefined {
  const session = findSession(id);
  if (session) {
    store.currentSessionId = session.id;
    writeStore();
  }
  return session;
}

export function getCurrentSession(): Session {
  if (!store.currentSessionId) {
    throw new Error('No active session. Run `pnpm agent --new` to create one.');
  }
  const session = store.sessions.find(
    (s) => s.id === store.currentSessionId,
  );
  if (!session) {
    throw new Error('Current session not found.');
  }
  return session;
}

export function listSessions(): Session[] {
  return store.sessions;
}

export function deleteSession(id: string): boolean {
  const session = findSession(id);
  if (!session) return false;
  const idx = store.sessions.findIndex((s) => s.id === session.id);
  if (idx === -1) return false;
  store.sessions.splice(idx, 1);
  if (store.currentSessionId === session.id) {
    store.currentSessionId = store.sessions[0]?.id ?? null;
  }
  writeStore();
  return true;
}

initStore();
