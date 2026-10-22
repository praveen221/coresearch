import { mkdirSync, chmodSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { DatabaseSync as Database } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';
import { defaultFitKinds } from './fit-schema.ts';

const applicationId = 0x43525348;
const schemaVersion = 7;

export function workspacePath(explicit?: string): string {
  const selected = explicit ?? process.env['CORESEARCH_WORKSPACE'];
  if (selected === undefined) throw new Error('No workspace selected.');
  if (!isAbsolute(selected)) throw new Error('Workspace must be an absolute path.');
  return resolve(selected);
}

type Table = 'profile' | 'targets' | 'tracks' | 'sources' | 'track_sources' | 'collaborators';

function addColumns(db: DatabaseSync, table: Table, columns: readonly string[], type: 'TEXT' | 'INTEGER' = 'TEXT'): void {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row['name'])));
  for (const column of columns) {
    if (!existing.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
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
    if (typeof version !== 'number' || version < 0 || version > schemaVersion) throw new Error('Unsupported database version.');
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
      CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY,
        professor TEXT NOT NULL CHECK (length(trim(professor)) > 0),
        lab_kind TEXT NOT NULL CHECK (lab_kind IN ('university', 'independent')),
        university TEXT,
        lab TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS target_links (
        id INTEGER PRIMARY KEY,
        target_id INTEGER NOT NULL REFERENCES targets (id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        url TEXT NOT NULL,
        UNIQUE (target_id, url)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('question', 'area')),
        text TEXT NOT NULL CHECK (length(trim(text)) > 0),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS target_authors (
        target_id INTEGER PRIMARY KEY REFERENCES targets (id) ON DELETE CASCADE,
        author_id TEXT NOT NULL,
        display_name TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY,
        target_id INTEGER NOT NULL REFERENCES targets (id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('paper', 'page')),
        title TEXT NOT NULL,
        url TEXT,
        doi TEXT,
        openalex_id TEXT,
        year INTEGER,
        venue TEXT,
        authors TEXT NOT NULL,
        abstract TEXT,
        pdf_urls TEXT NOT NULL,
        file_path TEXT,
        text_path TEXT,
        page_count INTEGER,
        status TEXT NOT NULL CHECK (status IN ('unread', 'abstract', 'partial', 'full', 'inaccessible')),
        status_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (target_id, openalex_id),
        UNIQUE (target_id, kind, url)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS citations (
        source_id INTEGER NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
        cited_openalex_id TEXT NOT NULL,
        PRIMARY KEY (source_id, cited_openalex_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY,
        target_id INTEGER NOT NULL REFERENCES targets (id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('question', 'frontier')),
        origin TEXT NOT NULL CHECK (origin IN ('student', 'agent')),
        idea_id INTEGER REFERENCES ideas (id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        question TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'running', 'awaiting', 'paused', 'dropped', 'strong')),
        summary TEXT,
        prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS track_sources (
        track_id INTEGER NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
        source_id INTEGER NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        note TEXT,
        PRIMARY KEY (track_id, source_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS track_events (
        id INTEGER PRIMARY KEY,
        track_id INTEGER NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
        actor TEXT NOT NULL CHECK (actor IN ('student', 'agent')),
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS clips (
        id INTEGER PRIMARY KEY,
        source_id INTEGER NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
        track_id INTEGER REFERENCES tracks (id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        quote TEXT NOT NULL,
        page INTEGER,
        context_before TEXT NOT NULL,
        context_after TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY,
        target_id INTEGER NOT NULL REFERENCES targets (id) ON DELETE CASCADE,
        number INTEGER NOT NULL CHECK (number > 0),
        status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
        size INTEGER CHECK (size > 0),
        approval TEXT,
        lessons TEXT,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        UNIQUE (target_id, number)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS seeds (
        id INTEGER PRIMARY KEY,
        target_id INTEGER NOT NULL REFERENCES targets (id) ON DELETE CASCADE,
        batch_id INTEGER REFERENCES batches (id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL CHECK (length(trim(text)) > 0),
        clip_ids TEXT NOT NULL,
        track_id INTEGER REFERENCES tracks (id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'used', 'set-aside')),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        target_id INTEGER NOT NULL REFERENCES targets (id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES categories (id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('lab', 'institution', 'theme')),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS source_categories (
        source_id INTEGER NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
        PRIMARY KEY (source_id, category_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS collaborators (
        id INTEGER PRIMARY KEY,
        description TEXT NOT NULL UNIQUE CHECK (length(trim(description)) > 0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS pitches (
        target_id INTEGER PRIMARY KEY REFERENCES targets (id) ON DELETE CASCADE,
        connections TEXT NOT NULL,
        question TEXT NOT NULL,
        question_check TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'replied', 'declined')),
        status_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS fit_kinds (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        question TEXT NOT NULL,
        anchors TEXT NOT NULL,
        evidence TEXT NOT NULL CHECK (evidence IN ('cv-and-work', 'work')),
        weight INTEGER NOT NULL CHECK (weight BETWEEN 0 AND 3),
        position INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS fit_scores (
        target_id INTEGER NOT NULL REFERENCES targets (id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        score INTEGER CHECK (score BETWEEN 0 AND 3),
        finding TEXT NOT NULL,
        reason TEXT NOT NULL,
        evidence TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        scored_at TEXT NOT NULL,
        PRIMARY KEY (target_id, kind)
      ) STRICT;
      PRAGMA application_id = ${String(applicationId)};
      PRAGMA user_version = ${String(schemaVersion)};
      COMMIT;
    `);
    addColumns(db, 'profile', ['website', 'cv_file', 'cv_text', 'cv_added_at']);
    addColumns(db, 'profile', ['cv_pages'], 'INTEGER');
    addColumns(db, 'targets', ['country', 'region', 'pathway', 'notes', 'openings', 'deadline', 'pitch_hold']);
    addColumns(db, 'targets', ['openings_clip_id', 'deadline_clip_id'], 'INTEGER');
    addColumns(db, 'tracks', ['rationale', 'stop_reason', 'next_steps', 'brief', 'research_questions', 'contribution', 'kill_criterion',
      'kill_reason', 'seed_ids', 'score']);
    addColumns(db, 'tracks', ['batch_id', 'prediction', 'control'], 'INTEGER');
    addColumns(db, 'sources', ['request_reason', 'requested_at', 'cited_at', 'future_checked_at', 'future_note']);
    addColumns(db, 'sources', ['cited_by'], 'INTEGER');
    addColumns(db, 'track_sources', ['verdict', 'assessment', 'assessed_at']);
    addColumns(db, 'collaborators', ['cv_quote', 'cv_before', 'cv_after', 'note']);
    addColumns(db, 'collaborators', ['cv_page'], 'INTEGER');
    if (db.prepare('SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = \'fit_facets\'').get() !== undefined) {
      db.exec(`INSERT OR IGNORE INTO fit_scores SELECT target_id, facet, score, finding, reason, evidence, reviewer, scored_at FROM fit_facets;
        DROP TABLE fit_facets;`);
    }
    if (db.prepare('SELECT 1 FROM fit_kinds LIMIT 1').get() === undefined) {
      defaultFitKinds.forEach((kind, position) => {
        db.prepare('INSERT INTO fit_kinds (key, label, question, anchors, evidence, weight, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(kind.key, kind.label, kind.question, kind.anchors, kind.evidence, kind.weight, position);
      });
    }
    db.exec(`
      INSERT INTO batches (target_id, number, status, created_at)
        SELECT target_id, 1, 'open', min(created_at) FROM tracks
        WHERE batch_id IS NULL AND target_id NOT IN (SELECT target_id FROM batches) GROUP BY target_id;
      UPDATE tracks SET batch_id = (SELECT id FROM batches WHERE batches.target_id = tracks.target_id ORDER BY number LIMIT 1)
        WHERE batch_id IS NULL;
    `);
    return operation(db);
  } finally {
    db.close();
  }
}

export function transaction<T>(db: Database, operation: () => T, begin: 'BEGIN' | 'BEGIN IMMEDIATE' = 'BEGIN'): T {
  db.exec(begin);
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
