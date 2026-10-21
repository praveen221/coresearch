import { readFileSync } from 'node:fs';
import { transaction, withDatabase } from './database.ts';
import { RuleError } from './errors.ts';
import { importInputSchema } from './outreach-schema.ts';
import type { ListPreview } from './outreach-schema.ts';
import type { Link, LinkKind, Region, Target } from './target-schema.ts';
import { insertTarget, readTargets } from './targets.ts';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"' && text.charAt(index + 1) === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(index + 1) === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map((cells) => cells.map((value) => value.trim()));
}

export function sheetExportUrl(link: string): string | null {
  const url = URL.parse(link);
  if (url?.hostname !== 'docs.google.com') return null;
  const id = /^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
  if (id === undefined) return null;
  const gid = url.searchParams.get('gid') ?? /gid=(\d+)/.exec(url.hash)?.[1] ?? null;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid === null ? '' : `&gid=${gid}`}`;
}

export async function readList(source: { url?: string; file?: string }): Promise<string> {
  if (source.file !== undefined) return readFileSync(source.file, 'utf8');
  if (source.url === undefined) throw new RuleError('Give a Google Sheets link or a CSV file.');
  const address = sheetExportUrl(source.url) ?? source.url;
  const response = await fetch(address, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !/text\/(csv|plain)/.test(type)) {
    throw new RuleError('That list could not be read. Share the sheet as “Anyone with the link can view”, or download it as CSV.');
  }
  return response.text();
}

const headerPatterns = {
  professor: /^(professor|faculty|supervisor|advisor|name)\b/i,
  university: /(university|institution|school|college|^uni\b)/i,
  country: /^country/i,
};
const urlPattern = /^https?:\/\/\S+$/i;

function linkKind(header: string): LinkKind {
  if (/(programme|program|admission|phd home)/i.test(header)) return 'programme';
  if (/(publication|scholar|dblp|orcid)/i.test(header)) return 'publications';
  if (/position|advert|vacanc/i.test(header)) return 'position';
  return 'professor';
}

const europe = new Set(['de', 'fr', 'nl', 'se', 'dk', 'fi', 'no', 'ch', 'at', 'be', 'it', 'es', 'pt', 'ie', 'pl', 'cz', 'gr', 'lu', 'is',
  'ee', 'lv', 'lt', 'si', 'sk', 'hu', 'ro', 'bg', 'hr', 'eu']);
const asiaPacific = new Set(['au', 'nz', 'jp', 'sg', 'hk', 'kr', 'cn', 'in', 'tw', 'my', 'th', 'id', 'ph', 'vn']);

export function guessRegion(urls: readonly string[], university: string | null, country: string | null = null): Region | null {
  if (country !== null) {
    if (/^(us|usa|u\.s\.a?\.?|united states)/i.test(country)) return 'us';
    if (/^(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland)/i.test(country)) return 'uk';
    if (/^canada/i.test(country)) return 'canada';
  }
  for (const address of urls) {
    const host = URL.parse(address)?.hostname.toLowerCase() ?? '';
    const top = host.split('.').at(-1) ?? '';
    if (host.endsWith('.edu')) return 'us';
    if (top === 'uk') return 'uk';
    if (top === 'ca') return 'canada';
    if (europe.has(top)) return 'europe';
    if (asiaPacific.has(top)) return 'asia-pacific';
  }
  if (university !== null && /\b(oxford|cambridge|london|edinburgh|manchester|glasgow|bristol|warwick|ucl)\b/i.test(university)) return 'uk';
  return null;
}

function personKey(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(prof|professor|dr|mr|ms|mrs)\b\.?/g, ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((part) => part !== '')
    .filter((_, index, parts) => index === 0 || index === parts.length - 1).join(' ');
}

function findExisting(targets: readonly Target[], professor: string): number | null {
  return targets.find((target) => personKey(target.professor) === personKey(professor))?.id ?? null;
}

export function previewList(workspace: string, text: string): ListPreview {
  const table = parseCsv(text);
  const headerIndex = table.findIndex((cells) => cells.some((cell) => headerPatterns.professor.test(cell)) && cells.filter((cell) => cell !== '').length >= 2);
  const header = table[headerIndex];
  if (header === undefined) throw new RuleError('No header row with a professor or name column was found.');
  const column = (pattern: RegExp): number => header.findIndex((cell) => pattern.test(cell));
  const professorColumn = column(/^professor\b/i) >= 0 ? column(/^professor\b/i) : column(headerPatterns.professor);
  const universityColumn = column(headerPatterns.university);
  const countryColumn = column(headerPatterns.country);
  const body = table.slice(headerIndex + 1);
  const linkColumns = header.map((_, index) => index).filter((index) => index !== professorColumn
    && body.some((cells) => urlPattern.test(cells[index] ?? '')));
  const noteColumns = header.map((_, index) => index).filter((index) => ![professorColumn, universityColumn].includes(index)
    && !linkColumns.includes(index) && header[index] !== '');
  const targets = withDatabase(workspace, (db) => transaction(db, () => readTargets(db)));
  const rows: ListPreview['rows'] = [];
  const skipped: ListPreview['skipped'] = [];
  let university: string | null = null;
  body.forEach((cells, offset) => {
    const row = headerIndex + offset + 2;
    if (cells.every((cell) => cell === '')) return;
    const professor = cells[professorColumn] ?? '';
    const stated = universityColumn < 0 ? '' : cells[universityColumn] ?? '';
    university = stated === '' ? university : stated;
    if (professor === '') { skipped.push({ row, reason: 'No professor named.' }); return; }
    const links: Link[] = linkColumns.flatMap((index) => {
      const value = cells[index] ?? '';
      return urlPattern.test(value) ? [{ kind: linkKind(header[index] ?? ''), url: value }] : [];
    }).filter((link, index, all) => all.findIndex((other) => other.url === link.url) === index);
    const notes = Object.fromEntries(noteColumns.flatMap((index) => {
      const value = (cells[index] ?? '').slice(0, 2000);
      return value === '' ? [] : [[(header[index] ?? '').slice(0, 120), value]];
    }));
    const country = countryColumn < 0 ? '' : cells[countryColumn] ?? '';
    rows.push({ row, professor, university, links, region: guessRegion(links.map((link) => link.url), university, country === '' ? null : country),
      notes, existingId: findExisting(targets, professor) });
  });
  return {
    columns: { professor: header[professorColumn] ?? '', university: universityColumn < 0 ? null : header[universityColumn] ?? null,
      links: linkColumns.map((index) => header[index] ?? ''), notes: noteColumns.map((index) => header[index] ?? '') },
    rows, skipped,
  };
}

export function importList(workspace: string, input: unknown): { created: Target[]; skipped: { professor: string; reason: string }[] } {
  const { rows } = importInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const created: Target[] = [];
    const skipped: { professor: string; reason: string }[] = [];
    for (const row of rows) {
      const existing = findExisting([...readTargets(db)], row.professor);
      if (existing !== null) { skipped.push({ professor: row.professor, reason: `Already a target (${String(existing)}).` }); continue; }
      if (row.university === null) { skipped.push({ professor: row.professor, reason: 'No university; add it, then import again.' }); continue; }
      created.push(insertTarget(db, { professor: row.professor, labKind: 'university', university: row.university, links: row.links,
        region: row.region, notes: row.notes }));
    }
    return { created, skipped };
  }, 'BEGIN IMMEDIATE'));
}
