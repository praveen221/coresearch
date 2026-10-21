import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { NotFoundError, RuleError } from './errors.ts';
import { readSources } from './library.ts';
import { seedInputSchema, seedPatchSchema, seedSchema, trackScoreSchema } from './research-schema.ts';
import type { Seed, SeedKind, Source } from './research-schema.ts';

export const seedRecencyFloor = 2022;

export interface SeedEvidence { year: number | null; citedBy: number | null; fromLab: boolean }

const kindWeights: Record<SeedKind, number> = {
  'future-work': 1, conflict: 1, 'theory-gap': 0.9, survivor: 0.9, student: 0.8, 'stopped-track': 0.6,
};

function recency(year: number | null, now: number): number {
  if (year === null) return 0.3;
  if (year < seedRecencyFloor) return 0.1;
  return Math.min(1, 0.5 + 0.5 * (year - seedRecencyFloor) / Math.max(1, now - seedRecencyFloor));
}

function citationSignal(year: number | null, citedBy: number | null, now: number): number {
  if (citedBy === null || year === null) return 0.4;
  const age = now - year;
  if (age < 1) return 0.5;
  return Math.min(1, Math.log10(1 + citedBy / age) / Math.log10(51));
}

export function citationsPerYear(year: number | null, citedBy: number | null, now: number): number | null {
  if (citedBy === null || year === null || now - year < 1) return null;
  return Math.round(10 * citedBy / (now - year)) / 10;
}

export function seedStrength(kind: SeedKind, evidence: readonly SeedEvidence[], now: number, survivorScore: number | null = null): number {
  const weight = kindWeights[kind];
  if (survivorScore !== null) return Math.round(100 * weight * survivorScore / 15);
  if (evidence.length === 0) return Math.round(100 * weight * 0.6);
  const best = Math.max(...evidence.map((item) => 0.55 * recency(item.year, now) + 0.45 * citationSignal(item.year, item.citedBy, now)));
  const lab = evidence.some((item) => item.fromLab) ? 1 : 0;
  const convergence = Math.min(1, (evidence.length - 1) / 4);
  return Math.round(100 * weight * (0.55 * best + 0.25 * lab + 0.2 * convergence));
}

const seedRow = z.object({
  id: z.number(), target_id: z.number(), batch_id: z.number().nullable(), kind: z.string(), text: z.string(), clip_ids: z.string(),
  track_id: z.number().nullable(), status: z.string(), note: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
const clipRow = z.object({ id: z.number(), source_id: z.number(), kind: z.string() });
const trackRow = z.object({ id: z.number(), status: z.string(), seed_ids: z.string().nullable(), score: z.string().nullable() });
const ids = z.array(z.number().int().positive());

function surname(db: DatabaseSync, targetId: number): string {
  const row = z.object({ professor: z.string() }).optional().parse(db.prepare('SELECT professor FROM targets WHERE id = ?').get(targetId));
  if (row === undefined) throw new NotFoundError(`No target with id ${String(targetId)}.`);
  return row.professor.trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
}

function fromLab(source: Source, name: string): boolean {
  return name !== '' && source.authors.some((author) => author.toLowerCase().includes(name));
}

function evidenceSources(db: DatabaseSync, clipIds: readonly number[], targetId: number): { clips: z.infer<typeof clipRow>[]; sources: Source[] } {
  if (clipIds.length === 0) return { clips: [], sources: [] };
  const clips = z.array(clipRow).parse(db.prepare(`SELECT clips.id, clips.source_id, clips.kind FROM clips JOIN sources
    ON sources.id = clips.source_id WHERE sources.target_id = ? AND clips.id IN (${clipIds.map(() => '?').join(', ')})`)
    .all(targetId, ...clipIds));
  const missing = clipIds.filter((clip) => !clips.some((row) => row.id === clip));
  if (missing.length > 0) throw new RuleError(`No cutout ${missing.map((clip) => `[c${String(clip)}]`).join(' ')} for this target.`);
  const sourceIds = [...new Set(clips.map((clip) => clip.source_id))];
  return { clips, sources: readSources(db, `WHERE id IN (${sourceIds.map(() => '?').join(', ')})`, ...sourceIds) };
}

export function readSeeds(db: DatabaseSync, targetId: number, now = new Date().getUTCFullYear()): Seed[] {
  const rows = z.array(seedRow).parse(db.prepare('SELECT * FROM seeds WHERE target_id = ? ORDER BY id').all(targetId));
  if (rows.length === 0) return [];
  const name = surname(db, targetId);
  const tracks = z.array(trackRow).parse(db.prepare('SELECT id, status, seed_ids, score FROM tracks WHERE target_id = ?').all(targetId));
  const clipSource = new Map(z.array(clipRow).parse(db.prepare(`SELECT clips.id, clips.source_id, clips.kind FROM clips JOIN sources
    ON sources.id = clips.source_id WHERE sources.target_id = ?`).all(targetId)).map((clip) => [clip.id, clip.source_id]));
  const library = new Map(readSources(db, 'WHERE target_id = ?', targetId).map((source) => [source.id, source]));
  return rows.map((row) => {
    const clipIds = ids.parse(JSON.parse(row.clip_ids));
    const sources = [...new Set(clipIds.flatMap((clip) => clipSource.get(clip) ?? []))].flatMap((id) => library.get(id) ?? []);
    const evidence = sources.map((source) => ({ year: source.year, citedBy: source.citedBy, fromLab: fromLab(source, name) }));
    const raw = tracks.find((item) => item.id === row.track_id)?.score ?? null;
    const score = raw === null ? null : trackScoreSchema.parse(JSON.parse(raw)).total;
    const kind = seedSchema.shape.kind.parse(row.kind);
    const newest = Math.max(0, ...sources.map((source) => source.year ?? 0));
    const best = sources.map((source) => citationsPerYear(source.year, source.citedBy, now)).filter((value): value is number => value !== null);
    return seedSchema.parse({
      id: row.id, targetId: row.target_id, batchId: row.batch_id, kind, text: row.text, clipIds, trackId: row.track_id,
      status: row.status, note: row.note, strength: seedStrength(kind, evidence, now, kind === 'survivor' ? score : null),
      newestYear: newest > 0 ? newest : null, citationsPerYear: best.length === 0 ? null : Math.max(...best),
      fromLab: evidence.some((item) => item.fromLab), sources: sources.length,
      usedBy: tracks.filter((item) => item.seed_ids !== null && ids.parse(JSON.parse(item.seed_ids)).includes(row.id)).map((item) => item.id),
      createdAt: row.created_at, updatedAt: row.updated_at,
    });
  });
}

function assertGrounded(db: DatabaseSync, input: z.infer<typeof seedInputSchema>): void {
  const { clips, sources } = evidenceSources(db, input.clipIds, input.targetId);
  const recent = sources.some((source) => source.year !== null && source.year >= seedRecencyFloor);
  const paperBased = input.kind === 'future-work' || input.kind === 'conflict' || input.kind === 'theory-gap';
  if (paperBased && !recent) {
    throw new RuleError(`Ground this seed in at least one source from ${String(seedRecencyFloor)} or later; older work can be cited `
      + 'in a track but is a weak signal for a seed.');
  }
  if (input.kind === 'future-work' && !clips.some((clip) => clip.kind === 'future' || clip.kind === 'limitation' || clip.kind === 'gap')) {
    throw new RuleError('A future-work seed needs a cutout of stated future work, a limitation, or an open question.');
  }
  if (input.kind === 'conflict' && sources.length < 2) throw new RuleError('A conflict seed needs findings from at least two papers.');
  if (input.kind === 'stopped-track' || input.kind === 'survivor') {
    if (input.trackId === null) throw new RuleError('Name the track this seed comes from (trackId).');
    const track = trackRow.extend({ target_id: z.number() }).optional()
      .parse(db.prepare('SELECT id, status, seed_ids, score, target_id FROM tracks WHERE id = ?').get(input.trackId));
    if (track === undefined || track.target_id !== input.targetId) throw new RuleError('That track does not belong to this target.');
    const wanted = input.kind === 'survivor' ? ['strong'] : ['paused', 'dropped'];
    if (!wanted.includes(track.status)) throw new RuleError(`A ${input.kind} seed comes from a ${wanted.join(' or ')} track.`);
  }
  if (input.kind === 'student' && input.note === null) throw new RuleError('Quote the student’s own words in `note`.');
}

export function addSeed(workspace: string, input: unknown): Seed {
  const seed = seedInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    assertGrounded(db, seed);
    const batch = z.object({ id: z.number() }).optional()
      .parse(db.prepare('SELECT id FROM batches WHERE target_id = ? ORDER BY number DESC LIMIT 1').get(seed.targetId));
    const stamp = new Date().toISOString();
    const id = Number(db.prepare(`INSERT INTO seeds (target_id, batch_id, kind, text, clip_ids, track_id, status, note, created_at,
      updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`).run(seed.targetId, batch?.id ?? null, seed.kind, seed.text,
      JSON.stringify([...new Set(seed.clipIds)]), seed.trackId, seed.note, stamp, stamp).lastInsertRowid);
    return readSeed(db, id);
  }, 'BEGIN IMMEDIATE'));
}

function readSeed(db: DatabaseSync, id: number): Seed {
  const row = z.object({ target_id: z.number() }).optional().parse(db.prepare('SELECT target_id FROM seeds WHERE id = ?').get(id));
  const seed = row === undefined ? undefined : readSeeds(db, row.target_id).find((item) => item.id === id);
  if (seed === undefined) throw new NotFoundError(`No seed with id ${String(id)}.`);
  return seed;
}

export function updateSeed(workspace: string, id: number, input: unknown): Seed {
  const patch = seedPatchSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const current = readSeed(db, id);
    db.prepare('UPDATE seeds SET status = ?, text = ?, note = ?, updated_at = ? WHERE id = ?').run(patch.status ?? current.status,
      patch.text ?? current.text, patch.note === undefined ? current.note : patch.note, new Date().toISOString(), id);
    return readSeed(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function listSeeds(workspace: string, targetId: number): Seed[] {
  return withDatabase(workspace, (db) => transaction(db, () => readSeeds(db, targetId)
    .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.strength - a.strength)));
}

export function assertSeeds(db: DatabaseSync, targetId: number, seedIds: readonly number[]): void {
  const seeds = readSeeds(db, targetId);
  for (const id of seedIds) {
    const seed = seeds.find((item) => item.id === id);
    if (seed === undefined) throw new RuleError(`No seed ${String(id)} for this target (seed:list).`);
    if (seed.status === 'set-aside') throw new RuleError(`Seed ${String(id)} was set aside.`);
  }
}

export function markSeedsUsed(db: DatabaseSync, seedIds: readonly number[]): void {
  for (const id of seedIds) db.prepare('UPDATE seeds SET status = \'used\', updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}
