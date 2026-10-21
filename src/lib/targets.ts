import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase, workspacePath } from './database.ts';
import { ConflictError, NotFoundError, RuleError } from './errors.ts';
import { defaultPathway, fitFacets, openings, pathways, regions, targetFieldsSchema, targetInputSchema, targetPatchSchema, targetSchema }
  from './target-schema.ts';
import type { FitScores, Link, Target } from './target-schema.ts';

export const targetIdSchema = z.coerce.number().int().positive();

const targetRowSchema = z.object({
  id: z.number(),
  professor: z.string(),
  lab_kind: z.string(),
  university: z.string().nullable(),
  lab: z.string().nullable(),
  country: z.string().nullable(),
  region: z.enum(regions).nullable(),
  pathway: z.enum(pathways).nullable(),
  notes: z.string().nullable(),
  openings: z.enum(openings).nullable(),
  openings_clip_id: z.number().nullable(),
  deadline: z.string().nullable(),
  deadline_clip_id: z.number().nullable(),
  pitch_hold: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
const linkRowSchema = z.object({ target_id: z.number(), kind: z.string(), url: z.string() });
const fitRowSchema = z.object({ target_id: z.number(), facet: z.enum(fitFacets), score: z.number().nullable() });
const notesSchema = z.record(z.string(), z.string());

export function readTargets(db: DatabaseSync, id?: number): Target[] {
  const where = id === undefined ? '' : ' WHERE id = ?';
  const linkWhere = id === undefined ? '' : ' WHERE target_id = ?';
  const parameters = id === undefined ? [] : [id];
  const rows = z.array(targetRowSchema).parse(db.prepare(`SELECT * FROM targets${where} ORDER BY id`).all(...parameters));
  const links = z.array(linkRowSchema)
    .parse(db.prepare(`SELECT target_id, kind, url FROM target_links${linkWhere} ORDER BY id`).all(...parameters));
  const fits = z.array(fitRowSchema).parse(db.prepare(`SELECT target_id, facet, score FROM fit_facets${linkWhere}`).all(...parameters));
  const fit = (id: number): FitScores => Object.fromEntries(fits.filter((item) => item.target_id === id).map((item) => [item.facet, item.score]));
  return rows.map((row) => targetSchema.parse({
    id: row.id,
    professor: row.professor,
    labKind: row.lab_kind,
    university: row.university,
    lab: row.lab,
    links: links.filter((link) => link.target_id === row.id).map(({ kind, url }) => ({ kind, url })),
    country: row.country,
    region: row.region,
    pathway: row.pathway ?? defaultPathway(row.region),
    notes: row.notes === null ? {} : notesSchema.parse(JSON.parse(row.notes)),
    openings: { status: row.openings ?? 'unknown', clipId: row.openings_clip_id },
    deadline: row.deadline === null || row.deadline_clip_id === null ? null : { date: row.deadline, clipId: row.deadline_clip_id },
    pitchHold: row.pitch_hold,
    fit: fit(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function readOne(db: DatabaseSync, id: number): Target {
  const [target] = readTargets(db, id);
  if (target === undefined) throw new NotFoundError(`No target with id ${String(id)}.`);
  return target;
}

function saveLinks(db: DatabaseSync, id: number, links: readonly Link[]): void {
  for (const link of links) {
    db.prepare(`INSERT INTO target_links (target_id, kind, url) VALUES (?, ?, ?)
      ON CONFLICT (target_id, url) DO UPDATE SET kind = excluded.kind`).run(id, link.kind, link.url);
  }
}

function assertOwnClip(db: DatabaseSync, targetId: number, clipId: number): void {
  const found = db.prepare('SELECT 1 FROM clips JOIN sources ON sources.id = clips.source_id WHERE clips.id = ? AND sources.target_id = ?')
    .get(clipId, targetId);
  if (found === undefined) throw new RuleError(`Cutout [c${String(clipId)}] is not from this professor’s saved sources.`);
}

export function insertTarget(db: DatabaseSync, input: unknown): Target {
  const target = targetInputSchema.parse(input);
  const now = new Date().toISOString();
  const result = db.prepare(`INSERT INTO targets (professor, lab_kind, university, lab, country, region, pathway, notes, created_at,
    updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(target.professor, target.labKind, target.university, target.lab,
    target.country, target.region, target.pathway, Object.keys(target.notes).length === 0 ? null : JSON.stringify(target.notes), now, now);
  const id = Number(result.lastInsertRowid);
  saveLinks(db, id, target.links);
  return readOne(db, id);
}

export function listTargets(workspace = workspacePath()): Target[] {
  return withDatabase(workspace, (db) => transaction(db, () => readTargets(db)));
}

export function getTarget(id: number, workspace = workspacePath()): Target {
  return withDatabase(workspace, (db) => transaction(db, () => readOne(db, id)));
}

export function addTarget(input: unknown, workspace = workspacePath()): Target {
  return withDatabase(workspace, (db) => transaction(db, () => insertTarget(db, input), 'BEGIN IMMEDIATE'));
}

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
    if (patch.openings?.clipId !== undefined && patch.openings.clipId !== null) assertOwnClip(db, id, patch.openings.clipId);
    if (patch.deadline !== undefined && patch.deadline !== null) assertOwnClip(db, id, patch.deadline.clipId);
    const row = targetRowSchema.parse(db.prepare('SELECT * FROM targets WHERE id = ?').get(id));
    const notes = patch.notes === undefined ? row.notes : Object.keys(patch.notes).length === 0 ? null : JSON.stringify(patch.notes);
    db.prepare(`UPDATE targets SET professor = ?, lab_kind = ?, university = ?, lab = ?, country = ?, region = ?, pathway = ?, notes = ?,
      openings = ?, openings_clip_id = ?, deadline = ?, deadline_clip_id = ?, pitch_hold = ?, updated_at = ? WHERE id = ?`).run(
      fields.professor, fields.labKind, fields.university, fields.lab,
      patch.country === undefined ? row.country : patch.country,
      patch.region === undefined ? row.region : patch.region,
      patch.pathway === undefined ? row.pathway : patch.pathway,
      notes,
      patch.openings === undefined ? row.openings : patch.openings.status,
      patch.openings === undefined ? row.openings_clip_id : patch.openings.clipId,
      patch.deadline === undefined ? row.deadline : patch.deadline?.date ?? null,
      patch.deadline === undefined ? row.deadline_clip_id : patch.deadline?.clipId ?? null,
      patch.pitchHold === undefined ? row.pitch_hold : patch.pitchHold,
      new Date().toISOString(), id);
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
