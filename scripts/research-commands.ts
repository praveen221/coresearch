import { z } from 'zod';
import { addPaper, discoverPapers, fetchMissing } from '../src/lib/discovery.ts';
import { addCategory, categorizeSource, listCategories } from '../src/lib/categories.ts';
import {
  addManualSource, attachPdf, downloadPaper, getSource, listSources, markFutureScanned, refreshCitations, requestPaper, savePage,
  setSourceStatus, sourcePages,
} from '../src/lib/library.ts';
import { citingWorks, fetchAuthor, searchAuthors, searchWorks } from '../src/lib/openalex.ts';
import type { Work } from '../src/lib/openalex.ts';
import {
  addClip, addEvent, addIdea, addTrack, approveTrack, assessSource, closeBatch, getOverview, getSettings, setBrief, getTrackDetail, linkSource,
  listBatches, listClips, listIdeas, listTracks, removeClip, removeIdea, removeTrack, scoreTrack, startBatch, unlinkSource, updateSettings,
  updateTrack,
} from '../src/lib/research.ts';
import {
  batchCloseSchema, batchStartSchema, categoryInputSchema, clipInputSchema, ideaInputSchema, manualSourceSchema, paperRequestSchema,
  seedInputSchema, seedPatchSchema, settingsPatchSchema, sourceCategoriesSchema, sourceFutureSchema, sourceStatusInputSchema,
  trackApprovalSchema, trackAssessmentSchema, trackBriefSchema, trackEventInputSchema, trackInputSchema, trackLinkSchema, trackPatchSchema,
  trackScoreInputSchema,
} from '../src/lib/research-schema.ts';
import { addSeed, listSeeds, updateSeed } from '../src/lib/seeds.ts';
import { getTarget } from '../src/lib/targets.ts';

export const researchCommands = [
  'idea:list', 'idea:add', 'idea:remove',
  'papers:authors', 'papers:discover', 'papers:fetch', 'papers:citations', 'paper:search', 'paper:add', 'paper:document', 'paper:citing',
  'paper:attach', 'paper:request',
  'source:page', 'source:list', 'source:get', 'source:text', 'source:status', 'source:future', 'source:categorize',
  'category:list', 'category:add',
  'clip:add', 'clip:list', 'clip:remove',
  'seed:list', 'seed:add', 'seed:update',
  'batch:list', 'batch:start', 'batch:close',
  'track:list', 'track:get', 'track:add', 'track:approve', 'track:assess', 'track:brief', 'track:score', 'track:update', 'track:link',
  'track:unlink', 'track:log', 'track:remove',
  'settings:get', 'settings:update', 'research:overview', 'research:schema',
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
    case 'paper:document': {
      const source = addManualSource(workspace, number(values, 'target'), await input());
      return source.filePath === null ? downloadPaper(workspace, source.id, false) : source;
    }
    case 'paper:citing': {
      const source = getSource(workspace, number(values, 'id'));
      if (source.openalexId === null) throw new Error('This source has no OpenAlex record.');
      const result = await citingWorks(source.openalexId);
      return { total: result.total, results: result.works.slice(0, positive.max(100).parse(values.limit ?? '25')).map(brief) };
    }
    case 'papers:fetch': {
      const missing = listSources(workspace, number(values, 'target')).filter((source) => source.kind === 'paper' && source.filePath === null);
      const fetched = await fetchMissing(workspace, missing);
      return { tried: missing.length, downloaded: fetched.filter((source) => source.filePath !== null).map((source) => source.title) };
    }
    case 'papers:citations': return refreshCitations(workspace, number(values, 'target'));
    case 'paper:attach': return attachPdf(workspace, number(values, 'id'), required(values, 'file'));
    case 'paper:request': return requestPaper(workspace, number(values, 'id'), await input());
    case 'source:page': return savePage(workspace, number(values, 'target'), required(values, 'url'));
    case 'source:list': return listSources(workspace, number(values, 'target')).map((source) => ({
      id: source.id, kind: source.kind, year: source.year, title: source.title, status: source.status,
      pdf: source.filePath !== null, pages: source.pageCount, abstract: source.abstract !== null, cited: source.citedBy,
      futureScanned: source.futureCheckedAt !== null,
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
    case 'source:future': return markFutureScanned(workspace, number(values, 'id'), await input());
    case 'source:categorize': return categorizeSource(workspace, number(values, 'id'), await input());
    case 'category:list': return listCategories(workspace, number(values, 'target'));
    case 'category:add': return addCategory(workspace, await input());
    case 'seed:list': return listSeeds(workspace, number(values, 'target'));
    case 'seed:add': return addSeed(workspace, await input());
    case 'seed:update': return updateSeed(workspace, number(values, 'id'), await input());
    case 'batch:list': return listBatches(workspace, number(values, 'target'));
    case 'batch:start': return startBatch(workspace, number(values, 'target'), await input());
    case 'batch:close': return closeBatch(workspace, number(values, 'id'), await input());
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
    case 'track:approve': return approveTrack(workspace, number(values, 'id'), await input());
    case 'track:assess': return assessSource(workspace, number(values, 'id'), await input());
    case 'track:brief': return setBrief(workspace, number(values, 'id'), await input());
    case 'track:score': return scoreTrack(workspace, number(values, 'id'), await input());
    case 'settings:get': return getSettings(workspace);
    case 'research:overview': return getOverview(workspace, number(values, 'target'));
    case 'settings:update': return updateSettings(workspace, await input());
    case 'track:update': return updateTrack(workspace, number(values, 'id'), await input());
    case 'track:link': return linkSource(workspace, number(values, 'id'), await input());
    case 'track:unlink': return unlinkSource(workspace, number(values, 'id'), number(values, 'source'));
    case 'track:log': return addEvent(workspace, number(values, 'id'), await input());
    case 'track:remove': return removeTrack(workspace, number(values, 'id'));
    case 'research:schema': return Object.fromEntries(Object.entries({
      'idea:add': ideaInputSchema, 'paper:document': manualSourceSchema, 'source:status': sourceStatusInputSchema,
      'source:future': sourceFutureSchema, 'source:categorize': sourceCategoriesSchema, 'category:add': categoryInputSchema,
      'paper:request': paperRequestSchema, 'clip:add': clipInputSchema, 'seed:add': seedInputSchema, 'seed:update': seedPatchSchema,
      'batch:start': batchStartSchema, 'batch:close': batchCloseSchema,
      'track:add': trackInputSchema, 'track:approve': trackApprovalSchema, 'track:assess': trackAssessmentSchema, 'track:brief': trackBriefSchema,
      'track:score': trackScoreInputSchema, 'track:update': trackPatchSchema, 'track:link': trackLinkSchema,
      'track:log': trackEventInputSchema, 'settings:update': settingsPatchSchema,
    }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: 'input' })]));
  }
}
