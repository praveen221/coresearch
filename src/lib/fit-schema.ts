import { z } from 'zod';
import { text } from './profile-schema.ts';

export const fitEvidence = ['cv-and-work', 'work'] as const;
export type FitEvidence = (typeof fitEvidence)[number];
export const weightLabels = ['Ignore', 'Counts', 'Important', 'Essential'] as const;

export const fitKindSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z-]{1,39}$/, 'Use 2 to 40 lowercase letters or hyphens.').describe('A short id, e.g. "topic".'),
  label: text.max(40).describe('The column name the student sees, e.g. "Topic".'),
  question: text.max(200).describe('What this kind of fit asks, in plain words.'),
  anchors: text.max(600).describe('What 0, 1, 2, and 3 mean.'),
  evidence: z.enum(fitEvidence).describe('cv-and-work: a score of 2 or 3 needs an exact CV quote and a cutout from their work. work: a cutout '
    + 'from their work or pages alone, for facts about the lab.'),
  weight: z.number().int().min(0).max(3).describe('How much it counts in the rank: 0 shown but not counted, 1 counts, 2 important, 3 essential.'),
});
export type FitKind = z.infer<typeof fitKindSchema>;

export const fitKindsInputSchema = z.strictObject({
  kinds: z.array(fitKindSchema).min(1).max(12)
    .refine((kinds) => new Set(kinds.map((kind) => kind.key)).size === kinds.length, 'Use each key once.')
    .describe('The full list in display order; it replaces the saved list. Scores of a removed kind are kept and return if it is added back.'),
});
export const fitWeightSchema = z.strictObject({ key: z.string().min(1).max(40), weight: z.number().int().min(0).max(3) });

export const defaultFitKinds: readonly FitKind[] = [
  { key: 'topic', label: 'Topic', question: 'Does your work address the questions they study now?', evidence: 'cv-and-work', weight: 1,
    anchors: '0 no shared topic; 1 adjacent topics; 2 your work covers a topic of their recent papers; 3 your own work addresses their current '
      + 'core question.' },
  { key: 'method', label: 'Methods', question: 'Have you used the methods they use?', evidence: 'cv-and-work', weight: 1,
    anchors: '0 none of their methods; 1 related methods; 2 you have used a method their recent papers use; 3 you have used their main methods '
      + 'in substantial work.' },
  { key: 'scale', label: 'Scale', question: 'Do they work at a scale you have worked at, from small lab studies to platform-scale data?',
    evidence: 'cv-and-work', weight: 1,
    anchors: '0 they work at a scale you have never worked at; 1 a different scale with some overlap; 2 a scale you have worked at; 3 the scale '
      + 'of your strongest work.' },
  { key: 'venue', label: 'Venues', question: 'Do you publish where they publish?', evidence: 'cv-and-work', weight: 1,
    anchors: '0 no shared venues or fields; 1 the same field, other venues; 2 you have published or submitted where they publish; 3 you have '
      + 'published at their main venue.' },
  { key: 'skill', label: 'Skills', question: 'Do you have the skills their work needs?', evidence: 'cv-and-work', weight: 1,
    anchors: '0 you lack skills their work needs; 1 some of them; 2 the skills their papers or advert ask for; 3 rare skills their work '
      + 'depends on.' },
  { key: 'funding', label: 'Funding', question: 'Do they have money for a new student?', evidence: 'work', weight: 1,
    anchors: '0 not taking students or no funding; 1 no recent grant or funded post found; 2 a grant or studentship covering your start year; '
      + '3 a recent grant on your topic, or a funded post advertised.' },
  { key: 'alumni', label: 'Alumni', question: 'Do their alumni go on to roles outside academia?', evidence: 'work', weight: 1,
    anchors: '0 no alumni found outside academia; 1 one or two; 2 several in industry, government, or non-profit roles; 3 most go on '
      + 'outside academia.' },
];

export const fitScoresSchema = z.record(z.string(), z.number().int().min(0).max(3).nullable());
export type FitScores = z.infer<typeof fitScoresSchema>;

export interface FitTotal { score: number; max: number; checked: number; counted: number }

export function fitTotal(scores: FitScores, kinds: readonly FitKind[]): FitTotal | null {
  const counted = kinds.filter((kind) => kind.weight > 0);
  const checked = counted.filter((kind) => scores[kind.key] !== undefined);
  if (checked.length === 0) return null;
  return {
    score: checked.reduce((sum, kind) => sum + kind.weight * (scores[kind.key] ?? 0), 0),
    max: counted.reduce((sum, kind) => sum + kind.weight * 3, 0),
    checked: checked.length,
    counted: counted.length,
  };
}
