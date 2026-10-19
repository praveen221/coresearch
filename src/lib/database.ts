import { mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const applicationId = 0x43525348;

export function workspacePath(explicit?: string): string {
  const selected = explicit ?? process.env['CORESEARCH_WORKSPACE'];
  if (selected !== undefined) {
    if (!isAbsolute(selected)) throw new Error('Workspace must be an absolute path.');
    return resolve(selected);
  }
  return join(homedir(), '.local', 'share', 'coresearch');
}

export function withDatabase<T>(workspace: string, operation: (db: DatabaseSync) => T): T {
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const filename = join(workspace, 'coresearch.sqlite');
  const db = new DatabaseSync(filename);
  try {
    chmodSync(filename, 0o600);
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    const identity = db.prepare('PRAGMA application_id').get()?.['application_id'];
    const version = db.prepare('PRAGMA user_version').get()?.['user_version'];
    if (identity !== 0 && identity !== applicationId) {
      throw new Error('This database belongs to another application.');
    }
    if (version !== 0 && version !== 1) throw new Error('Unsupported database version.');
    if (identity === 0) {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      if (tables.length > 0) throw new Error('Refusing to initialize an existing unknown database.');
    }
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT,
        background TEXT,
        needs_funding INTEGER CHECK (needs_funding IN (0, 1)),
        funding_notes TEXT,
        updated_at TEXT
      ) STRICT;
      INSERT OR IGNORE INTO profile (id) VALUES (1);
      CREATE TABLE IF NOT EXISTS interests (
        id INTEGER PRIMARY KEY,
        description TEXT NOT NULL UNIQUE CHECK (length(trim(description)) > 0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS constraints (
        id INTEGER PRIMARY KEY,
        description TEXT NOT NULL UNIQUE CHECK (length(trim(description)) > 0)
      ) STRICT;
      PRAGMA application_id = ${String(applicationId)};
      PRAGMA user_version = 1;
      COMMIT;
    `);
    return operation(db);
  } finally {
    db.close();
  }
}
