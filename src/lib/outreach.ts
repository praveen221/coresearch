import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { cvPages, locateInCv } from './cv.ts';
import { transaction, withDatabase } from './database.ts';
import { NotFoundError, RuleError } from './errors.ts';
import { readSources } from './library.ts';
import {
  collaboratorCiteSchema, cvFacets, facetSchema, fitInputSchema, fitSchema, pitchEditSchema, pitchInputSchema, pitchSchema, pitchStatusSchema,
  pitchWordLimit,
} from './outreach-schema.ts';
import type { Contact, CvCutout, Fit, MatchKind, OutreachRow, Pitch, TargetOutreach } from './outreach-schema.ts';
import { readClipsById } from './research.ts';
import { fitFacets, fitLabels } from './target-schema.ts';
import type { Target } from './target-schema.ts';
import { readTargets } from './targets.ts';

const pitchRow = z.object({
  target_id: z.number(), connections: z.string(), question: z.string(), question_check: z.string(), subject: z.string(), body: z.string(),
  status: z.string(), status_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
const paperRow = z.object({
  id: z.number(), title: z.string(), year: z.number().nullable(), venue: z.string().nullable(), url: z.string().nullable(), authors: z.string(),
});
const names = z.array(z.string());
const collaboratorRow = z.object({
  description: z.string(), cv_quote: z.string().nullable(), cv_page: z.number().nullable(), cv_before: z.string().nullable(),
  cv_after: z.string().nullable(), note: z.string().nullable(),
});
const fitRow = z.object({
  facet: z.enum(fitFacets), score: z.number().nullable(), finding: z.string(), reason: z.string(), evidence: z.string(), reviewer: z.string(),
  scored_at: z.string(),
});

export function wordCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function person(name: string): { last: string; first: string } {
  const parts = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/)
    .filter((part) => part !== '' && !['prof', 'professor', 'dr'].includes(part));
  return { last: parts.at(-1) ?? '', first: parts.length > 1 ? parts[0] ?? '' : '' };
}

function nameMatch(a: string, b: string): MatchKind | null {
  const left = person(a);
  const right = person(b);
  if (left.last === '' || left.last !== right.last || left.first.charAt(0) !== right.first.charAt(0)) return null;
  return left.first.length > 1 && left.first === right.first ? 'name' : 'initial';
}

function samePerson(a: string, b: string): boolean {
  return nameMatch(a, b) !== null;
}

function target(db: DatabaseSync, id: number): Target {
  const [found] = readTargets(db, id);
  if (found === undefined) throw new NotFoundError(`No target with id ${String(id)}.`);
  return found;
}

function readPitch(db: DatabaseSync, targetId: number): Pitch | null {
  const row = pitchRow.optional().parse(db.prepare('SELECT * FROM pitches WHERE target_id = ?').get(targetId));
  if (row === undefined) return null;
  const connections: unknown = JSON.parse(row.connections);
  return pitchSchema.parse({
    targetId: row.target_id, connections, question: row.question, questionCheck: row.question_check,
    subject: row.subject, body: row.body, words: wordCount(row.body), status: row.status, statusAt: row.status_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

function professorPapers(db: DatabaseSync, professor: Target): z.infer<typeof paperRow>[] {
  return z.array(paperRow).parse(db.prepare('SELECT id, title, year, venue, url, authors FROM sources WHERE target_id = ? AND kind = \'paper\'')
    .all(professor.id)).filter((paper) => names.parse(JSON.parse(paper.authors)).some((author) => samePerson(author, professor.professor)));
}

function cutout(row: z.infer<typeof collaboratorRow>): CvCutout | null {
  return row.cv_quote === null ? null : { quote: row.cv_quote, page: row.cv_page, before: row.cv_before ?? '', after: row.cv_after ?? '' };
}

function contacts(db: DatabaseSync, professor: Target): Contact[] {
  const papers = professorPapers(db, professor).map((paper) => ({ ...paper, names: names.parse(JSON.parse(paper.authors)) }));
  const collaborators = z.array(collaboratorRow).parse(db.prepare(`SELECT description, cv_quote, cv_page, cv_before, cv_after, note
    FROM collaborators ORDER BY id`).all());
  return collaborators.filter((row) => !samePerson(row.description, professor.professor)).map((row) => {
    const shared = papers.flatMap((paper) => {
      const collaboratorAs = paper.names.find((author) => samePerson(author, row.description));
      const professorAs = paper.names.find((author) => samePerson(author, professor.professor));
      if (collaboratorAs === undefined || professorAs === undefined) return [];
      return [{ sourceId: paper.id, title: paper.title, year: paper.year, venue: paper.venue, url: paper.url, authors: paper.names,
        collaboratorAs, professorAs, match: nameMatch(collaboratorAs, row.description) ?? 'initial' }];
    }).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    const match: MatchKind = shared.some((paper) => paper.match === 'name') ? 'name' : 'initial';
    return { collaborator: row.description, cv: cutout(row), note: row.note, match, papers: shared };
  }).filter((contact) => contact.papers.length > 0)
    .sort((a, b) => Number(b.match === 'name') - Number(a.match === 'name') || b.papers.length - a.papers.length);
}

export function sharedContacts(workspace: string, targetId: number): Contact[] {
  return withDatabase(workspace, (db) => transaction(db, () => contacts(db, target(db, targetId))));
}

export function citeCollaborator(workspace: string, input: unknown): { name: string; cv: CvCutout; note: string } {
  const cite = collaboratorCiteSchema.parse(input);
  const found = locateInCv(cvPages(workspace), cite.cvQuote);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const changed = db.prepare('UPDATE collaborators SET cv_quote = ?, cv_page = ?, cv_before = ?, cv_after = ?, note = ? WHERE description = ?')
      .run(found.quote, found.page, found.before, found.after, cite.note, cite.name).changes;
    if (changed === 0) throw new NotFoundError(`${cite.name} is not among the profile’s collaborators; add them with profile:update first.`);
    return { name: cite.name, cv: { quote: found.quote, page: found.page, before: found.before, after: found.after }, note: cite.note };
  }, 'BEGIN IMMEDIATE'));
}

function readFit(db: DatabaseSync, targetId: number): Fit {
  const rows = z.array(fitRow).parse(db.prepare('SELECT * FROM fit_facets WHERE target_id = ?').all(targetId))
    .sort((a, b) => fitFacets.indexOf(a.facet) - fitFacets.indexOf(b.facet));
  return fitSchema.parse(Object.fromEntries(rows.map((row) => {
    const evidence: unknown = JSON.parse(row.evidence);
    return [row.facet, facetSchema.parse({ score: row.score, finding: row.finding, reason: row.reason, evidence, reviewer: row.reviewer,
      scoredAt: row.scored_at })];
  })));
}

export function getFit(workspace: string, targetId: number): Fit {
  return withDatabase(workspace, (db) => transaction(db, () => { target(db, targetId); return readFit(db, targetId); }));
}

export function scoreFit(workspace: string, input: unknown): Fit {
  const fit = fitInputSchema.parse(input);
  const entries = fitFacets.flatMap((facet) => {
    const value = fit.facets[facet];
    return value === undefined ? [] : [{ facet, value }];
  });
  for (const { facet, value } of entries) {
    if (value.score === null || value.score < 2) continue;
    if (!value.evidence.some((item) => item.clipId !== null)) {
      throw new RuleError(`${fitLabels[facet]}: back a score of ${String(value.score)} with a cutout from their work.`);
    }
    if (cvFacets.includes(facet) && !value.evidence.some((item) => item.cvQuote !== null)) {
      throw new RuleError(`${fitLabels[facet]}: back a score of ${String(value.score)} with an exact quote from the CV.`);
    }
  }
  const quoted = entries.some(({ value }) => value.evidence.some((item) => item.cvQuote !== null));
  const pages = quoted ? cvPages(workspace) : [];
  const located = entries.map(({ facet, value }) => ({
    facet, value, evidence: value.evidence.map((item) => {
      const found = item.cvQuote === null ? null : locateInCv(pages, item.cvQuote);
      return { cv: found === null ? null : { quote: found.quote, page: found.page, before: found.before, after: found.after }, clipId: item.clipId,
        note: item.note };
    }),
  }));
  return withDatabase(workspace, (db) => transaction(db, () => {
    const professor = target(db, fit.targetId);
    const allowed = new Set([...professorPapers(db, professor).map((paper) => paper.id),
      ...z.array(z.object({ id: z.number() })).parse(db.prepare('SELECT id FROM sources WHERE target_id = ? AND kind = \'page\'').all(professor.id))
        .map((row) => row.id)]);
    for (const { evidence } of located) {
      for (const item of evidence) {
        if (item.clipId === null) continue;
        const clip = z.object({ source_id: z.number() }).optional().parse(db.prepare('SELECT source_id FROM clips WHERE id = ?').get(item.clipId));
        if (clip === undefined || !allowed.has(clip.source_id)) {
          throw new RuleError(`Cutout [c${String(item.clipId)}] is not from ${professor.professor}’s own papers or this target’s saved pages.`);
        }
      }
    }
    const stamp = new Date().toISOString();
    for (const { facet, value, evidence } of located) {
      db.prepare(`INSERT INTO fit_facets (target_id, facet, score, finding, reason, evidence, reviewer, scored_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (target_id, facet) DO UPDATE SET score = excluded.score, finding = excluded.finding, reason = excluded.reason,
        evidence = excluded.evidence, reviewer = excluded.reviewer, scored_at = excluded.scored_at`)
        .run(fit.targetId, facet, value.score, value.finding, value.reason, JSON.stringify(evidence), fit.reviewer, stamp);
    }
    return readFit(db, fit.targetId);
  }, 'BEGIN IMMEDIATE'));
}

export function targetOutreach(workspace: string, targetId: number): TargetOutreach {
  return withDatabase(workspace, (db) => transaction(db, () => {
    const professor = target(db, targetId);
    const pitch = readPitch(db, targetId);
    const fit = readFit(db, targetId);
    const found = contacts(db, professor);
    const clipIds = [...new Set([
      ...fitFacets.flatMap((facet) => fit[facet]?.evidence.flatMap((item) => item.clipId === null ? [] : [item.clipId]) ?? []),
      ...(pitch?.connections.map((connection) => connection.clipId) ?? []),
      ...[professor.openings.clipId, professor.deadline?.clipId ?? null].flatMap((id) => id === null ? [] : [id]),
      ...z.array(z.object({ id: z.number() })).parse(db.prepare(`SELECT clips.id FROM clips JOIN sources ON sources.id = clips.source_id
        WHERE sources.target_id = ? AND clips.track_id IS NULL AND clips.kind IN ('criteria', 'requirement')`).all(targetId)).map((row) => row.id),
    ])];
    const clips = readClipsById(db, clipIds);
    const sourceIds = [...new Set([...clips.map((clip) => clip.sourceId), ...found.flatMap((contact) => contact.papers.map((paper) => paper.sourceId))])];
    const sources = sourceIds.length === 0 ? [] : readSources(db, `WHERE id IN (${sourceIds.map(() => '?').join(', ')}) ORDER BY id`, ...sourceIds);
    return { pitch, contacts: found, fit, clips, sources };
  }));
}

export function getPitch(workspace: string, targetId: number): Pitch | null {
  return withDatabase(workspace, (db) => transaction(db, () => { target(db, targetId); return readPitch(db, targetId); }));
}

function assertLength(body: string): void {
  const words = wordCount(body);
  if (words > pitchWordLimit) throw new RuleError(`Keep the email under ${String(pitchWordLimit)} words; this one has ${String(words)}.`);
}

export function savePitch(workspace: string, input: unknown): Pitch {
  const pitch = pitchInputSchema.parse(input);
  assertLength(pitch.body);
  const pages = cvPages(workspace);
  const quotes = pitch.connections.map((connection) => locateInCv(pages, connection.cvQuote));
  return withDatabase(workspace, (db) => transaction(db, () => {
    const professor = target(db, pitch.targetId);
    if (professor.pitchHold !== null) throw new RuleError(`Drafting for ${professor.professor} is on hold: ${professor.pitchHold}`);
    if (professor.pathway !== 'pitch') {
      throw new RuleError(`${professor.professor} is on the proposal path: the student writes the proposal, so there is no outreach draft. `
        + 'Change the path with target:update if this programme admits through contact with a supervisor.');
    }
    const own = new Set(professorPapers(db, professor).map((paper) => paper.id));
    for (const connection of pitch.connections) {
      const clip = z.object({ source_id: z.number() }).optional().parse(db.prepare('SELECT source_id FROM clips WHERE id = ?').get(connection.clipId));
      if (clip === undefined || !own.has(clip.source_id)) {
        throw new RuleError(`Cutout [c${String(connection.clipId)}] is not from ${professor.professor}’s own papers in this library.`);
      }
    }
    const existing = readPitch(db, pitch.targetId);
    if (existing !== null && existing.status !== 'draft') throw new RuleError('This pitch has been sent; it can no longer be redrafted.');
    const stamp = new Date().toISOString();
    const connections = pitch.connections.map((connection, index) => ({
      cvQuote: quotes[index]?.quote ?? connection.cvQuote, cvPage: quotes[index]?.page ?? null, clipId: connection.clipId, note: connection.note,
    }));
    db.prepare(`INSERT INTO pitches (target_id, connections, question, question_check, subject, body, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?) ON CONFLICT (target_id) DO UPDATE SET connections = excluded.connections,
      question = excluded.question, question_check = excluded.question_check, subject = excluded.subject, body = excluded.body,
      updated_at = excluded.updated_at`).run(pitch.targetId, JSON.stringify(connections), pitch.question, pitch.questionCheck,
      pitch.subject, pitch.body, stamp, stamp);
    const saved = readPitch(db, pitch.targetId);
    if (saved === null) throw new NotFoundError('The pitch was not saved.');
    return saved;
  }, 'BEGIN IMMEDIATE'));
}

export function editPitch(workspace: string, targetId: number, input: unknown): Pitch {
  const edit = pitchEditSchema.parse(input);
  if (edit.body !== undefined) assertLength(edit.body);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const current = readPitch(db, targetId);
    if (current === null) throw new NotFoundError('There is no draft for this professor yet.');
    db.prepare('UPDATE pitches SET subject = ?, body = ?, updated_at = ? WHERE target_id = ?')
      .run(edit.subject ?? current.subject, edit.body ?? current.body, new Date().toISOString(), targetId);
    return readPitch(db, targetId) ?? current;
  }, 'BEGIN IMMEDIATE'));
}

export function setPitchStatus(workspace: string, targetId: number, input: unknown): Pitch {
  const { status } = pitchStatusSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const current = readPitch(db, targetId);
    if (current === null) throw new NotFoundError('There is no draft for this professor yet.');
    const stamp = new Date().toISOString();
    db.prepare('UPDATE pitches SET status = ?, status_at = ?, updated_at = ? WHERE target_id = ?').run(status, stamp, stamp, targetId);
    return readPitch(db, targetId) ?? current;
  }, 'BEGIN IMMEDIATE'));
}

export function listOutreach(workspace: string): OutreachRow[] {
  return withDatabase(workspace, (db) => transaction(db, () => readTargets(db).map((professor) => ({
    targetId: professor.id, professor: professor.professor, university: professor.university, region: professor.region,
    pathway: professor.pathway, openings: professor.openings.status, deadline: professor.deadline?.date ?? null,
    papers: z.object({ count: z.number() }).parse(db.prepare('SELECT count(*) AS count FROM sources WHERE target_id = ? AND kind = \'paper\'')
      .get(professor.id)).count,
    contacts: contacts(db, professor), pitch: readPitch(db, professor.id)?.status ?? null, hold: professor.pitchHold,
    notes: professor.notes, fit: professor.fit,
  }))));
}
