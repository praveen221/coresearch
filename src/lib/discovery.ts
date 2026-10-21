import { addPdfCandidates, downloadPaper, savePaper, setAuthor } from './library.ts';
import { openAccessCopies } from './semanticscholar.ts';
import { fetchWork, worksByAuthor } from './openalex.ts';
import type { Work } from './openalex.ts';
import type { Source } from './research-schema.ts';

export interface DiscoverySummary {
  author: string;
  since: string;
  found: number;
  added: number;
  merged: number;
  downloaded: number;
  inaccessible: number;
  papers: { id: number; year: number | null; title: string; status: Source['status']; pdf: boolean }[];
}

export async function fetchMissing(workspace: string, missing: readonly Source[]): Promise<Source[]> {
  const copies = await openAccessCopies(missing.flatMap((source) => source.doi === null ? [] : [source.doi]))
    .catch(() => new Map<string, string[]>());
  for (const source of missing) {
    const extra = source.doi === null ? undefined : copies.get(source.doi);
    if (extra !== undefined) addPdfCandidates(workspace, source.id, extra);
  }
  return fetchAll(missing, workspace);
}

async function fetchAll(sources: readonly Source[], workspace: string): Promise<Source[]> {
  const results: Source[] = [];
  for (let index = 0; index < sources.length; index += 4) {
    results.push(...await Promise.all(sources.slice(index, index + 4).map((source) => downloadPaper(workspace, source.id, false))));
  }
  return results;
}

export async function discoverPapers(workspace: string, targetId: number, author: { id: string; name: string },
  years: number): Promise<DiscoverySummary> {
  setAuthor(workspace, targetId, author);
  const sinceDate = new Date();
  sinceDate.setFullYear(sinceDate.getFullYear() - years);
  const since = sinceDate.toISOString().slice(0, 10);
  const { works } = await worksByAuthor(author.id, since);
  const ordered = [...works].sort((a, b) => b.pdfUrls.length - a.pdfUrls.length);
  const saved = ordered.map((work) => savePaper(workspace, targetId, work));
  const unique = [...new Map(saved.map((item) => [item.source.id, item.source])).values()];
  const fetched = await fetchMissing(workspace, unique.filter((source) => source.filePath === null));
  const final = new Map([...unique, ...fetched].map((source) => [source.id, source]));
  const papers = [...final.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return {
    author: author.name, since, found: works.length,
    added: saved.filter((item) => item.added).length, merged: saved.filter((item) => !item.added).length,
    downloaded: papers.filter((paper) => paper.filePath !== null).length,
    inaccessible: papers.filter((paper) => paper.status === 'inaccessible').length,
    papers: papers.map((paper) => ({ id: paper.id, year: paper.year, title: paper.title, status: paper.status, pdf: paper.filePath !== null })),
  };
}

export async function addPaper(workspace: string, targetId: number, reference: string): Promise<{ source: Source; added: boolean }> {
  const work: Work = await fetchWork(reference);
  const saved = savePaper(workspace, targetId, work);
  return { source: saved.source.filePath === null ? await downloadPaper(workspace, saved.source.id) : saved.source, added: saved.added };
}
