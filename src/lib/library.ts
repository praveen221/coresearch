import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { parse } from 'node-html-parser';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { NotFoundError } from './errors.ts';
import { ensureTargetFolders, paperFileName, slug } from './files.ts';
import type { Work } from './openalex.ts';
import { sourceSchema, sourceStatusInputSchema } from './research-schema.ts';
import type { Source } from './research-schema.ts';

const rowSchema = z.object({
  id: z.number(), target_id: z.number(), kind: z.string(), title: z.string(), url: z.string().nullable(),
  doi: z.string().nullable(), openalex_id: z.string().nullable(), year: z.number().nullable(), venue: z.string().nullable(),
  authors: z.string(), abstract: z.string().nullable(), pdf_urls: z.string(), file_path: z.string().nullable(),
  text_path: z.string().nullable(), page_count: z.number().nullable(), status: z.string(), status_note: z.string().nullable(),
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
    status: row.status, statusNote: row.status_note,
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
    const result = db.prepare(`INSERT INTO sources (target_id, kind, title, url, doi, openalex_id, year, venue, authors,
      abstract, pdf_urls, status, created_at, updated_at) VALUES (?, 'paper', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)`)
      .run(targetId, work.title, work.landingUrl, work.doi, work.openalexId, work.year, work.venue,
        JSON.stringify(work.authors), work.abstract, JSON.stringify(work.pdfUrls), now, now);
    const id = Number(result.lastInsertRowid);
    for (const cited of work.references) {
      db.prepare('INSERT OR IGNORE INTO citations (source_id, cited_openalex_id) VALUES (?, ?)').run(id, cited);
    }
    return { source: readSource(db, id), added: true };
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

async function extractPdf(bytes: Uint8Array): Promise<string[]> {
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

export async function downloadPaper(workspace: string, id: number): Promise<Source> {
  const { source, urls, target } = withDatabase(workspace, (db) => transaction(db, () => {
    const found = readSource(db, id);
    const raw = z.object({ pdf_urls: z.string() }).parse(db.prepare('SELECT pdf_urls FROM sources WHERE id = ?').get(id));
    return { source: found, urls: stringsSchema.parse(JSON.parse(raw.pdf_urls)), target: readTarget(db, found.targetId) };
  }));
  if (source.kind !== 'paper') throw new Error('Only papers are downloaded; use source:page for web pages.');
  if (source.filePath !== null) return source;
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { ...headers, Accept: 'application/pdf' }, signal: AbortSignal.timeout(60_000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      if (bytes.length > maxBytes) throw new Error('larger than 60 MB');
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('not a PDF (likely a publisher page)');
      const pages = await extractPdf(bytes.slice());
      const folder = ensureTargetFolders(workspace, target);
      const file = join(folder, 'papers', `${paperFileName(source)}.pdf`);
      writeFileSync(join(workspace, file), bytes);
      return withDatabase(workspace, (db) => transaction(db, () => storeText(workspace, db, source, file, pages, 'unread'), 'BEGIN IMMEDIATE'));
    } catch (error) {
      failures.push(`${new URL(url).hostname}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  const note = urls.length === 0 ? 'No open-access copy is listed. Add a PDF to the inbox if you have access.'
    : `No PDF could be downloaded (${failures.join('; ')}). Add a PDF to the inbox if you have access.`;
  return withDatabase(workspace, (db) => transaction(db, () => {
    db.prepare('UPDATE sources SET status = \'inaccessible\', status_note = ?, updated_at = ? WHERE id = ? AND file_path IS NULL')
      .run(note, new Date().toISOString(), id);
    return readSource(db, id);
  }, 'BEGIN IMMEDIATE'));
}

export async function attachPdf(workspace: string, id: number, path: string): Promise<Source> {
  const bytes = new Uint8Array(readFileSync(path));
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('That file is not a PDF.');
  const pages = await extractPdf(bytes.slice());
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = readSource(db, id);
    if (source.kind !== 'paper') throw new Error('PDFs can only be attached to papers.');
    const folder = ensureTargetFolders(workspace, readTarget(db, source.targetId));
    const file = join(folder, 'papers', `${paperFileName(source)}.pdf`);
    copyFileSync(path, join(workspace, file));
    return storeText(workspace, db, source, file, pages, 'unread');
  }, 'BEGIN IMMEDIATE'));
}

function pageText(html: string): { title: string | null; text: string } {
  const root = parse(html);
  for (const node of root.querySelectorAll('script, style, noscript, svg, template')) node.remove();
  const title = root.querySelector('title')?.text.trim() ?? null;
  return { title: title === '' ? null : title, text: root.structuredText.replace(/\n{3,}/g, '\n\n').trim() };
}

export async function savePage(workspace: string, targetId: number, url: string): Promise<Source> {
  const parsed = z.url({ protocol: /^https?$/ }).parse(url);
  const response = await fetch(parsed, { headers: { ...headers, Accept: 'text/html' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`The page returned HTTP ${String(response.status)}.`);
  const { title, text } = pageText(await response.text());
  if (text.length < 40) throw new Error('The page has almost no readable text (it may need JavaScript); summarize it by hand.');
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

export function sourcePages(workspace: string, source: Source): string[] {
  if (source.textPath === null) throw new Error('This source has no extracted text yet; download or attach it first.');
  return stringsSchema.parse(JSON.parse(readFileSync(join(workspace, source.textPath), 'utf8')));
}

export function setSourceStatus(workspace: string, id: number, input: unknown): Source {
  const { status, note } = sourceStatusInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = readSource(db, id);
    if ((status === 'full' || status === 'partial') && source.textPath === null) {
      throw new Error('A paper without an extracted text cannot be marked as read; mark it abstract or inaccessible.');
    }
    if (status === 'abstract' && source.abstract === null && source.textPath === null) {
      throw new Error('This paper has no abstract on record.');
    }
    db.prepare('UPDATE sources SET status = ?, status_note = ?, updated_at = ? WHERE id = ?')
      .run(status, note, new Date().toISOString(), id);
    return readSource(db, id);
  }, 'BEGIN IMMEDIATE'));
}
