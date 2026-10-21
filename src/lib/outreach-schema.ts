import { z } from 'zod';
import { text } from './profile-schema.ts';
import { clipSchema, sourceSchema } from './research-schema.ts';
import { fitFacets, fitScoresSchema, linkKinds, openings, pathways, regions } from './target-schema.ts';
import type { FitFacet } from './target-schema.ts';

const id = z.number().int().positive();
const timestamp = z.iso.datetime();

export const pitchStatuses = ['draft', 'sent', 'replied', 'declined'] as const;
export type PitchStatus = (typeof pitchStatuses)[number];
export const pitchWordLimit = 220;

const connectionInput = z.strictObject({
  cvQuote: z.string().trim().min(15, 'Quote at least a full phrase of the CV.').max(600)
    .describe('Exact words from the student’s CV; checked against its text.'),
  clipId: id.describe('A cutout from one of the professor’s own papers in this target’s library.'),
  note: text.max(600).describe('The connection in one sentence: where her work meets theirs.'),
});

export const pitchInputSchema = z.strictObject({
  targetId: id,
  connections: z.array(connectionInput).min(2, 'Name at least two connections between her work and theirs.').max(4),
  question: text.max(600).describe('One forward-looking question they could pursue together.'),
  questionCheck: text.max(1500).describe('What the kill probe on the question found: the searches run and the closest work, with cutouts as [c<id>].'),
  subject: text.max(120),
  body: text.max(2400).describe(`The email the student will edit and send, at most ${String(pitchWordLimit)} words. It names the connections, `
    + 'the question, and the ask, and attaches the CV. Never claim anything the connections do not show.'),
});
export const pitchEditSchema = z.strictObject({ subject: text.max(120).optional(), body: text.max(2400).optional() })
  .refine((value) => Object.keys(value).length > 0, 'Provide the subject or the body.');
export const pitchStatusSchema = z.strictObject({ status: z.enum(pitchStatuses).describe('sent, replied, and declined are set by the student.') });

export const pitchSchema = z.strictObject({
  targetId: id,
  connections: z.array(z.strictObject({ cvQuote: z.string(), cvPage: z.number().int().nullable(), clipId: id, note: z.string() })),
  question: z.string(), questionCheck: z.string(), subject: z.string(), body: z.string(), words: z.number().int(),
  status: z.enum(pitchStatuses), statusAt: timestamp.nullable(), createdAt: timestamp, updatedAt: timestamp,
});
export type Pitch = z.infer<typeof pitchSchema>;

export const cvCutoutSchema = z.strictObject({ quote: z.string(), page: z.number().int().nullable(), before: z.string(), after: z.string() });
export type CvCutout = z.infer<typeof cvCutoutSchema>;

export const matchKinds = ['name', 'initial'] as const;
export type MatchKind = (typeof matchKinds)[number];
export const contactSchema = z.strictObject({
  collaborator: z.string(),
  cv: cvCutoutSchema.nullable(),
  note: z.string().nullable(),
  match: z.enum(matchKinds),
  papers: z.array(z.strictObject({
    sourceId: id, title: z.string(), year: z.number().int().nullable(), venue: z.string().nullable(), url: z.string().nullable(),
    authors: z.array(z.string()), collaboratorAs: z.string(), professorAs: z.string(), match: z.enum(matchKinds),
  })),
});
export type Contact = z.infer<typeof contactSchema>;
export const collaboratorCiteSchema = z.strictObject({
  name: text.max(200).describe('A collaborator exactly as listed in the profile.'),
  cvQuote: z.string().trim().min(15, 'Quote at least a full phrase of the CV.').max(600)
    .describe('Exact CV words that show how the student knows them: a co-authored paper, a lab, or an advisor line.'),
  note: text.max(300).describe('The relationship in a few words, e.g. “Co-author of her CHI 2026 paper”.'),
});

export const fitAnchors: Record<FitFacet, string> = {
  topic: '0 no shared topic; 1 adjacent topics; 2 her work covers a topic of their recent papers; 3 her own work addresses their current core question.',
  method: '0 none of their methods; 1 related methods; 2 she has used a method their recent papers use; 3 she has used their main methods in substantial work.',
  scale: '0 they work at a scale she has never worked at; 1 a different scale with some overlap; 2 a scale she has worked at; 3 the scale of her strongest work.',
  venue: '0 no shared venues or fields; 1 the same field, other venues; 2 she has published or submitted where they publish; 3 she has published at their main venue.',
  skill: '0 she lacks skills their work needs; 1 some of them; 2 the skills their papers or advert ask for; 3 rare skills their work depends on.',
  funding: '0 not taking students or no funding; 1 no recent grant or funded post found; 2 a grant or studentship covering her start year; 3 a grant '
    + 'from the last two years on her topic, or a funded post advertised.',
  alumni: '0 no alumni found outside academia; 1 one or two outside academia; 2 several in industry, government, or non-profit roles; 3 most go on '
    + 'outside academia.',
};
export const cvFacets: readonly FitFacet[] = ['topic', 'method', 'scale', 'venue', 'skill'];

const evidenceInput = z.strictObject({
  cvQuote: z.string().trim().min(15, 'Quote at least a full phrase of the CV.').max(600).nullable()
    .describe('Exact words from the student’s CV; null for a fact about the lab alone.'),
  clipId: id.nullable().describe('A cutout from the professor’s own paper or one of this target’s saved pages.'),
  note: text.max(400).describe('What this evidence shows, in one sentence.'),
}).refine((value) => value.cvQuote !== null || value.clipId !== null, 'Quote the CV, cite a cutout, or both.');
const facetInput = z.strictObject({
  score: z.number().int().min(0).max(3).nullable().describe('0–3 by the anchors of this kind of fit; null: could not be checked.'),
  finding: text.max(400).describe('The fact about the lab, e.g. “Field experiments with thousands of participants on live platforms”.'),
  reason: text.max(800).describe('Why it fits the student or not.'),
  evidence: z.array(evidenceInput).max(4).default([]).describe('A score of 2 or 3 needs a cutout from their work, and for topic, method, '
    + 'scale, venue, and skill also an exact CV quote.'),
});
const facet = (kind: FitFacet): z.ZodOptional<typeof facetInput> => facetInput.describe(fitAnchors[kind]).optional();

export const fitInputSchema = z.strictObject({
  targetId: id,
  facets: z.strictObject({
    topic: facet('topic'), method: facet('method'), scale: facet('scale'), venue: facet('venue'), skill: facet('skill'),
    funding: facet('funding'), alumni: facet('alumni'),
  }).refine((value) => Object.keys(value).length > 0, 'Score at least one kind of fit.')
    .describe('Kinds left out keep their earlier scores.'),
  reviewer: text.max(200).describe('Who scored it, e.g. “Fit reviewer A (agent)”.'),
});

export const facetSchema = z.strictObject({
  score: z.number().int().min(0).max(3).nullable(), finding: z.string(), reason: z.string(),
  evidence: z.array(z.strictObject({ cv: cvCutoutSchema.nullable(), clipId: id.nullable(), note: z.string() })),
  reviewer: z.string(), scoredAt: timestamp,
});
export type Facet = z.infer<typeof facetSchema>;
export const fitSchema = z.partialRecord(z.enum(fitFacets), facetSchema);
export type Fit = z.infer<typeof fitSchema>;

export const outreachRowSchema = z.strictObject({
  targetId: id, professor: z.string(), university: z.string().nullable(), region: z.enum(regions).nullable(),
  pathway: z.enum(pathways), openings: z.enum(openings), deadline: z.string().nullable(), papers: z.number().int(),
  contacts: z.array(contactSchema), pitch: z.enum(pitchStatuses).nullable(), hold: z.string().nullable(), notes: z.record(z.string(), z.string()),
  fit: fitScoresSchema,
});
export type OutreachRow = z.infer<typeof outreachRowSchema>;

export const importRowSchema = z.strictObject({
  row: z.number().int().positive(),
  professor: z.string().trim().min(1).max(200),
  university: z.string().trim().min(1).max(300).nullable(),
  links: z.array(z.strictObject({ kind: z.enum(linkKinds), url: z.url({ protocol: /^https?$/ }).max(2048) })).max(20),
  region: z.enum(regions).nullable(),
  notes: z.record(z.string(), z.string()),
});
export const importInputSchema = z.strictObject({
  rows: z.array(importRowSchema).min(1).max(500).describe('Rows from list:preview, edited if needed (clean names, set regions).'),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export interface ListPreview {
  columns: { professor: string; university: string | null; links: string[]; notes: string[] };
  rows: (ImportRow & { existingId: number | null })[];
  skipped: { row: number; reason: string }[];
}

export const outreachListSchema = z.strictObject({ rows: z.array(outreachRowSchema) });
export const targetOutreachSchema = z.strictObject({
  pitch: pitchSchema.nullable(), contacts: z.array(contactSchema), fit: fitSchema, clips: z.array(clipSchema), sources: z.array(sourceSchema),
});
export type TargetOutreach = z.infer<typeof targetOutreachSchema>;
