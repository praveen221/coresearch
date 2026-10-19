import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase, workspacePath } from './database.ts';
import { ConflictError, NotFoundError } from './errors.ts';
import { targetFieldsSchema, targetInputSchema, targetPatchSchema, targetSchema } from './target-schema.ts';
import type { Link, Target } from './target-schema.ts';

export const targetIdSchema = z.coerce.number().int().positive();

const targetRowSchema = z.object({
  id: z.number(),
  professor: z.string(),
  lab_kind: z.string(),
  university: z.string().nullable(),
  lab: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
const linkRowSchema = z.object({ target_id: z.number(), kind: z.string(), url: z.string() });

function read(db: DatabaseSync, id?: number): Target[] {
  const where = id === undefined ? '' : ' WHERE id = ?';
  const linkWhere = id === undefined ? '' : ' WHERE target_id = ?';
  const parameters = id === undefined ? [] : [id];
  const rows = z.array(targetRowSchema).parse(db.prepare(`SELECT * FROM targets${where} ORDER BY id`).all(...parameters));
  const links = z.array(linkRowSchema)
    .parse(db.prepare(`SELECT target_id, kind, url FROM target_links${linkWhere} ORDER BY id`).all(...parameters));
  return rows.map((row) => targetSchema.parse({
    id: row.id,
    professor: row.professor,
    labKind: row.lab_kind,
    university: row.university,
    lab: row.lab,
    links: links.filter((link) => link.target_id === row.id).map(({ kind, url }) => ({ kind, url })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function readOne(db: DatabaseSync, id: number): Target {
  const [target] = read(db, id);
  if (target === undefined) throw new NotFoundError(`No target with id ${String(id)}.`);
  return target;
}

function saveLinks(db: DatabaseSync, id: number, links: readonly Link[]): void {
  for (const link of links) {
    db.prepare(`INSERT INTO target_links (target_id, kind, url) VALUES (?, ?, ?)
      ON CONFLICT (target_id, url) DO UPDATE SET kind = excluded.kind`).run(id, link.kind, link.url);
  }
}

export function listTargets(workspace = workspacePath()): Target[] {
  return withDatabase(workspace, (db) => transaction(db, () => read(db)));
}

export function getTarget(id: number, workspace = workspacePath()): Target {
  return withDatabase(workspace, (db) => transaction(db, () => readOne(db, id)));
}

export function addTarget(input: unknown, workspace = workspacePath()): Target {
  const target = targetInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO targets (professor, lab_kind, university, lab, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(target.professor, target.labKind, target.university, target.lab, now, now);
    const id = Number(result.lastInsertRowid);
    saveLinks(db, id, target.links);
    return readOne(db, id);
  }, 'BEGIN IMMEDIATE'));
}

// `expected` rejects the update when another writer (chat or another tab) saved first.
export function updateTarget(id: number, input: unknown, workspace = workspacePath(),
  expected?: { updatedAt: string }): Target {
  const patch = targetPatchSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const current = readOne(db, id);
    if (expected !== undefined && expected.updatedAt !== current.updatedAt) throw new ConflictError('target');
    const fields = targetFieldsSchema.parse({
      professor: patch.professor ?? current.professor,
      labKind: patch.labKind ?? current.labKind,
      university: patch.university === undefined ? current.university : patch.university,
      lab: patch.lab === undefined ? current.lab : patch.lab,
    });
    db.prepare('UPDATE targets SET professor = ?, lab_kind = ?, university = ?, lab = ?, updated_at = ? WHERE id = ?')
      .run(fields.professor, fields.labKind, fields.university, fields.lab, new Date().toISOString(), id);
    for (const url of patch.links?.remove ?? []) {
      db.prepare('DELETE FROM target_links WHERE target_id = ? AND url = ?').run(id, url);
    }
    saveLinks(db, id, patch.links?.add ?? []);
    return readOne(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function removeTarget(id: number, workspace = workspacePath()): { removed: number } {
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (db.prepare('DELETE FROM targets WHERE id = ?').run(id).changes === 0) {
      throw new NotFoundError(`No target with id ${String(id)}.`);
    }
    return { removed: id };
  }, 'BEGIN IMMEDIATE'));
}
