import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { RuleError } from './errors.ts';
import { extractPdf } from './library.ts';
import { readProfile } from './profile.ts';
import type { Profile } from './profile-schema.ts';
import { locateQuote } from './quote.ts';
import type { Located } from './quote.ts';

const maxBytes = 20 * 1024 * 1024;
const pagesSchema = z.array(z.string());

export async function attachCvBytes(workspace: string, bytes: Uint8Array): Promise<Profile> {
  if (bytes.length > maxBytes) throw new RuleError('That file is larger than 20 MB.');
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new RuleError('That file is not a PDF.');
  const pages = await extractPdf(bytes.slice());
  if (pages.join('').trim() === '') throw new RuleError('No text could be read from that PDF; export the CV as a text PDF.');
  mkdirSync(join(workspace, 'profile'), { recursive: true, mode: 0o700 });
  writeFileSync(join(workspace, 'profile', 'cv.pdf'), bytes, { mode: 0o600 });
  writeFileSync(join(workspace, 'profile', 'cv.json'), JSON.stringify(pages), { mode: 0o600 });
  return withDatabase(workspace, (db) => transaction(db, () => {
    const stamp = new Date().toISOString();
    db.prepare('UPDATE profile SET cv_file = ?, cv_text = ?, cv_pages = ?, cv_added_at = ?, updated_at = ? WHERE id = 1')
      .run(join('profile', 'cv.pdf'), join('profile', 'cv.json'), pages.length, stamp, stamp);
    return readProfile(db);
  }, 'BEGIN IMMEDIATE'));
}

export function attachCv(workspace: string, path: string): Promise<Profile> {
  return attachCvBytes(workspace, new Uint8Array(readFileSync(path)));
}

export function cvPages(workspace: string): string[] {
  const row = z.object({ cv_text: z.string().nullable() }).parse(withDatabase(workspace, (db) =>
    db.prepare('SELECT cv_text FROM profile WHERE id = 1').get()));
  if (row.cv_text === null) throw new RuleError('No CV yet. Ask the student to upload it on the profile page, or run profile:cv --file <path>.');
  return pagesSchema.parse(JSON.parse(readFileSync(join(workspace, row.cv_text), 'utf8')));
}

export function locateInCv(pages: readonly string[], quote: string): Located {
  const found = locateQuote(pages, quote, true);
  if (found === null) throw new RuleError(`These words are not in the CV: “${quote.slice(0, 80)}”. Quote the CV exactly.`);
  return found;
}
