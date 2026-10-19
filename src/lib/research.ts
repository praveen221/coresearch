import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { ConflictError, NotFoundError } from './errors.ts';
import { ensureTargetFolders, slug } from './files.ts';
import { getAuthor, readSource, readSources, sourcePages } from './library.ts';
import { locateQuote } from './quote.ts';
import {
  clipInputSchema, clipSchema, ideaInputSchema, ideaSchema, trackEventInputSchema, trackEventSchema, trackInputSchema,
  trackLinkSchema, trackPatchSchema, trackSchema, trackSourceSchema,
} from './research-schema.ts';
import type { Clip, Idea, Research, Source, Track, TrackDetail } from './research-schema.ts';

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
  title: z.string(), question: z.string(), status: z.string(), summary: z.string().nullable(), prompt: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
});

function readTracks(db: DatabaseSync, where: string, ...parameters: number[]): Track[] {
  return z.array(trackRow).parse(db.prepare(`SELECT * FROM tracks ${where}`).all(...parameters)).map((row) => trackSchema.parse({
    id: row.id, targetId: row.target_id, kind: row.kind, origin: row.origin, ideaId: row.idea_id, title: row.title,
    question: row.question, status: row.status, summary: row.summary, prompt: row.prompt,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
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

function readDetail(db: DatabaseSync, id: number): TrackDetail {
  const track = readTrack(db, id);
  const links = z.array(z.object({ source_id: z.number(), role: z.string(), note: z.string().nullable() }))
    .parse(db.prepare('SELECT source_id, role, note FROM track_sources WHERE track_id = ? ORDER BY rowid').all(id))
    .map((row) => trackSourceSchema.parse({ sourceId: row.source_id, role: row.role, note: row.note }));
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
  const lines = [
    `# ${detail.track.title}`, '',
    `**Question:** ${detail.track.question}`, '',
    `Origin: ${detail.track.origin} · Status: ${detail.track.status} · Updated: ${detail.track.updatedAt}`, '',
    ...(detail.track.prompt !== null && detail.track.status === 'awaiting' ? ['## Waiting for you', '', detail.track.prompt, ''] : []),
    '## Draft', '', detail.track.summary ?? '_No draft yet._', '',
    '## Papers', '',
    ...detail.links.map((link) => {
      const source = byId.get(link.sourceId);
      return source === undefined ? '' : `- [${link.role}] ${cite(source)}, “${source.title}” (${source.status})`
        + `${source.filePath === null ? '' : ` — ${source.filePath}`}${link.note === null ? '' : ` — ${link.note}`}`;
    }), '',
    '## Evidence', '',
    ...detail.clips.flatMap((clip) => {
      const source = byId.get(clip.sourceId);
      const where = source === undefined ? '' : `${cite(source)}${clip.page === null ? '' : `, p. ${String(clip.page)}`}`;
      return [`> ${clip.quote}`, `> — ${where} [${clip.kind}]`, ...(clip.note === null ? [] : ['', clip.note]), ''];
    }),
    '## Log', '',
    ...detail.events.map((event) => `- ${event.createdAt.slice(0, 16).replace('T', ' ')} ${event.actor} ${event.kind}: ${event.text}`),
    '',
  ];
  writeFileSync(join(workspace, folder, 'tracks', `${String(id)}-${slug(detail.track.title)}.md`), lines.join('\n'));
}

export function listTracks(workspace: string, targetId: number): Track[] {
  return withDatabase(workspace, (db) => transaction(db, () => readTracks(db, 'WHERE target_id = ? ORDER BY id', targetId)));
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
    const stamp = now();
    const id = Number(db.prepare(`INSERT INTO tracks (target_id, kind, origin, idea_id, title, question, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(track.targetId, track.kind, track.origin, track.ideaId, track.title,
      track.question, track.status, stamp, stamp).lastInsertRowid);
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function updateTrack(workspace: string, id: number, input: unknown, expected?: { updatedAt: string }): Track {
  const patch = trackPatchSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const current = readTrack(db, id);
    if (expected !== undefined && expected.updatedAt !== current.updatedAt) throw new ConflictError('track');
    const status = patch.status ?? current.status;
    const prompt = patch.prompt === undefined ? current.prompt : patch.prompt;
    if (status === 'awaiting' && prompt === null) throw new Error('Set `prompt` to the question the student should answer.');
    db.prepare('UPDATE tracks SET title = ?, question = ?, status = ?, summary = ?, prompt = ?, updated_at = ? WHERE id = ?').run(
      patch.title ?? current.title, patch.question ?? current.question, status,
      patch.summary === undefined ? current.summary : patch.summary, prompt, now(), id);
    if (patch.status !== undefined && patch.status !== current.status) {
      db.prepare('INSERT INTO track_events (track_id, actor, kind, text, created_at) VALUES (?, \'agent\', \'decision\', ?, ?)')
        .run(id, `Status ${current.status} → ${patch.status}.`, now());
    }
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
  return withDatabase(workspace, (db) => transaction(db, () => {
    readTrack(db, id);
    db.prepare('UPDATE tracks SET status = ?, prompt = NULL, updated_at = ? WHERE id = ?').run(status, now(), id);
    db.prepare('INSERT INTO track_events (track_id, actor, kind, text, created_at) VALUES (?, \'student\', \'decision\', ?, ?)')
      .run(id, `Student chose to ${decision}.${note === null || note.trim() === '' ? '' : ` ${note.trim()}`}`, now());
    exportTrack(workspace, db, id);
    return readTrack(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function linkSource(workspace: string, trackId: number, input: unknown): TrackDetail {
  const link = trackLinkSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const track = readTrack(db, trackId);
    if (readSource(db, link.sourceId).targetId !== track.targetId) throw new Error('The source belongs to another target.');
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
    db.prepare('INSERT INTO track_events (track_id, actor, kind, text, created_at) VALUES (?, \'agent\', ?, ?, ?)')
      .run(trackId, event.kind, event.text, now());
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
    throw new Error('The quote does not occur in the saved text of this source. Copy the exact words (check source:text).');
  }
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (clip.trackId !== null && readTrack(db, clip.trackId).targetId !== source.targetId) {
      throw new Error('The track belongs to another target.');
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
      return readClips(db, 'JOIN sources ON sources.id = clips.source_id WHERE sources.target_id = ?', filter.targetId);
    }
    throw new Error('Filter clips by target, source, or track.');
  }));
}

export function getResearch(workspace: string, targetId: number): Research {
  return withDatabase(workspace, (db) => transaction(db, () => ({
    sources: readSources(db, 'WHERE target_id = ? ORDER BY kind, year DESC, id', targetId),
    tracks: readTracks(db, 'WHERE target_id = ? ORDER BY id', targetId),
    clips: readClips(db, 'JOIN sources ON sources.id = clips.source_id WHERE sources.target_id = ?', targetId),
    author: getAuthor(db, targetId),
  })));
}
