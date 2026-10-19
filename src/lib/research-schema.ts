import { z } from 'zod';
import { text } from './profile-schema.ts';

const id = z.number().int().positive();
const timestamp = z.iso.datetime();

export const ideaKinds = ['question', 'area'] as const;
export const ideaInputSchema = z.strictObject({
  kind: z.enum(ideaKinds).describe('question: a research question the student already has. area: a broader area of interest.'),
  text: text.describe('In the student’s own words.'),
});
export const ideaSchema = z.strictObject({ id, kind: z.enum(ideaKinds), text, createdAt: timestamp });
export const ideaListSchema = z.array(ideaSchema);
export type Idea = z.infer<typeof ideaSchema>;

export const sourceStatuses = ['unread', 'abstract', 'partial', 'full', 'inaccessible'] as const;
export type SourceStatus = (typeof sourceStatuses)[number];
export const sourceStatusInputSchema = z.strictObject({
  status: z.enum(sourceStatuses).describe('abstract: only the abstract was read. partial: some sections. full: the whole text. '
    + 'inaccessible: no readable copy. partial and full need an extracted text.'),
  note: text.nullable().default(null).describe('What was read or why it is inaccessible, e.g. "methods and results only".'),
});
export const sourceSchema = z.strictObject({
  id,
  targetId: id,
  kind: z.enum(['paper', 'page']),
  title: z.string(),
  url: z.string().nullable(),
  doi: z.string().nullable(),
  openalexId: z.string().nullable(),
  year: z.number().int().nullable(),
  venue: z.string().nullable(),
  authors: z.array(z.string()),
  abstract: z.string().nullable(),
  filePath: z.string().nullable(),
  textPath: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  status: z.enum(sourceStatuses),
  statusNote: z.string().nullable(),
  references: z.array(z.string()),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Source = z.infer<typeof sourceSchema>;

export const clipKinds = ['finding', 'method', 'limitation', 'claim', 'gap', 'requirement', 'definition'] as const;
export const clipInputSchema = z.strictObject({
  sourceId: id,
  quote: z.string().trim().min(15, 'Quote at least a full phrase.').max(800, 'Quote at most a short passage; summarize the rest in the note.')
    .describe('Exact words from the source. They are checked against the saved text; the page is found automatically.'),
  kind: z.enum(clipKinds).describe('finding: a result. method: how it was studied. limitation: stated by the authors. claim: an '
    + 'argument. gap: stated open question. requirement: an application rule. definition: a term.'),
  note: text.nullable().default(null).describe('Your interpretation, kept separate from the quoted finding.'),
  trackId: id.nullable().default(null),
});
export const clipSchema = z.strictObject({
  id, sourceId: id, trackId: id.nullable(), kind: z.enum(clipKinds), quote: z.string(), page: z.number().int().nullable(),
  before: z.string(), after: z.string(), note: z.string().nullable(), createdAt: timestamp,
});
export type Clip = z.infer<typeof clipSchema>;

export const trackStatuses = ['proposed', 'running', 'awaiting', 'paused', 'dropped', 'strong'] as const;
export type TrackStatus = (typeof trackStatuses)[number];
export const trackRoles = ['seed', 'supporting', 'competing', 'background', 'frontier'] as const;

export const trackInputSchema = z.strictObject({
  targetId: id,
  kind: z.enum(['question', 'frontier']).default('question')
    .describe('frontier: the general state of the art around the lab; one per target is enough.'),
  origin: z.enum(['student', 'agent']).describe('student: the student proposed it. agent: you inferred it from the papers.'),
  ideaId: id.nullable().default(null).describe('The student idea this track came from, if any.'),
  title: text.max(120),
  question: text.describe('The research question, stated as a question.'),
  status: z.enum(trackStatuses).default('running'),
});
export const trackPatchSchema = z.strictObject({
  title: text.max(120).optional(),
  question: text.optional(),
  status: z.enum(trackStatuses).optional().describe('awaiting: you need the student to decide; set `prompt`. strong: survived '
    + 'the novelty audit. dropped: explain why in `summary`.'),
  summary: text.nullable().optional().describe('Current draft: what was read, the strongest evidence, objections, and why the '
    + 'track is strong, weak, or dropped.'),
  prompt: text.nullable().optional().describe('The question shown to the student when status is awaiting.'),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field.');
export const trackLinkSchema = z.strictObject({
  sourceId: id,
  role: z.enum(trackRoles).describe('seed: started the track. supporting: motivates it. competing: closest prior work that may '
    + 'already answer it. background: foundations. frontier: recent work shaping it.'),
  note: text.nullable().default(null),
});
export const eventKinds = ['search', 'reading', 'objection', 'decision', 'note'] as const;
export const trackEventInputSchema = z.strictObject({
  kind: z.enum(eventKinds).describe('search: the query, where, and how many results. reading: what was read. objection: a '
    + 'challenge to novelty or design. decision: why the track changed status. note: anything else.'),
  text: text.max(4000),
});

export const trackSchema = z.strictObject({
  id, targetId: id, kind: z.enum(['question', 'frontier']), origin: z.enum(['student', 'agent']), ideaId: id.nullable(),
  title: z.string(), question: z.string(), status: z.enum(trackStatuses), summary: z.string().nullable(),
  prompt: z.string().nullable(), createdAt: timestamp, updatedAt: timestamp,
});
export type Track = z.infer<typeof trackSchema>;
export const trackEventSchema = z.strictObject({
  id, trackId: id, actor: z.enum(['student', 'agent']), kind: z.string(), text: z.string(), createdAt: timestamp,
});
export const trackSourceSchema = z.strictObject({ sourceId: id, role: z.enum(trackRoles), note: z.string().nullable() });

export const trackDetailSchema = z.strictObject({
  track: trackSchema,
  sources: z.array(sourceSchema),
  links: z.array(trackSourceSchema),
  clips: z.array(clipSchema),
  events: z.array(trackEventSchema),
});
export type TrackDetail = z.infer<typeof trackDetailSchema>;

export const researchSchema = z.strictObject({
  sources: z.array(sourceSchema),
  tracks: z.array(trackSchema),
  clips: z.array(clipSchema),
  author: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
});
export type Research = z.infer<typeof researchSchema>;
