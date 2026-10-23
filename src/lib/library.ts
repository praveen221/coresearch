import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { parse } from 'node-html-parser';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { NotFoundError, RuleError } from './errors.ts';
import { ensureTargetFolders, paperFileName, slug } from './files.ts';
import { citationCounts as openAlexCounts } from './openalex.ts';
import type { Work } from './openalex.ts';
import { manualSourceSchema, paperRequestSchema, sourceFutureSchema, sourceSchema, sourceStatusInputSchema } from './research-schema.ts';
import { stripRunningLines } from './quote.ts';
import { citationCounts, openAccessCopies } from './semanticscholar.ts';
import type { Source } from './research-schema.ts';

const rowSchema = z.object({
  id: z.number(), target_id: z.number(), kind: z.string(), title: z.string(), url: z.string().nullable(),
  doi: z.string().nullable(), openalex_id: z.string().nullable(), year: z.number().nullable(), venue: z.string().nullable(),
  authors: z.string(), abstract: z.string().nullable(), pdf_urls: z.string(), file_path: z.string().nullable(),
  text_path: z.string().nullable(), page_count: z.number().nullable(), status: z.string(), status_note: z.string().nullable(),
  request_reason: z.string().nullable(), requested_at: z.string().nullable(), cited_by: z.number().nullable(),
  cited_at: z.string().nullable(), future_checked_at: z.string().nullable(), future_note: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
});
const stringsSchema = z.array(z.string());
const targetRowSchema = z.object({ id: z.number(), professor: z.string() });

export function readSources(db: DatabaseSync, where: string, ...parameters: (string | number)[]): Source[] {
  const rows = z.array(rowSchema).parse(db.prepare(`SELECT * FROM sources ${where}`).all(...parameters));
  const cites = z.array(z.object({ source_id: z.number(), cited_openalex_id: z.string() }))
    .parse(db.prepare('SELECT source_id, cited_openalex_id FROM citations').all());
  return rows.map((row) => sourceSchema.parse({
    id: row.id, targetId: row.target_id, kind: row.kind, title: row.title, url: row.url, doi: row.doi,
    openalexId: row.openalex_id, year: row.year, venue: row.venue, authors: stringsSchema.parse(JSON.parse(row.authors)),
    abstract: row.abstract, filePath: row.file_path, textPath: row.text_path, pageCount: row.page_count,
    status: row.status, statusNote: row.status_note, requestReason: row.request_reason, requestedAt: row.requested_at,
    citedBy: row.cited_by, citedAt: row.cited_at, futureCheckedAt: row.future_checked_at, futureNote: row.future_note,
    references: cites.filter((cite) => cite.source_id === row.id).map((cite) => cite.cited_openalex_id),
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export function readSource(db: DatabaseSync, id: number): Source {
  const [source] = readSources(db, 'WHERE id = ?', id);
  if (source === undefined) throw new NotFoundError(`No source with id ${String(id)}.`);
  return source;
}

function readTarget(db: DatabaseSync, id: number): { id: number; professor: string } {
  const row = targetRowSchema.optional().parse(db.prepare('SELECT id, professor FROM targets WHERE id = ?').get(id));
  if (row === undefined) throw new NotFoundError(`No target with id ${String(id)}.`);
  return row;
}

export function listSources(workspace: string, targetId: number): Source[] {
  return withDatabase(workspace, (db) => transaction(db, () => {
    readTarget(db, targetId);
    return readSources(db, 'WHERE target_id = ? ORDER BY kind, year DESC, id', targetId);
  }));
}

export function getSource(workspace: string, id: number): Source {
  return withDatabase(workspace, (db) => transaction(db, () => readSource(db, id)));
}

function titleKey(title: string): string { return slug(title, 12); }

export function savePaper(workspace: string, targetId: number, work: Work): { source: Source; added: boolean } {
  return withDatabase(workspace, (db) => transaction(db, () => {
    readTarget(db, targetId);
    const existing = readSources(db, 'WHERE target_id = ? AND kind = \'paper\'', targetId)
      .find((source) => source.openalexId === work.openalexId || titleKey(source.title) === titleKey(work.title));
    if (existing !== undefined) {
      const urls = stringsSchema.parse(JSON.parse(z.object({ pdf_urls: z.string() })
        .parse(db.prepare('SELECT pdf_urls FROM sources WHERE id = ?').get(existing.id)).pdf_urls));
      db.prepare('UPDATE sources SET pdf_urls = ?, abstract = coalesce(abstract, ?) WHERE id = ?')
        .run(JSON.stringify([...new Set([...urls, ...work.pdfUrls])]), work.abstract, existing.id);
      return { source: readSource(db, existing.id), added: false };
    }
    const now = new Date().toISOString();
    const taken = work.landingUrl !== null
      && db.prepare('SELECT 1 FROM sources WHERE target_id = ? AND kind = \'paper\' AND url = ?').get(targetId, work.landingUrl) !== undefined;
    const result = db.prepare(`INSERT INTO sources (target_id, kind, title, url, doi, openalex_id, year, venue, authors,
      abstract, pdf_urls, status, created_at, updated_at) VALUES (?, 'paper', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)`)
      .run(targetId, work.title, taken ? null : work.landingUrl, work.doi, work.openalexId, work.year, work.venue,
        JSON.stringify(work.authors), work.abstract, JSON.stringify(work.pdfUrls), now, now);
    const id = Number(result.lastInsertRowid);
    for (const cited of work.references) {
      db.prepare('INSERT OR IGNORE INTO citations (source_id, cited_openalex_id) VALUES (?, ?)').run(id, cited);
    }
    return { source: readSource(db, id), added: true };
  }, 'BEGIN IMMEDIATE'));
}

export function addManualSource(workspace: string, targetId: number, input: unknown): Source {
  const document = manualSourceSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    readTarget(db, targetId);
    const existing = readSources(db, 'WHERE target_id = ? AND kind = \'paper\'', targetId)
      .find((source) => source.url === document.url || titleKey(source.title) === titleKey(document.title));
    if (existing !== undefined) return existing;
    const now = new Date().toISOString();
    const id = Number(db.prepare(`INSERT INTO sources (target_id, kind, title, url, year, authors, abstract, pdf_urls, status, created_at,
      updated_at) VALUES (?, 'paper', ?, ?, ?, ?, ?, ?, 'unread', ?, ?)`).run(targetId, document.title, document.url, document.year,
      JSON.stringify(document.authors), document.abstract, JSON.stringify(document.pdfUrl === null ? [] : [document.pdfUrl]), now, now)
      .lastInsertRowid);
    return readSource(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function setAuthor(workspace: string, targetId: number, author: { id: string; name: string }): void {
  withDatabase(workspace, (db) => { transaction(db, () => {
    readTarget(db, targetId);
    db.prepare(`INSERT INTO target_authors (target_id, author_id, display_name) VALUES (?, ?, ?)
      ON CONFLICT (target_id) DO UPDATE SET author_id = excluded.author_id, display_name = excluded.display_name`)
      .run(targetId, author.id, author.name);
  }, 'BEGIN IMMEDIATE'); });
}

export function getAuthor(db: DatabaseSync, targetId: number): { id: string; name: string } | null {
  const row = z.object({ author_id: z.string(), display_name: z.string() }).optional()
    .parse(db.prepare('SELECT author_id, display_name FROM target_authors WHERE target_id = ?').get(targetId));
  return row === undefined ? null : { id: row.author_id, name: row.display_name };
}

const headers = { 'User-Agent': 'Coresearch (https://github.com/praveen221/coresearch)' };
const maxBytes = 60 * 1024 * 1024;

export async function extractPdf(bytes: Uint8Array): Promise<string[]> {
  const document = await getDocumentProxy(bytes);
  const { text } = await extractText(document, { mergePages: false });
  return text;
}

function storeText(workspace: string, db: DatabaseSync, source: Source, file: string, pages: string[], status: 'unread' | 'full'): Source {
  const base = file.replace(/\.[a-z]+$/, '');
  const textPath = source.kind === 'paper' ? base.replace(/papers\/([^/]+)$/, 'papers/text/$1.json') : `${base}.json`;
  writeFileSync(join(workspace, textPath), JSON.stringify(pages));
  db.prepare(`UPDATE sources SET file_path = ?, text_path = ?, page_count = ?, status = CASE WHEN status = 'inaccessible'
    THEN ? ELSE status END, status_note = CASE WHEN status = 'inaccessible' THEN NULL ELSE status_note END, updated_at = ?
    WHERE id = ?`).run(file, textPath, pages.length, status, new Date().toISOString(), source.id);
  return readSource(db, source.id);
}

export function addPdfCandidates(workspace: string, id: number, candidates: readonly string[]): void {
  withDatabase(workspace, (db) => {
    transaction(db, () => {
      const raw = z.object({ pdf_urls: z.string() }).parse(db.prepare('SELECT pdf_urls FROM sources WHERE id = ?').get(id));
      const urls = stringsSchema.parse(JSON.parse(raw.pdf_urls));
      db.prepare('UPDATE sources SET pdf_urls = ? WHERE id = ?').run(JSON.stringify([...new Set([...urls, ...candidates])]), id);
    }, 'BEGIN IMMEDIATE');
  });
}

export async function downloadPaper(workspace: string, id: number, lookup = true): Promise<Source> {
  const { source, urls, target } = withDatabase(workspace, (db) => transaction(db, () => {
    const found = readSource(db, id);
    const raw = z.object({ pdf_urls: z.string() }).parse(db.prepare('SELECT pdf_urls FROM sources WHERE id = ?').get(id));
    return { source: found, urls: stringsSchema.parse(JSON.parse(raw.pdf_urls)), target: readTarget(db, found.targetId) };
  }));
  if (source.kind !== 'paper') throw new RuleError('Only papers are downloaded; use source:page for web pages.');
  if (source.filePath !== null) return source;
  if (lookup && source.doi !== null) {
    const extra = (await openAccessCopies([source.doi]).catch(() => new Map<string, string[]>())).get(source.doi) ?? [];
    urls.push(...extra.filter((url) => !urls.includes(url)));
  }
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { ...headers, Accept: 'application/pdf' }, signal: AbortSignal.timeout(60_000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok) throw new RuleError(`HTTP ${String(response.status)}`);
      if (bytes.length > maxBytes) throw new RuleError('larger than 60 MB');
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new RuleError('not a PDF (likely a publisher page)');
      const pages = await extractPdf(bytes.slice());
      const folder = ensureTargetFolders(workspace, target);
      const file = join(folder, 'papers', `${paperFileName(source)}.pdf`);
      writeFileSync(join(workspace, file), bytes);
      return withDatabase(workspace, (db) => transaction(db, () => storeText(workspace, db, source, file, pages, 'unread'), 'BEGIN IMMEDIATE'));
    } catch (error) {
      failures.push(`${new URL(url).hostname}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  const note = urls.length === 0 ? 'No open-access copy is listed in OpenAlex or Semantic Scholar.'
    : `No PDF could be downloaded (${failures.join('; ')}).`;
  return withDatabase(workspace, (db) => transaction(db, () => {
    db.prepare('UPDATE sources SET status = \'inaccessible\', status_note = ?, updated_at = ? WHERE id = ? AND file_path IS NULL')
      .run(note, new Date().toISOString(), id);
    return readSource(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export async function attachPdfBytes(workspace: string, id: number, bytes: Uint8Array): Promise<Source> {
  if (bytes.length > maxBytes) throw new RuleError('That file is larger than 60 MB.');
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new RuleError('That file is not a PDF.');
  const pages = await extractPdf(bytes.slice());
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = readSource(db, id);
    if (source.kind !== 'paper') throw new RuleError('PDFs can only be attached to papers.');
    const folder = ensureTargetFolders(workspace, readTarget(db, source.targetId));
    const file = join(folder, 'papers', `${paperFileName(source)}.pdf`);
    writeFileSync(join(workspace, file), bytes);
    return storeText(workspace, db, source, file, pages, 'unread');
  }, 'BEGIN IMMEDIATE'));
}

export function attachPdf(workspace: string, id: number, path: string): Promise<Source> {
  return attachPdfBytes(workspace, id, new Uint8Array(readFileSync(path)));
}

export function requestPaper(workspace: string, id: number, input: unknown): Source {
  const { reason } = paperRequestSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = readSource(db, id);
    if (source.kind !== 'paper') throw new RuleError('Only papers can be requested.');
    if (source.filePath !== null) throw new RuleError('This paper is already available; read it with source:text.');
    db.prepare('UPDATE sources SET request_reason = ?, requested_at = ?, updated_at = ? WHERE id = ?')
      .run(reason, new Date().toISOString(), new Date().toISOString(), id);
    return readSource(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export function isBotCheck(text: string): boolean {
  return text.length < 3000
    && /captcha|verify (that )?you are (a )?human|are you a robot|checking your browser|access denied|client challenge|just a moment|attention required|enable javascript and cookies/i
      .test(text);
}

export function pageText(html: string): { title: string | null; text: string } {
  const root = parse(html.replace(/<!doctype[^>]*>/gi, ''));
  for (const node of root.querySelectorAll('script, style, noscript, svg, template, nav')) node.remove();
  const title = root.querySelector('title')?.text.trim() ?? null;
  return { title: title === '' ? null : title, text: root.structuredText.replace(/\n{3,}/g, '\n\n').trim() };
}

export async function savePage(workspace: string, targetId: number, url: string): Promise<Source> {
  const parsed = z.url({ protocol: /^https?$/ }).parse(url);
  const response = await fetch(parsed, { headers: { ...headers, Accept: 'text/html' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new RuleError(`The page returned HTTP ${String(response.status)}.`);
  const { title, text } = pageText(await response.text());
  if (text.length < 40) throw new RuleError('The page has almost no readable text (it may need JavaScript); summarize it by hand.');
  if (isBotCheck(text)) throw new RuleError('The site served a bot check instead of the page; ask the student to save it as a PDF and upload it.');
  return withDatabase(workspace, (db) => transaction(db, () => {
    const target = readTarget(db, targetId);
    const folder = ensureTargetFolders(workspace, target);
    const now = new Date().toISOString();
    const existing = readSources(db, 'WHERE target_id = ? AND kind = \'page\' AND url = ?', targetId, parsed)[0];
    const id = existing?.id ?? Number(db.prepare(`INSERT INTO sources (target_id, kind, title, url, authors, pdf_urls, status,
      created_at, updated_at) VALUES (?, 'page', ?, ?, '[]', '[]', 'unread', ?, ?)`).run(targetId, title ?? parsed, parsed, now, now).lastInsertRowid);
    const file = join(folder, 'pages', `${String(id)}-${slug(title ?? new URL(parsed).hostname)}.txt`);
    writeFileSync(join(workspace, file), `${parsed}\nRetrieved ${now}\n\n${text}\n`);
    db.prepare('UPDATE sources SET title = ? WHERE id = ?').run(title ?? parsed, id);
    return storeText(workspace, db, readSource(db, id), file, [text], 'unread');
  }, 'BEGIN IMMEDIATE'));
}

export function reconcileFiles(workspace: string): { papers: number; pages: number } {
  return withDatabase(workspace, (db) => transaction(db, () => {
    const rows = z.array(z.object({ id: z.number(), kind: z.string(), file_path: z.string().nullable(), text_path: z.string().nullable() }))
      .parse(db.prepare('SELECT id, kind, file_path, text_path FROM sources WHERE file_path IS NOT NULL OR text_path IS NOT NULL').all());
    const gone = (path: string | null): boolean => path !== null && !existsSync(join(workspace, path));
    const missing = rows.filter((row) => gone(row.file_path) || gone(row.text_path));
    for (const row of missing) {
      db.prepare('UPDATE sources SET file_path = ?, text_path = ? WHERE id = ?')
        .run(gone(row.file_path) ? null : row.file_path, gone(row.text_path) ? null : row.text_path, row.id);
    }
    return { papers: missing.filter((row) => row.kind === 'paper').length, pages: missing.filter((row) => row.kind === 'page').length };
  }, 'BEGIN IMMEDIATE'));
}

export function sourcePages(workspace: string, source: Source): string[] {
  if (source.textPath === null) {
    throw new RuleError(source.kind === 'page' ? 'This page has no saved text in this folder; save it again with source:page.'
      : 'This paper has no saved text in this folder; download it with papers:fetch, or attach the PDF with paper:attach.');
  }
  const pages = stringsSchema.parse(JSON.parse(readFileSync(join(workspace, source.textPath), 'utf8')));
  return source.kind === 'paper' ? stripRunningLines(pages) : pages;
}

export function removeSource(workspace: string, id: number): { removed: number } {
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = readSource(db, id);
    const uses = z.object({ clips: z.number(), links: z.number() }).parse(db.prepare(`SELECT
      (SELECT count(*) FROM clips WHERE source_id = ?) AS clips, (SELECT count(*) FROM track_sources WHERE source_id = ?) AS links`).get(id, id));
    if (uses.clips + uses.links > 0) {
      throw new RuleError(`Source ${String(id)} has ${String(uses.clips)} cutouts and ${String(uses.links)} track links; only an unused source can be removed.`);
    }
    db.prepare('DELETE FROM sources WHERE id = ?').run(id);
    for (const path of [source.filePath, source.textPath]) if (path !== null) rmSync(join(workspace, path), { force: true });
    return { removed: id };
  }, 'BEGIN IMMEDIATE'));
}

export function setSourceStatus(workspace: string, id: number, input: unknown): Source {
  const { status, note } = sourceStatusInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = readSource(db, id);
    if ((status === 'full' || status === 'partial') && source.textPath === null) {
      throw new RuleError('A paper without an extracted text cannot be marked as read; mark it abstract or inaccessible.');
    }
    if (status === 'abstract' && source.abstract === null && source.textPath === null) {
      throw new RuleError('This paper has no abstract on record.');
    }
    const kept = status !== 'inaccessible' && readingDepth.indexOf(status) < readingDepth.indexOf(source.status) ? source.status : status;
    const joined = [...new Set([source.statusNote, note].filter((item): item is string => item !== null))].join('; ').slice(-2000);
    const combined = kept !== source.status ? note : joined === '' ? null : joined;
    db.prepare('UPDATE sources SET status = ?, status_note = ?, updated_at = ? WHERE id = ?')
      .run(kept, combined, new Date().toISOString(), id);
    return readSource(db, id);
  }, 'BEGIN IMMEDIATE'));
}

const readingDepth: readonly string[] = ['unread', 'abstract', 'partial', 'full'];

export function markFutureScanned(workspace: string, id: number, input: unknown): Source {
  const { note } = sourceFutureSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = readSource(db, id);
    if (source.textPath === null) throw new RuleError('Scan a paper for future work only once its text is saved.');
    db.prepare('UPDATE sources SET future_checked_at = ?, future_note = ?, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), note, new Date().toISOString(), id);
    return readSource(db, id);
  }, 'BEGIN IMMEDIATE'));
}

function citationKey(source: Source): string | null {
  const arxiv = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/i.exec(source.url ?? '')?.[1]
    ?? /10\.48550\/arxiv\.([0-9]{4}\.[0-9]{4,5})/i.exec(source.doi ?? '')?.[1];
  if (arxiv !== undefined) return `ARXIV:${arxiv}`;
  if (source.doi !== null) return `DOI:${source.doi}`;
  const doi = /doi\.org\/(10\.[^\s?#]+)/i.exec(source.url ?? '')?.[1];
  return doi === undefined ? null : `DOI:${doi}`;
}

function sourceDoi(source: Source): string | null {
  const arxiv = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/i.exec(source.url ?? '')?.[1];
  const doi = source.doi ?? /doi\.org\/(10\.[^\s?#]+)/i.exec(source.url ?? '')?.[1] ?? (arxiv === undefined ? null : `10.48550/arxiv.${arxiv}`);
  return doi === null ? null : doi.toLowerCase();
}

export async function refreshCitations(workspace: string, targetId: number): Promise<{
  checked: number; semanticScholar: number; openAlex: number; missing: string[];
}> {
  const papers = listSources(workspace, targetId).filter((source) => source.kind === 'paper');
  const keys = new Map(papers.flatMap((source) => {
    const key = citationKey(source);
    return key === null ? [] : [[source.id, key] as const];
  }));
  const scholar = await citationCounts([...new Set(keys.values())]);
  const counts = new Map<number, { count: number; from: 'semanticScholar' | 'openAlex' }>();
  for (const [id, key] of keys) {
    const count = scholar.get(key);
    if (count !== undefined) counts.set(id, { count, from: 'semanticScholar' });
  }
  const rest = papers.filter((source) => !counts.has(source.id));
  const dois = [...new Set(rest.flatMap((source) => sourceDoi(source) ?? []))];
  const ids = [...new Set(rest.flatMap((source) => source.openalexId ?? []))];
  const alex = rest.length === 0 ? { byDoi: new Map<string, number>(), byId: new Map<string, number>() } : await openAlexCounts(dois, ids);
  for (const source of rest) {
    const doi = sourceDoi(source);
    const count = (source.openalexId === null ? undefined : alex.byId.get(source.openalexId)) ?? (doi === null ? undefined : alex.byDoi.get(doi));
    if (count !== undefined) counts.set(source.id, { count, from: 'openAlex' });
  }
  const stamp = new Date().toISOString();
  return withDatabase(workspace, (db) => transaction(db, () => {
    for (const [id, { count }] of counts) db.prepare('UPDATE sources SET cited_by = ?, cited_at = ? WHERE id = ?').run(count, stamp, id);
    const tally = (from: string): number => [...counts.values()].filter((item) => item.from === from).length;
    return { checked: papers.length, semanticScholar: tally('semanticScholar'), openAlex: tally('openAlex'),
      missing: papers.filter((source) => !counts.has(source.id)).map((source) => `${String(source.id)}: ${source.title.slice(0, 60)}`) };
  }, 'BEGIN IMMEDIATE'));
}
