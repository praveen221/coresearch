import { z } from 'zod';

const api = 'https://api.openalex.org';
const headers = { 'User-Agent': 'Coresearch (https://github.com/praveen221/coresearch)' };

const locationSchema = z.object({
  pdf_url: z.string().nullable().optional(),
  landing_page_url: z.string().nullable().optional(),
  source: z.object({ display_name: z.string().nullable().optional() }).nullable().optional(),
}).nullable().optional();

const workSchema = z.object({
  id: z.string(),
  doi: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  publication_year: z.number().nullable().optional(),
  publication_date: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  cited_by_count: z.number().optional(),
  authorships: z.array(z.object({ author: z.object({ display_name: z.string().nullable().optional() }) })).optional(),
  primary_location: locationSchema,
  best_oa_location: locationSchema,
  locations: z.array(locationSchema).optional(),
  referenced_works: z.array(z.string()).optional(),
  abstract_inverted_index: z.record(z.string(), z.array(z.number())).nullable().optional(),
});
const worksSchema = z.object({ meta: z.object({ count: z.number() }), results: z.array(workSchema) });
const authorsSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    display_name: z.string(),
    orcid: z.string().nullable().optional(),
    works_count: z.number().optional(),
    last_known_institutions: z.array(z.object({ display_name: z.string() })).nullable().optional(),
  })),
});

export interface Work {
  openalexId: string;
  doi: string | null;
  title: string;
  year: number | null;
  date: string | null;
  type: string | null;
  venue: string | null;
  authors: string[];
  abstract: string | null;
  references: string[];
  pdfUrls: string[];
  landingUrl: string | null;
  citedBy: number;
}

export interface Author { id: string; name: string; orcid: string | null; works: number; institutions: string[] }

function shortId(id: string): string { return id.replace('https://openalex.org/', ''); }

function abstractFrom(index: Record<string, number[]> | null | undefined): string | null {
  if (index === null || index === undefined) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words[position] = word;
  const text = words.filter((word) => word !== '').join(' ').trim();
  return text === '' ? null : text;
}

function pdfCandidates(work: z.infer<typeof workSchema>): string[] {
  const urls = [work.best_oa_location?.pdf_url, ...(work.locations ?? []).map((location) => location?.pdf_url)];
  const arxiv = /arxiv\.org\/abs\/([^?#\s]+)/.exec([work.primary_location?.landing_page_url,
    ...(work.locations ?? []).map((location) => location?.landing_page_url)].join(' '));
  const doiArxiv = /10\.48550\/arxiv\.(.+)$/i.exec(work.doi ?? '');
  const id = arxiv?.[1] ?? doiArxiv?.[1];
  if (id !== undefined) urls.push(`https://arxiv.org/pdf/${id}`);
  return [...new Set(urls.filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url)))];
}

export function toWork(raw: unknown): Work {
  const work = workSchema.parse(raw);
  return {
    openalexId: shortId(work.id),
    doi: work.doi?.replace('https://doi.org/', '') ?? null,
    title: (work.display_name ?? '').trim() || 'Untitled',
    year: work.publication_year ?? null,
    date: work.publication_date ?? null,
    type: work.type ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    authors: (work.authorships ?? []).map((authorship) => authorship.author.display_name ?? '').filter((name) => name !== ''),
    abstract: abstractFrom(work.abstract_inverted_index),
    references: (work.referenced_works ?? []).map(shortId),
    pdfUrls: pdfCandidates(work),
    landingUrl: work.primary_location?.landing_page_url ?? (work.doi ?? null),
    citedBy: work.cited_by_count ?? 0,
  };
}

async function get(path: string, parameters: Record<string, string>): Promise<unknown> {
  const url = new URL(path, api);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenAlex request failed (${String(response.status)}): ${url.pathname}`);
  return response.json();
}

export async function searchAuthors(name: string): Promise<Author[]> {
  const data = authorsSchema.parse(await get('/authors', { search: name, 'per-page': '10' }));
  return data.results.map((author) => ({
    id: shortId(author.id), name: author.display_name, orcid: author.orcid ?? null, works: author.works_count ?? 0,
    institutions: (author.last_known_institutions ?? []).map((institution) => institution.display_name),
  }));
}

async function works(filter: string, extra: Record<string, string> = {}): Promise<{ total: number; works: Work[] }> {
  const data = worksSchema.parse(await get('/works', { filter, 'per-page': '100', ...extra }));
  return { total: data.meta.count, works: data.results.map(toWork) };
}

export function worksByAuthor(author: string, since: string): Promise<{ total: number; works: Work[] }> {
  return works(`authorships.author.id:${author},from_publication_date:${since}`, { sort: 'publication_date:desc' });
}

export async function searchWorks(query: string, since: string | null, limit: number): Promise<{ total: number; works: Work[] }> {
  const data = worksSchema.parse(await get('/works', {
    search: query, 'per-page': String(limit), ...(since === null ? {} : { filter: `from_publication_date:${since}` }),
  }));
  return { total: data.meta.count, works: data.results.map(toWork) };
}

export function citingWorks(openalexId: string): Promise<{ total: number; works: Work[] }> {
  return works(`cites:${openalexId}`, { sort: 'cited_by_count:desc' });
}

export async function fetchWork(reference: string): Promise<Work> {
  const trimmed = reference.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  const path = /^W\d+$/i.test(trimmed) ? `/works/${trimmed}`
    : /^10\./.test(trimmed) ? `/works/doi:${trimmed}`
      : /^\d{4}\.\d{4,5}(v\d+)?$/.test(trimmed) ? `/works/doi:10.48550/arXiv.${trimmed.replace(/v\d+$/, '')}`
        : null;
  if (path === null) throw new Error('Give an OpenAlex id (W…), a DOI (10.…), or an arXiv id.');
  return toWork(await get(path, {}));
}

export async function fetchAuthor(id: string): Promise<Author> {
  const raw = await get(`/authors/${id.replace('https://openalex.org/', '')}`, {});
  const [author] = authorsSchema.parse({ results: [raw] }).results;
  if (author === undefined) throw new Error('Author not found.');
  return { id: shortId(author.id), name: author.display_name, orcid: author.orcid ?? null, works: author.works_count ?? 0,
    institutions: (author.last_known_institutions ?? []).map((institution) => institution.display_name) };
}
