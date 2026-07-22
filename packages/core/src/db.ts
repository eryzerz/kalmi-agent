import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', '.kalmi');
const DB_PATH = path.join(DATA_DIR, 'kalmi.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS current_session (
      id INTEGER PRIMARY KEY CHECK (id = 0),
      session_id TEXT NOT NULL REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      session_id TEXT PRIMARY KEY,
      messages TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
