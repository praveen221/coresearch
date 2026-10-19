import { z } from 'zod';
import { addPaper, discoverPapers } from '../src/lib/discovery.ts';
import { attachPdf, getSource, listSources, savePage, setSourceStatus, sourcePages } from '../src/lib/library.ts';
import { citingWorks, fetchAuthor, searchAuthors, searchWorks } from '../src/lib/openalex.ts';
import type { Work } from '../src/lib/openalex.ts';
import {
  addClip, addEvent, addIdea, addTrack, getTrackDetail, linkSource, listClips, listIdeas, listTracks, removeClip, removeIdea,
  removeTrack, unlinkSource, updateTrack,
} from '../src/lib/research.ts';
import {
  clipInputSchema, ideaInputSchema, sourceStatusInputSchema, trackEventInputSchema, trackInputSchema, trackLinkSchema, trackPatchSchema,
} from '../src/lib/research-schema.ts';
import { getTarget } from '../src/lib/targets.ts';

export const researchCommands = [
  'idea:list', 'idea:add', 'idea:remove',
  'papers:authors', 'papers:discover', 'paper:search', 'paper:add', 'paper:citing', 'paper:attach',
  'source:page', 'source:list', 'source:get', 'source:text', 'source:status',
  'clip:add', 'clip:list', 'clip:remove',
  'track:list', 'track:get', 'track:add', 'track:update', 'track:link', 'track:unlink', 'track:log', 'track:remove',
  'research:schema',
] as const;
export type ResearchCommand = (typeof researchCommands)[number];
export const isResearchCommand = (command: string): command is ResearchCommand => researchCommands.some((name) => name === command);

export const researchOptions = {
  target: { type: 'string' }, author: { type: 'string' }, years: { type: 'string' }, query: { type: 'string' },
  since: { type: 'string' }, limit: { type: 'string' }, ref: { type: 'string' }, file: { type: 'string' },
  url: { type: 'string' }, page: { type: 'string' }, track: { type: 'string' }, source: { type: 'string' },
} as const;

type Values = Partial<Record<keyof typeof researchOptions | 'id', string>>;
const positive = z.coerce.number().int().positive();

function required(values: Values, name: keyof Values): string {
  const value = values[name];
  if (value === undefined) throw new Error(`Provide --${name}.`);
  return value;
}
const number = (values: Values, name: keyof Values): number => positive.parse(required(values, name));

function brief(work: Work): unknown {
  return {
    ref: work.openalexId, year: work.year, title: work.title, authors: work.authors.slice(0, 4), venue: work.venue,
    citedBy: work.citedBy, pdf: work.pdfUrls.length > 0, abstract: work.abstract?.slice(0, 600) ?? null,
  };
}

export async function runResearch(command: ResearchCommand, workspace: string, values: Values,
  input: () => Promise<unknown>): Promise<unknown> {
  switch (command) {
    case 'idea:list': return listIdeas(workspace);
    case 'idea:add': return addIdea(workspace, await input());
    case 'idea:remove': return removeIdea(workspace, number(values, 'id'));
    case 'papers:authors': {
      const target = getTarget(number(values, 'target'), workspace);
      return { professor: target.professor, candidates: await searchAuthors(target.professor) };
    }
    case 'papers:discover': {
      const author = await fetchAuthor(required(values, 'author'));
      return discoverPapers(workspace, number(values, 'target'), author, positive.max(15).parse(values.years ?? '2'));
    }
    case 'paper:search': {
      const since = values.since === undefined ? null : z.iso.date().parse(values.since);
      const result = await searchWorks(required(values, 'query'), since, positive.max(50).parse(values.limit ?? '15'));
      return { total: result.total, results: result.works.map(brief) };
    }
    case 'paper:add': return addPaper(workspace, number(values, 'target'), required(values, 'ref'));
    case 'paper:citing': {
      const source = getSource(workspace, number(values, 'id'));
      if (source.openalexId === null) throw new Error('This source has no OpenAlex record.');
      const result = await citingWorks(source.openalexId);
      return { total: result.total, results: result.works.slice(0, positive.max(100).parse(values.limit ?? '25')).map(brief) };
    }
    case 'paper:attach': return attachPdf(workspace, number(values, 'id'), required(values, 'file'));
    case 'source:page': return savePage(workspace, number(values, 'target'), required(values, 'url'));
    case 'source:list': return listSources(workspace, number(values, 'target')).map((source) => ({
      id: source.id, kind: source.kind, year: source.year, title: source.title, status: source.status,
      pdf: source.filePath !== null, pages: source.pageCount, abstract: source.abstract !== null,
    }));
    case 'source:get': return getSource(workspace, number(values, 'id'));
    case 'source:text': {
      const source = getSource(workspace, number(values, 'id'));
      const pages = sourcePages(workspace, source);
      if (values.page === undefined) return { id: source.id, title: source.title, pages: pages.length, text: pages };
      const page = positive.max(pages.length).parse(values.page);
      return { id: source.id, title: source.title, page, text: pages[page - 1] };
    }
    case 'source:status': return setSourceStatus(workspace, number(values, 'id'), await input());
    case 'clip:add': return addClip(workspace, await input());
    case 'clip:list': return listClips(workspace, {
      ...(values.target === undefined ? {} : { targetId: number(values, 'target') }),
      ...(values.source === undefined ? {} : { sourceId: number(values, 'source') }),
      ...(values.track === undefined ? {} : { trackId: number(values, 'track') }),
    });
    case 'clip:remove': return removeClip(workspace, number(values, 'id'));
    case 'track:list': return listTracks(workspace, number(values, 'target'));
    case 'track:get': return getTrackDetail(workspace, number(values, 'id'));
    case 'track:add': return addTrack(workspace, await input());
    case 'track:update': return updateTrack(workspace, number(values, 'id'), await input());
    case 'track:link': return linkSource(workspace, number(values, 'id'), await input());
    case 'track:unlink': return unlinkSource(workspace, number(values, 'id'), number(values, 'source'));
    case 'track:log': return addEvent(workspace, number(values, 'id'), await input());
    case 'track:remove': return removeTrack(workspace, number(values, 'id'));
    case 'research:schema': return Object.fromEntries(Object.entries({
      'idea:add': ideaInputSchema, 'source:status': sourceStatusInputSchema, 'clip:add': clipInputSchema,
      'track:add': trackInputSchema, 'track:update': trackPatchSchema, 'track:link': trackLinkSchema, 'track:log': trackEventInputSchema,
    }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: 'input' })]));
  }
}
