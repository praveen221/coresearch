import { z } from 'zod';

const api = 'https://api.semanticscholar.org/graph/v1/paper/batch';
const resultSchema = z.array(z.object({
  openAccessPdf: z.object({ url: z.string().nullable().optional() }).nullable().optional(),
  externalIds: z.record(z.string(), z.union([z.string(), z.number()])).nullable().optional(),
}).nullable());

const countsSchema = z.array(z.object({ citationCount: z.number().int().nullable().optional() }).nullable());

const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, milliseconds); });

export async function citationCounts(ids: readonly string[]): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  for (let index = 0; index < ids.length; index += 400) {
    const batch = ids.slice(index, index + 400);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 4 && (response === null || response.status === 429); attempt += 1) {
      if (attempt > 0) await pause(2000 * 2 ** attempt);
      response = await fetch(`${api}?fields=citationCount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Coresearch (https://github.com/praveen221/coresearch)' },
        body: JSON.stringify({ ids: batch }),
        signal: AbortSignal.timeout(60_000),
      });
    }
    if (response === null || !response.ok) continue;
    countsSchema.parse(await response.json()).forEach((paper, position) => {
      const id = batch[position];
      const count = paper?.citationCount;
      if (id !== undefined && typeof count === 'number') found.set(id, count);
    });
  }
  return found;
}

export async function openAccessCopies(dois: readonly string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  for (let index = 0; index < dois.length; index += 400) {
    const batch = dois.slice(index, index + 400);
    const response = await fetch(`${api}?fields=openAccessPdf,externalIds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Coresearch (https://github.com/praveen221/coresearch)' },
      body: JSON.stringify({ ids: batch.map((doi) => `DOI:${doi}`) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) continue;
    resultSchema.parse(await response.json()).forEach((paper, position) => {
      const doi = batch[position];
      if (paper === null || doi === undefined) return;
      const arxiv = paper.externalIds?.['ArXiv'];
      const urls = [paper.openAccessPdf?.url, typeof arxiv === 'string' ? `https://arxiv.org/pdf/${arxiv}` : null,
        doi.startsWith('10.1145/') && paper.openAccessPdf?.url !== undefined ? `https://dl.acm.org/doi/pdf/${doi}` : null]
        .filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url));
      if (urls.length > 0) found.set(doi, urls);
    });
  }
  return found;
}
