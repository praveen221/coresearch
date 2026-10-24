import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { ConflictError, NotFoundError, RuleError } from './errors.ts';
import { ensureTargetFolders, slug } from './files.ts';
import { readCategories } from './categories.ts';
import { getAuthor, readSource, readSources, sourcePages } from './library.ts';
import { locateQuote } from './quote.ts';
import {
  batchCloseSchema, batchSchema, batchStartSchema, clearsBar, clipInputSchema, clipSchema, ideaInputSchema, ideaSchema, settingsPatchSchema,
  settingsSchema, trackApprovalSchema, trackAssessmentSchema, trackBriefSchema, trackEventInputSchema, trackEventSchema, trackInputSchema,
  trackLinkSchema, trackPatchSchema, trackSchema, trackScoreInputSchema, trackScoreSchema, trackSourceSchema,
} from './research-schema.ts';
import type { Batch, Clip, Idea, Research, Settings, Source, Track, TrackDetail } from './research-schema.ts';
import { assertSeeds, markSeedsUsed, readSeeds } from './seeds.ts';
import { requireTarget } from './targets.ts';

const now = (): string => new Date().toISOString();

export function listIdeas(workspace: string): Idea[] {
  return withDatabase(workspace, (db) => transaction(db, () => z.array(z.object({
    id: z.number(), kind: z.string(), text: z.string(), created_at: z.string(),
  })).parse(db.prepare('SELECT * FROM ideas ORDER BY id').all())
    .map((row) => ideaSchema.parse({ id: row.id, kind: row.kind, text: row.text, createdAt: row.created_at }))));
}

export function addIdea(workspace: string, input: unknown): Idea {
  const idea = ideaInputSchema.parse(input);
  const id = withDatabase(workspace, (db) => transaction(db, () => Number(db.prepare(
    'INSERT INTO ideas (kind, text, created_at) VALUES (?, ?, ?)').run(idea.kind, idea.text, now()).lastInsertRowid), 'BEGIN IMMEDIATE'));
  const saved = listIdeas(workspace).find((item) => item.id === id);
  if (saved === undefined) throw new NotFoundError('The idea was not saved.');
  return saved;
}

export function removeIdea(workspace: string, id: number): { removed: number } {
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (db.prepare('DELETE FROM ideas WHERE id = ?').run(id).changes === 0) throw new NotFoundError(`No idea with id ${String(id)}.`);
    return { removed: id };
  }, 'BEGIN IMMEDIATE'));
}

const trackRow = z.object({
  id: z.number(), target_id: z.number(), kind: z.string(), origin: z.string(), idea_id: z.number().nullable(),
  title: z.string(), question: z.string(), rationale: z.string().nullable(), status: z.string(), summary: z.string().nullable(),
  stop_reason: z.string().nullable(), next_steps: z.string().nullable(), prompt: z.string().nullable(),
  brief: z.string().nullable(), research_questions: z.string().nullable(), contribution: z.string().nullable(),
  batch_id: z.number().nullable(), prediction: z.number().nullable(), kill_criterion: z.string().nullable(),
  kill_reason: z.string().nullable(), seed_ids: z.string().nullable(), control: z.number().nullable(), score: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
});

export function readTracks(db: DatabaseSync, where: string, ...parameters: number[]): Track[] {
  return z.array(trackRow).parse(db.prepare(`SELECT * FROM tracks ${where}`).all(...parameters)).map((row) => trackSchema.parse({
    id: row.id, targetId: row.target_id, kind: row.kind, origin: row.origin, ideaId: row.idea_id, title: row.title,
    question: row.question, rationale: row.rationale, status: row.status, summary: row.summary, stopReason: row.stop_reason,
    nextSteps: row.next_steps, prompt: row.prompt, brief: row.brief,
    researchQuestions: row.research_questions === null ? [] : z.array(z.string()).parse(JSON.parse(row.research_questions)),
    contribution: row.contribution, batchId: row.batch_id, prediction: row.prediction, killCriterion: row.kill_criterion,
    killReason: row.kill_reason, seedIds: row.seed_ids === null ? [] : z.array(z.number()).parse(JSON.parse(row.seed_ids)),
    control: row.control === 1, score: row.score === null ? null : trackScoreSchema.parse(JSON.parse(row.score)),
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

const batchRow = z.object({
  id: z.number(), target_id: z.number(), number: z.number(), status: z.string(), size: z.number().nullable(), approval: z.string().nullable(),
  lessons: z.string().nullable(), created_at: z.string(), closed_at: z.string().nullable(),
});
type BatchRow = z.infer<typeof batchRow>;
const concluded = new Set(['strong', 'paused', 'dropped']);

function batchRows(db: DatabaseSync, where: string, ...parameters: number[]): BatchRow[] {
  return z.array(batchRow).parse(db.prepare(`SELECT * FROM batches ${where} ORDER BY number`).all(...parameters));
}

function openBatch(db: DatabaseSync, targetId: number): BatchRow {
  const rows = batchRows(db, 'WHERE target_id = ?', targetId);
  const open = rows.find((row) => row.status === 'open');
  if (open !== undefined) return open;
  const last = rows.at(-1);
  if (last !== undefined) {
    throw new RuleError(`Batch ${String(last.number)} is closed. Start the next batch with the student’s approval (batch:start).`);
  }
  db.prepare('INSERT INTO batches (target_id, number, status, created_at) VALUES (?, 1, \'open\', ?)').run(targetId, now());
  const [created] = batchRows(db, 'WHERE target_id = ?', targetId);
  if (created === undefined) throw new NotFoundError('The first batch was not saved.');
  return created;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.round(10 * values.reduce((sum, value) => sum + value, 0) / values.length) / 10;
}

function arm(tracks: readonly Track[]): Batch['metrics']['arms']['seeded'] {
  const scored = tracks.flatMap((track) => track.score === null ? [] : [track.score]);
  return { guesses: tracks.length, scored: scored.length, clearedBar: scored.filter((score) => clearsBar(score)).length,
    meanScore: average(scored.map((score) => score.total)) };
}

function batchMetrics(db: DatabaseSync, batchId: number): Batch['metrics'] {
  const tracks = readTracks(db, 'WHERE batch_id = ? AND kind = \'question\'', batchId);
  const count = (status: string): number => tracks.filter((track) => track.status === status).length;
  const probes = z.array(z.object({ track_id: z.number(), text: z.string() })).parse(db.prepare(`SELECT track_id, text FROM track_events
    WHERE kind = 'probe' AND track_id IN (SELECT id FROM tracks WHERE batch_id = ?)`).all(batchId));
  const scored = tracks.flatMap((track) => track.score === null ? [] : [{ status: track.status, total: track.score.total }]);
  const predicted = tracks.filter((track) => track.prediction !== null && concluded.has(track.status) && track.killReason !== 'withdrawn');
  const killReasons: Record<string, number> = {};
  for (const track of tracks) if (track.killReason !== null) killReasons[track.killReason] = (killReasons[track.killReason] ?? 0) + 1;
  return {
    guesses: tracks.length, open: tracks.filter((track) => !concluded.has(track.status)).length, strong: count('strong'),
    paused: count('paused'), dropped: count('dropped'),
    probeKills: new Set(probes.filter((probe) => /^kill\b/i.test(probe.text.trim())).map((probe) => probe.track_id)).size,
    scored: scored.length, clearedBar: tracks.filter((track) => track.score !== null && clearsBar(track.score)).length,
    meanScore: average(scored.map((item) => item.total)),
    meanStrongScore: average(scored.filter((item) => item.status === 'strong').map((item) => item.total)), predicted: predicted.length,
    brier: predicted.length === 0 ? null : Math.round(1000 * predicted.reduce((sum, track) =>
      sum + ((track.prediction ?? 0) / 100 - (track.status === 'strong' ? 1 : 0)) ** 2, 0) / predicted.length) / 1000,
    seeded: tracks.filter((track) => track.seedIds.length > 0).length, killReasons,
    arms: { seeded: arm(tracks.filter((track) => !track.control)), control: arm(tracks.filter((track) => track.control)) },
  };
}

function readBatches(db: DatabaseSync, targetId: number): Batch[] {
  return batchRows(db, 'WHERE target_id = ?', targetId).map((row) => batchSchema.parse({
    id: row.id, targetId: row.target_id, number: row.number, status: row.status, size: row.size, approval: row.approval,
    lessons: row.lessons, createdAt: row.created_at, closedAt: row.closed_at, metrics: batchMetrics(db, row.id),
  }));
}

export function listBatches(workspace: string, targetId: number): Batch[] {
  return withDatabase(workspace, (db) => transaction(db, () => {
    requireTarget(db, targetId);
    return readBatches(db, targetId);
  }));
}

export function startBatch(workspace: string, targetId: number, input: unknown): Batch {
  const { studentSaid, size } = batchStartSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (db.prepare('SELECT 1 FROM targets WHERE id = ?').get(targetId) === undefined) throw new NotFoundError(`No target with id ${String(targetId)}.`);
    const rows = batchRows(db, 'WHERE target_id = ?', targetId);
    const open = rows.find((row) => row.status === 'open');
    if (open !== undefined) throw new RuleError(`Batch ${String(open.number)} is still open; close it with its lessons first (batch:close).`);
    db.prepare('INSERT INTO batches (target_id, number, status, size, approval, created_at) VALUES (?, ?, \'open\', ?, ?, ?)')
      .run(targetId, (rows.at(-1)?.number ?? 0) + 1, size, studentSaid, now());
    const created = readBatches(db, targetId).at(-1);
    if (created === undefined) throw new NotFoundError('The batch was not saved.');
    return created;
  }, 'BEGIN IMMEDIATE'));
}

export function closeBatch(workspace: string, id: number, input: unknown): Batch {
  const { lessons } = batchCloseSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const [row] = batchRows(db, 'WHERE id = ?', id);
    if (row === undefined) throw new NotFoundError(`No batch with id ${String(id)}.`);
    if (row.status === 'closed') throw new RuleError(`Batch ${String(row.number)} is already closed.`);
    const tracks = readTracks(db, 'WHERE batch_id = ?', id);
    const list = (items: readonly Track[]): string => items.map((track) => String(track.id)).join(', ');
    const open = tracks.filter((track) => !concluded.has(track.status));
    if (open.length > 0) throw new RuleError(`Conclude tracks ${list(open)} first; every track ends strong, paused, or dropped.`);
    const questions = tracks.filter((track) => track.kind === 'question');
    const unexplained = questions.filter((track) => track.status !== 'strong' && track.killReason === null);
    if (unexplained.length > 0) throw new RuleError(`Give tracks ${list(unexplained)} a killReason (track:update).`);
    const unscored = questions.filter((track) => track.score === null && track.killReason !== 'withdrawn'
      && track.killReason !== 'student-choice');
    if (unscored.length > 0) throw new RuleError(`Have an independent reviewer score tracks ${list(unscored)} first (track:score).`);
    db.prepare('UPDATE batches SET status = \'closed\', lessons = ?, closed_at = ? WHERE id = ?').run(lessons, now(), id);
    const closed = readBatches(db, row.target_id).find((batch) => batch.id === id);
    if (closed === undefined) throw new NotFoundError('The batch was not saved.');
    return closed;
  }, 'BEGIN IMMEDIATE'));
}

function assertGuess(db: DatabaseSync, track: Track, when: string): void {
  assertProgramme(track, when);
  if (track.kind !== 'question' || track.origin !== 'agent') return;
  if (track.prediction === null || track.killCriterion === null) {
    throw new RuleError(`${when}, state what would kill this guess (killCriterion) and your predicted chance that it survives `
      + '(prediction), so outcomes can be compared with guesses.');
  }
  const [batch] = track.batchId === null ? [] : batchRows(db, 'WHERE id = ?', track.batchId);
  if (batch === undefined) return;
  if (batch.number > 1 && track.seedIds.length === 0 && !track.control) {
    throw new RuleError(`${when}, name the seeds this guess grows from (seedIds); from batch 2 on, guesses come from the seed library.`);
  }
  if (batch.size !== null) {
    const started = readTracks(db, 'WHERE batch_id = ? AND kind = \'question\' AND origin = \'agent\' AND status != \'proposed\'', batch.id)
      .filter((item) => item.killReason !== 'withdrawn').length;
    if (started >= batch.size) {
      throw new RuleError(`Batch ${String(batch.number)} was approved for ${String(batch.size)} guess${batch.size === 1 ? '' : 'es'}, `
        + 'and all have started.');
    }
  }
}

function assertProgramme(track: Pick<Track, 'kind' | 'researchQuestions' | 'contribution'>, when: string): void {
  if (track.kind !== 'question' || (track.researchQuestions.length >= 2 && track.contribution !== null)) return;
  throw new RuleError(`${when}, say where this track goes: two to four research questions that build into a three- to four-year `
    + 'programme, and the general contribution others will use (a theory, framework, measure, method, or intervention). '
    + 'Add them with track:update.');
}

const defaultTrackLimit = 2;

function readSettings(db: DatabaseSync): Settings {
  const row = z.object({ value: z.string() }).optional().parse(db.prepare('SELECT value FROM settings WHERE key = \'track_limit\'').get());
  return settingsSchema.parse({ trackLimit: row === undefined ? defaultTrackLimit : Number(row.value) });
}

function countTracks(db: DatabaseSync, status: string): number {
  return z.object({ count: z.number() }).parse(db.prepare(`SELECT count(*) AS count FROM tracks WHERE status = ? AND kind = 'question'
    AND origin = 'agent'`).get(status)).count;
}

function runningCount(db: DatabaseSync): number { return countTracks(db, 'running'); }

function clipRefs(text: string | null | undefined): number[] {
  return [...(text ?? '').matchAll(/\[c(\d+)\]/g)].map((match) => Number(match[1]));
}

function assertRefs(db: DatabaseSync, trackId: number, texts: readonly (string | null | undefined)[]): void {
  const known = new Set(readClips(db, 'WHERE track_id = ?', trackId).map((clip) => clip.id));
  for (const ref of texts.flatMap(clipRefs)) {
    if (!known.has(ref)) throw new RuleError(`[c${String(ref)}] is not a cutout in this track. Cite cutouts of this track as [c<id>].`);
  }
}

function assertCapacity(db: DatabaseSync, track: Track): void {
  if (track.kind !== 'question' || track.origin !== 'agent' || track.status === 'running') return;
  const { trackLimit } = readSettings(db);
  const running = runningCount(db);
  if (running >= trackLimit) {
    throw new RuleError(`${String(running)} of ${String(trackLimit)} allowed tracks are already running. Pause or finish one, or ask `
      + 'the student to raise the limit.');
  }
}

function logEvent(db: DatabaseSync, trackId: number, actor: 'agent' | 'student', kind: string, text: string): void {
  db.prepare('INSERT INTO track_events (track_id, actor, kind, text, created_at) VALUES (?, ?, ?, ?, ?)').run(trackId, actor, kind, text, now());
}

export function getSettings(workspace: string): Settings {
  return withDatabase(workspace, (db) => transaction(db, () => readSettings(db)));
}

export function updateSettings(workspace: string, input: unknown): Settings {
  const patch = settingsPatchSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (patch.trackLimit !== undefined) {
      db.prepare('INSERT INTO settings (key, value) VALUES (\'track_limit\', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
        .run(String(patch.trackLimit));
    }
    return readSettings(db);
  }, 'BEGIN IMMEDIATE'));
}

function readTrack(db: DatabaseSync, id: number): Track {
  const [track] = readTracks(db, 'WHERE id = ?', id);
  if (track === undefined) throw new NotFoundError(`No track with id ${String(id)}.`);
  return track;
}

const clipRow = z.object({
  id: z.number(), source_id: z.number(), track_id: z.number().nullable(), kind: z.string(), quote: z.string(),
  page: z.number().nullable(), context_before: z.string(), context_after: z.string(), note: z.string().nullable(), created_at: z.string(),
});

function readClips(db: DatabaseSync, where: string, ...parameters: number[]): Clip[] {
  return z.array(clipRow).parse(db.prepare(`SELECT clips.* FROM clips ${where} ORDER BY clips.id`).all(...parameters))
    .map((row) => clipSchema.parse({
      id: row.id, sourceId: row.source_id, trackId: row.track_id, kind: row.kind, quote: row.quote, page: row.page,
      before: row.context_before, after: row.context_after, note: row.note, createdAt: row.created_at,
    }));
}

export function readClipsById(db: DatabaseSync, ids: readonly number[]): Clip[] {
  return ids.length === 0 ? [] : readClips(db, `WHERE clips.id IN (${ids.map(() => '?').join(', ')})`, ...ids);
}

function readDetail(db: DatabaseSync, id: number): TrackDetail {
  const track = readTrack(db, id);
  const links = z.array(z.object({
    source_id: z.number(), role: z.string(), note: z.string().nullable(), verdict: z.string().nullable(),
    assessment: z.string().nullable(), assessed_at: z.string().nullable(),
  })).parse(db.prepare(`SELECT source_id, role, note, verdict, assessment, assessed_at FROM track_sources WHERE track_id = ?
    ORDER BY assessed_at IS NULL, assessed_at, rowid`).all(id))
    .map((row) => trackSourceSchema.parse({
      sourceId: row.source_id, role: row.role, note: row.note, verdict: row.verdict, assessment: row.assessment, assessedAt: row.assessed_at,
    }));
  const clips = readClips(db, 'WHERE track_id = ?', id);
  const ids = [...new Set([...links.map((link) => link.sourceId), ...clips.map((clip) => clip.sourceId)])];
  const sources = readSources(db, 'WHERE target_id = ? ORDER BY year, id', track.targetId).filter((source) => ids.includes(source.id));
  const events = z.array(z.object({ id: z.number(), track_id: z.number(), actor: z.string(), kind: z.string(), text: z.string(), created_at: z.string() }))
    .parse(db.prepare('SELECT * FROM track_events WHERE track_id = ? ORDER BY id').all(id))
    .map((row) => trackEventSchema.parse({ id: row.id, trackId: row.track_id, actor: row.actor, kind: row.kind, text: row.text, createdAt: row.created_at }));
  return { track, sources, links, clips, events };
}

function cite(source: Source): string {
  const author = source.authors[0]?.split(' ').at(-1) ?? source.title;
  return `${author}${source.authors.length > 1 ? ' et al.' : ''} ${String(source.year ?? 'n.d.')}`;
}

function exportTrack(workspace: string, db: DatabaseSync, id: number): void {
  const detail = readDetail(db, id);
  const target = z.object({ id: z.number(), professor: z.string() }).parse(
    db.prepare('SELECT id, professor FROM targets WHERE id = ?').get(detail.track.targetId));
  const folder = ensureTargetFolders(workspace, target);
  const byId = new Map(detail.sources.map((source) => [source.id, source]));
  const quote = (clip: Clip): string[] => [`> ${clip.quote}`, `> — [c${String(clip.id)}] ${clip.kind}${clip.page === null ? '' : `, p. ${String(clip.page)}`}`,
    ...(clip.note === null ? [] : ['', clip.note]), ''];
  const assessed = detail.links.filter((link) => link.verdict !== null);
  const lines = [
    `# ${detail.track.title}`, '',
    `**Hypothesis:** ${detail.track.question}`, '',
    `Origin: ${detail.track.origin} · Status: ${detail.track.status} · Updated: ${detail.track.updatedAt}`, '',
    ...(detail.track.prompt !== null && detail.track.status === 'awaiting' ? ['## Waiting for you', '', detail.track.prompt, ''] : []),
    '## Why this track', '', detail.track.rationale ?? '_Not recorded._', '',
    '## Where this goes', '',
    ...(detail.track.researchQuestions.length === 0 ? ['_No research questions yet._']
      : detail.track.researchQuestions.map((question, index) => `${String(index + 1)}. ${question}`)), '',
    `Contribution: ${detail.track.contribution ?? '_Not stated yet._'}`, '',
    ...(detail.track.prediction === null && detail.track.killCriterion === null ? [] : ['## The guess', '',
      `Predicted chance of surviving: ${detail.track.prediction === null ? 'not recorded' : `${String(detail.track.prediction)}%`}`, '',
      `Kill criterion: ${detail.track.killCriterion ?? '_Not recorded._'}`, '',
      `Seeds: ${detail.track.control ? 'none (a control guess, written without the seed library)' : detail.track.seedIds.length === 0 ? 'none'
        : detail.track.seedIds.map((seed) => `#${String(seed)}`).join(', ')}`, '']),
    '## Where it stands', '', ...(detail.track.stopReason === null ? [] : [`Stopped: ${detail.track.stopReason}`, '']),
    ...(detail.track.killReason === null ? [] : [`Kill reason: ${detail.track.killReason}`, '']),
    ...(detail.track.score === null ? [] : [`Score: ${String(detail.track.score.total)}/15 (novelty ${String(detail.track.score.novelty)}, `
      + `depth ${String(detail.track.score.depth)}, lab fit ${String(detail.track.score.labFit)}, student fit `
      + `${String(detail.track.score.studentFit)}, feasibility ${String(detail.track.score.feasibility)}) by ${detail.track.score.reviewer}`,
    '', detail.track.score.rationale, '']),
    `Next: ${detail.track.nextSteps ?? '_Not recorded._'}`, '',
    '## Report', '',
    ...assessed.flatMap((link, index) => {
      const source = byId.get(link.sourceId);
      if (source === undefined) return [];
      const cutouts = detail.clips.filter((clip) => clip.sourceId === source.id);
      return [`### ${String(index + 1)}. ${cite(source)} — ${source.title}`, '',
        `Verdict: **${link.verdict ?? ''}** · ${source.status}${source.filePath === null ? '' : ` · ${source.filePath}`}`, '',
        ...cutouts.flatMap(quote), `**What this means:** ${link.assessment ?? ''}`, ''];
    }),
    '## Conclusion', '', detail.track.summary ?? '_No conclusion yet._', '',
    '## Papers', '',
    ...detail.links.map((link) => {
      const source = byId.get(link.sourceId);
      return source === undefined ? '' : `- [${link.role}] ${cite(source)}, “${source.title}” (${source.status}${link.verdict === null ? '' : `, ${link.verdict}`})`;
    }), '',
    '## Log', '',
    ...detail.events.map((event) => `- ${event.createdAt.slice(0, 16).replace('T', ' ')} ${event.actor} ${event.kind}: ${event.text}`),
    '',
  ];
  const tracksFolder = join(workspace, folder, 'tracks');
  const names = [`${String(id)}-${slug(detail.track.title)}.md`, `${String(id)}-${slug(detail.track.title)}-brief.md`];
  for (const name of readdirSync(tracksFolder)) {
    if (name.startsWith(`${String(id)}-`) && !names.includes(name)) rmSync(join(tracksFolder, name));
  }
  writeFileSync(join(tracksFolder, names[0] ?? ''), lines.join('\n'));
  if (detail.track.brief !== null) {
    writeFileSync(join(tracksFolder, names[1] ?? ''),
      [`# Research brief: ${detail.track.title}`, '', '_For discussion, not for submission. The student writes the proposal._', '',
        detail.track.brief, ''].join('\n'));
  }
  exportSummary(workspace, db, detail.track.targetId, folder);
}

const statusOrder = ['strong', 'awaiting', 'running', 'proposed', 'paused', 'dropped'];

function exportSummary(workspace: string, db: DatabaseSync, targetId: number, folder: string): void {
  const tracks = readTracks(db, 'WHERE target_id = ? ORDER BY id', targetId)
    .sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.id - b.id);
  const lines = ['# Research summary', '', `${String(tracks.length)} track${tracks.length === 1 ? '' : 's'} explored.`, '',
    ...tracks.flatMap((track) => [`## ${String(track.id)}. ${track.title} — ${track.status}`
      + (track.score === null ? '' : ` · ${String(track.score.total)}/15`), '', `**Question:** ${track.question}`, '',
      ...track.researchQuestions.map((question, index) => `RQ${String(index + 1)}: ${question}`),
      ...(track.researchQuestions.length === 0 ? [] : ['']),
      ...(track.summary === null ? [] : [track.summary, '']), ...(track.stopReason === null ? [] : [`Stopped: ${track.stopReason}`, '']),
      ...(track.brief === null ? [] : [`Research brief: tracks/${String(track.id)}-${slug(track.title)}-brief.md`, ''])])];
  writeFileSync(join(workspace, folder, 'summary.md'), lines.join('\n'));
}

export function setBrief(workspace: string, id: number, input: unknown): Track {
  const { brief } = trackBriefSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const track = readTrack(db, id);
    if (track.status !== 'strong') throw new RuleError('Write a research brief only for a track marked strong.');
    if (clipRefs(brief).length < 3) throw new RuleError('Ground the brief in at least three cutouts, cited as [c<id>].');
    assertRefs(db, id, [brief]);
    db.prepare('UPDATE tracks SET brief = ?, updated_at = ? WHERE id = ?').run(brief, now(), id);
    logEvent(db, id, 'agent', 'note', 'Wrote a research brief for discussion.');
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function scoreTrack(workspace: string, id: number, input: unknown): Track {
  const score = trackScoreInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const track = readTrack(db, id);
    if (track.kind !== 'question') throw new RuleError('Only question tracks are scored.');
    if (!concluded.has(track.status)) throw new RuleError('Score a track once it has concluded: strong, paused, or dropped.');
    if (readClips(db, 'WHERE track_id = ?', id).length > 0 && clipRefs(score.rationale).length === 0) {
      throw new RuleError('Cite the cutouts behind the scores as [c<id>] in `rationale`.');
    }
    assertRefs(db, id, [score.rationale]);
    const total = score.novelty + score.depth + score.labFit + score.studentFit + score.feasibility;
    db.prepare('UPDATE tracks SET score = ? WHERE id = ?').run(JSON.stringify(trackScoreSchema.parse({ ...score, total, scoredAt: now() })), id);
    logEvent(db, id, 'agent', 'score', `Scored ${String(total)}/15 by ${score.reviewer}.`);
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function listTracks(workspace: string, targetId: number): Track[] {
  return withDatabase(workspace, (db) => transaction(db, () => {
    requireTarget(db, targetId);
    return readTracks(db, 'WHERE target_id = ? ORDER BY id', targetId);
  }));
}

export function getTrackDetail(workspace: string, id: number): TrackDetail {
  return withDatabase(workspace, (db) => transaction(db, () => readDetail(db, id)));
}

export function addTrack(workspace: string, input: unknown): Track {
  const track = trackInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (db.prepare('SELECT 1 FROM targets WHERE id = ?').get(track.targetId) === undefined) {
      throw new NotFoundError(`No target with id ${String(track.targetId)}.`);
    }
    if (track.kind === 'frontier' && readTracks(db, 'WHERE target_id = ? AND kind = \'frontier\'', track.targetId).length > 0) {
      throw new RuleError('This target already has a frontier track; extend it instead.');
    }
    if (track.ideaId !== null && db.prepare('SELECT 1 FROM ideas WHERE id = ?').get(track.ideaId) === undefined) {
      throw new NotFoundError(`No idea with id ${String(track.ideaId)}.`);
    }
    if (track.origin === 'agent' && track.kind === 'question') {
      const pending = z.array(z.object({ id: z.number() })).parse(db.prepare(`SELECT id FROM ideas WHERE id NOT IN
        (SELECT idea_id FROM tracks WHERE idea_id IS NOT NULL AND target_id = ?)`).all(track.targetId));
      if (pending.length > 0) {
        throw new RuleError(`Open tracks for the student’s ideas first (idea ${pending.map((idea) => String(idea.id)).join(', ')}).`);
      }
      const { trackLimit } = readSettings(db);
      if (countTracks(db, 'proposed') >= trackLimit) {
        throw new RuleError(`${String(trackLimit)} proposed tracks already await the student’s approval; that is one round.`);
      }
    }
    const batch = openBatch(db, track.targetId);
    if (track.seedIds !== undefined) assertSeeds(db, track.targetId, track.seedIds);
    const stamp = now();
    const id = Number(db.prepare(`INSERT INTO tracks (target_id, kind, origin, idea_id, title, question, rationale, research_questions,
      contribution, batch_id, prediction, kill_criterion, seed_ids, control, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`).run(track.targetId, track.kind,
      track.origin, track.ideaId, track.title, track.question, track.rationale,
      track.researchQuestions === undefined ? null : JSON.stringify(track.researchQuestions), track.contribution ?? null, batch.id,
      track.prediction ?? null, track.killCriterion ?? null, track.seedIds === undefined ? null : JSON.stringify([...new Set(track.seedIds)]),
      track.control ? 1 : null, stamp, stamp).lastInsertRowid);
    logEvent(db, id, 'agent', 'note', track.origin === 'student'
      ? 'Opened from the student’s idea; it starts when the student approves it.'
      : 'Proposed by the agent; waiting for the student’s approval.');
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

function assertStartable(db: DatabaseSync, track: Track): void {
  if (track.origin !== 'agent' || track.kind !== 'question' || track.status !== 'proposed') return;
  const detail = readDetail(db, track.id);
  const professor = z.object({ professor: z.string() }).parse(db.prepare('SELECT professor FROM targets WHERE id = ?').get(track.targetId)).professor;
  const surname = professor.trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
  const fromLab = detail.sources.some((source) => source.authors.some((author) => author.toLowerCase().includes(surname)));
  if (!fromLab) throw new RuleError(`Link at least one of ${professor}’s own papers first, so the track builds on the lab’s work.`);
  const mine = new Set(detail.links.map((link) => link.sourceId));
  const others = readTracks(db, 'WHERE target_id = ? AND id != ? AND kind = \'question\' AND status != \'proposed\'', track.targetId, track.id);
  for (const other of others) {
    const shared = readDetail(db, other.id).links.filter((link) => mine.has(link.sourceId)).length;
    if (mine.size >= 2 && shared / mine.size > 0.5) {
      throw new RuleError(`${String(shared)} of this track’s ${String(mine.size)} papers are already read for track ${String(other.id)} `
        + `(“${other.title}”). Choose a direction that reads different work.`);
    }
  }
}

export function getOverview(workspace: string, targetId: number): unknown {
  return withDatabase(workspace, (db) => transaction(db, () => {
    requireTarget(db, targetId);
    return readTracks(db, 'WHERE target_id = ? ORDER BY id', targetId).map((track) => {
    const detail = readDetail(db, track.id);
    return {
      id: track.id, origin: track.origin, kind: track.kind, status: track.status, title: track.title, question: track.question,
      researchQuestions: track.researchQuestions, contribution: track.contribution,
      batch: batchRows(db, 'WHERE id = ?', track.batchId ?? 0)[0]?.number ?? null, prediction: track.prediction,
      killCriterion: track.killCriterion, killReason: track.killReason, seedIds: track.seedIds, score: track.score?.total ?? null,
      stopReason: track.stopReason, verdicts: detail.links.flatMap((link) => link.verdict === null ? [] : [link.verdict]),
      papers: detail.sources.map((source) => `${String(source.id)}: ${cite(source)} — ${source.title.slice(0, 80)}`),
      studentSaid: detail.events.filter((event) => event.actor === 'student').map((event) => event.text),
    };
    });
  }));
}

export function approveTrack(workspace: string, id: number, input: unknown): Track {
  const { studentSaid } = trackApprovalSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const track = readTrack(db, id);
    if (track.status !== 'proposed') throw new RuleError(`Only proposed tracks are approved; this one is ${track.status}.`);
    assertGuess(db, track, 'Before it starts');
    assertStartable(db, track);
    assertCapacity(db, track);
    db.prepare('UPDATE tracks SET status = \'running\', stop_reason = NULL, prompt = NULL, updated_at = ? WHERE id = ?').run(now(), id);
    markSeedsUsed(db, track.seedIds);
    logEvent(db, id, 'student', 'decision', `Approved in chat: “${studentSaid}”`);
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

const stopping = new Set(['awaiting', 'paused', 'dropped', 'strong']);

function assertVerdictReady(db: DatabaseSync, detail: TrackDetail, status: string, conclusion: string | null): void {
  const assessed = detail.links.filter((link) => link.verdict !== null && link.verdict !== 'unrelated');
  if (status === 'strong') {
    const fullyRead = assessed.some((link) => detail.sources.find((source) => source.id === link.sourceId)?.status === 'full');
    if (assessed.length < 3 || !fullyRead) {
      throw new RuleError('A strong track needs at least three assessed papers (track:assess), one of them read in full.');
    }
  }
  if (status === 'dropped' && !assessed.some((link) => link.verdict === 'answers' || link.verdict === 'weak' || link.verdict === 'challenges')) {
    throw new RuleError('Drop a track only after assessing a paper that answers, challenges, or weakens it (track:assess).');
  }
  if ((status === 'strong' || status === 'dropped') && clipRefs(conclusion).length === 0) {
    throw new RuleError('Cite the decisive cutouts as [c<id>] in the conclusion (`summary` or `stopReason`).');
  }
  assertRefs(db, detail.track.id, [conclusion]);
}

export function assessSource(workspace: string, trackId: number, input: unknown): TrackDetail {
  const assessment = trackAssessmentSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const detail = readDetail(db, trackId);
    const source = detail.sources.find((item) => item.id === assessment.sourceId);
    if (source === undefined || !detail.links.some((link) => link.sourceId === assessment.sourceId)) {
      throw new RuleError('Link the paper to this track first (track:link).');
    }
    const cutouts = detail.clips.filter((clip) => clip.sourceId === source.id);
    if (cutouts.length === 0) throw new RuleError('Cut out the passages this assessment rests on first (clip:add with this track).');
    if (assessment.verdict === 'answers' || assessment.verdict === 'weak' || assessment.verdict === 'challenges') {
      if (source.status !== 'full' && source.status !== 'partial') {
        throw new RuleError('Read the methods and results before this verdict; an abstract is not enough. Mark the reading with source:status.');
      }
      if (!cutouts.some((clip) => clip.kind === 'finding' || clip.kind === 'setup' || clip.kind === 'limitation')) {
        throw new RuleError('This verdict needs a cutout of the setup, a measured finding, or a limitation.');
      }
    }
    const refs = clipRefs(assessment.assessment);
    if (!refs.some((ref) => cutouts.some((clip) => clip.id === ref))) {
      throw new RuleError(`Cite at least one cutout of this paper as [c<id>] (available: ${cutouts.map((clip) => `[c${String(clip.id)}]`).join(' ')}).`);
    }
    assertRefs(db, trackId, [assessment.assessment]);
    db.prepare('UPDATE track_sources SET verdict = ?, assessment = ?, assessed_at = ? WHERE track_id = ? AND source_id = ?')
      .run(assessment.verdict, assessment.assessment, now(), trackId, source.id);
    logEvent(db, trackId, 'agent', 'reading', `Assessed ${cite(source)}: ${assessment.verdict}.`);
    db.prepare('UPDATE tracks SET updated_at = ? WHERE id = ?').run(now(), trackId);
    exportTrack(workspace, db, trackId);
    return readDetail(db, trackId);
  }, 'BEGIN IMMEDIATE'));
}

export function updateTrack(workspace: string, id: number, input: unknown, expected?: { updatedAt: string }): Track {
  const patch = trackPatchSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const current = readTrack(db, id);
    if (expected !== undefined && expected.updatedAt !== current.updatedAt) throw new ConflictError('track');
    const status = patch.status ?? current.status;
    const changed = status !== current.status;
    if (changed && status === 'running') {
      if (current.status === 'proposed') {
        throw new RuleError('A proposed track starts only after the student approves it in the app, or in chat (record it with track:approve).');
      }
      assertCapacity(db, current);
    }
    if (changed && stopping.has(status) && (patch.stopReason ?? null) === null) {
      throw new RuleError('Say where the track stopped and why in `stopReason`.');
    }
    if ((patch.prediction !== undefined || patch.killCriterion !== undefined || patch.seedIds !== undefined) && current.status !== 'proposed') {
      throw new RuleError('A guess’s prediction, kill criterion and seeds are fixed once it starts, so outcomes stay comparable with guesses.');
    }
    if (patch.seedIds !== undefined) assertSeeds(db, current.targetId, patch.seedIds);
    const killReason = status === 'paused' || status === 'dropped' ? patch.killReason ?? current.killReason : null;
    if (patch.killReason !== undefined && killReason === null) throw new RuleError('A kill reason applies only to paused or dropped tracks.');
    if (changed && killReason === null && current.kind === 'question' && (status === 'paused' || status === 'dropped')) {
      throw new RuleError('Say why the guess stopped with a `killReason` (research:schema lists them).');
    }
    assertRefs(db, id, [patch.rationale, patch.summary, patch.stopReason, patch.nextSteps]);
    const researchQuestions = patch.researchQuestions ?? current.researchQuestions;
    const contribution = patch.contribution ?? current.contribution;
    if (changed && status === 'strong') assertProgramme({ kind: current.kind, researchQuestions, contribution }, 'Before marking it strong');
    if (changed && (status === 'strong' || status === 'dropped') && current.status !== 'proposed') {
      assertVerdictReady(db, readDetail(db, id), status, `${patch.summary ?? current.summary ?? ''} ${patch.stopReason ?? ''}`);
    }
    const prompt = status === 'running' ? null : patch.prompt === undefined ? current.prompt : patch.prompt;
    if (status === 'awaiting' && prompt === null) throw new RuleError('Set `prompt` to the question the student should answer.');
    const stopReason = status === 'running' ? null : patch.stopReason === undefined ? current.stopReason : patch.stopReason;
    const seedIds = patch.seedIds ?? current.seedIds;
    db.prepare(`UPDATE tracks SET title = ?, question = ?, rationale = ?, status = ?, summary = ?, stop_reason = ?, next_steps = ?,
      prompt = ?, research_questions = ?, contribution = ?, prediction = ?, kill_criterion = ?, seed_ids = ?, kill_reason = ?,
      updated_at = ? WHERE id = ?`).run(
      patch.title ?? current.title, patch.question ?? current.question, patch.rationale ?? current.rationale, status,
      patch.summary === undefined ? current.summary : patch.summary, stopReason,
      patch.nextSteps === undefined ? current.nextSteps : patch.nextSteps, prompt,
      researchQuestions.length === 0 ? null : JSON.stringify(researchQuestions), contribution, patch.prediction ?? current.prediction,
      patch.killCriterion ?? current.killCriterion, seedIds.length === 0 ? null : JSON.stringify([...new Set(seedIds)]), killReason, now(), id);
    if (changed) logEvent(db, id, 'agent', 'decision', `Status ${current.status} → ${status}.${stopReason === null ? '' : ` ${stopReason}`}`);
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function removeTrack(workspace: string, id: number): { removed: number } {
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (db.prepare('DELETE FROM tracks WHERE id = ?').run(id).changes === 0) throw new NotFoundError(`No track with id ${String(id)}.`);
    return { removed: id };
  }, 'BEGIN IMMEDIATE'));
}

export function decideTrack(workspace: string, id: number, decision: 'continue' | 'pause' | 'drop', note: string | null): Track {
  const status = { continue: 'running', pause: 'paused', drop: 'dropped' }[decision];
  const reason = note === null || note.trim() === '' ? null : note.trim();
  return withDatabase(workspace, (db) => transaction(db, () => {
    const track = readTrack(db, id);
    const starting = status === 'running' && track.status === 'proposed';
    if (starting) assertGuess(db, track, 'Before it starts');
    if (status === 'running') { assertStartable(db, track); assertCapacity(db, track); }
    if (starting) markSeedsUsed(db, track.seedIds);
    const stopReason = status === 'running' ? null : reason ?? `The student chose to ${decision} this track.`;
    const killReason = status === 'running' || track.kind !== 'question' ? null : 'student-choice';
    db.prepare('UPDATE tracks SET status = ?, prompt = NULL, stop_reason = ?, kill_reason = ?, updated_at = ? WHERE id = ?')
      .run(status, stopReason, killReason, now(), id);
    logEvent(db, id, 'student', 'decision', `${track.status === 'proposed' && status === 'running' ? 'Student approved the track.'
      : `Student chose to ${decision}.`}${reason === null ? '' : ` ${reason}`}`);
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function linkSource(workspace: string, trackId: number, input: unknown): TrackDetail {
  const link = trackLinkSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const track = readTrack(db, trackId);
    if (readSource(db, link.sourceId).targetId !== track.targetId) throw new RuleError('The source belongs to another target.');
    db.prepare(`INSERT INTO track_sources (track_id, source_id, role, note) VALUES (?, ?, ?, ?)
      ON CONFLICT (track_id, source_id) DO UPDATE SET role = excluded.role, note = excluded.note`)
      .run(trackId, link.sourceId, link.role, link.note);
    db.prepare('UPDATE tracks SET updated_at = ? WHERE id = ?').run(now(), trackId);
    exportTrack(workspace, db, trackId);
    return readDetail(db, trackId);
  }, 'BEGIN IMMEDIATE'));
}

export function unlinkSource(workspace: string, trackId: number, sourceId: number): TrackDetail {
  return withDatabase(workspace, (db) => transaction(db, () => {
    db.prepare('DELETE FROM track_sources WHERE track_id = ? AND source_id = ?').run(trackId, sourceId);
    db.prepare('UPDATE tracks SET updated_at = ? WHERE id = ?').run(now(), trackId);
    exportTrack(workspace, db, trackId);
    return readDetail(db, trackId);
  }, 'BEGIN IMMEDIATE'));
}

export function addEvent(workspace: string, trackId: number, input: unknown): TrackDetail {
  const event = trackEventInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    readTrack(db, trackId);
    logEvent(db, trackId, 'agent', event.kind, event.text);
    db.prepare('UPDATE tracks SET updated_at = ? WHERE id = ?').run(now(), trackId);
    exportTrack(workspace, db, trackId);
    return readDetail(db, trackId);
  }, 'BEGIN IMMEDIATE'));
}

export function addClip(workspace: string, input: unknown): Clip {
  const clip = clipInputSchema.parse(input);
  const source = withDatabase(workspace, (db) => transaction(db, () => readSource(db, clip.sourceId)));
  const pages = sourcePages(workspace, source);
  const found = locateQuote(pages, clip.quote, source.kind === 'paper');
  if (found === null) {
    throw new RuleError('The quote does not occur in the saved text of this source. Copy the exact words (check source:text).');
  }
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (clip.trackId !== null && readTrack(db, clip.trackId).targetId !== source.targetId) {
      throw new RuleError('The track belongs to another target.');
    }
    const id = Number(db.prepare(`INSERT INTO clips (source_id, track_id, kind, quote, page, context_before, context_after, note,
      created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(clip.sourceId, clip.trackId, clip.kind, found.quote, found.page,
      found.before, found.after, clip.note, now()).lastInsertRowid);
    if (clip.trackId !== null) {
      db.prepare('INSERT OR IGNORE INTO track_sources (track_id, source_id, role) VALUES (?, ?, \'supporting\')').run(clip.trackId, clip.sourceId);
      db.prepare('UPDATE tracks SET updated_at = ? WHERE id = ?').run(now(), clip.trackId);
      exportTrack(workspace, db, clip.trackId);
    }
    const [saved] = readClips(db, 'WHERE id = ?', id);
    if (saved === undefined) throw new NotFoundError('The clip was not saved.');
    return saved;
  }, 'BEGIN IMMEDIATE'));
}

export function removeClip(workspace: string, id: number): { removed: number } {
  return withDatabase(workspace, (db) => transaction(db, () => {
    const [clip] = readClips(db, 'WHERE id = ?', id);
    if (clip === undefined) throw new NotFoundError(`No clip with id ${String(id)}.`);
    if (clip.trackId !== null) {
      const detail = readDetail(db, clip.trackId);
      const texts = [detail.track.rationale, detail.track.summary, detail.track.stopReason, detail.track.nextSteps,
        ...detail.links.map((link) => link.assessment)];
      if (texts.some((text) => clipRefs(text).includes(id))) {
        throw new RuleError(`[c${String(id)}] is cited in this track’s report; remove the citation before removing the cutout.`);
      }
    }
    db.prepare('DELETE FROM clips WHERE id = ?').run(id);
    if (clip.trackId !== null) exportTrack(workspace, db, clip.trackId);
    return { removed: id };
  }, 'BEGIN IMMEDIATE'));
}

export function listClips(workspace: string, filter: { targetId?: number; sourceId?: number; trackId?: number }): Clip[] {
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (filter.trackId !== undefined) return readClips(db, 'WHERE track_id = ?', filter.trackId);
    if (filter.sourceId !== undefined) return readClips(db, 'WHERE source_id = ?', filter.sourceId);
    if (filter.targetId !== undefined) {
      requireTarget(db, filter.targetId);
      return readClips(db, 'JOIN sources ON sources.id = clips.source_id WHERE sources.target_id = ?', filter.targetId);
    }
    throw new RuleError('Filter clips by target, source, or track.');
  }));
}

export function getResearch(workspace: string, targetId: number): Research {
  return withDatabase(workspace, (db) => transaction(db, () => {
    requireTarget(db, targetId);
    return {
    sources: readSources(db, 'WHERE target_id = ? ORDER BY kind, year DESC, id', targetId),
    tracks: readTracks(db, 'WHERE target_id = ? ORDER BY id', targetId),
    clips: readClips(db, 'JOIN sources ON sources.id = clips.source_id WHERE sources.target_id = ?', targetId),
    author: getAuthor(db, targetId),
    settings: readSettings(db),
    running: runningCount(db),
    batches: readBatches(db, targetId),
    seeds: readSeeds(db, targetId).sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.strength - a.strength),
    categories: readCategories(db, targetId),
    };
  }));
}
