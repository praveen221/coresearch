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
  requestReason: z.string().nullable(),
  requestedAt: timestamp.nullable(),
  citedBy: z.number().int().nullable(),
  citedAt: timestamp.nullable(),
  futureCheckedAt: timestamp.nullable(),
  futureNote: z.string().nullable(),
  references: z.array(z.string()),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Source = z.infer<typeof sourceSchema>;
export const sourceFutureSchema = z.strictObject({
  note: text.max(1000).describe('What the scan of the paper’s limitations and future work found, e.g. “3 statements cut out” or '
    + '“no future work stated”.'),
});

export const clipKinds = ['setup', 'claim', 'finding', 'limitation', 'gap', 'definition', 'requirement', 'future', 'fact', 'criteria'] as const;
export const clipInputSchema = z.strictObject({
  sourceId: id,
  quote: z.string().trim().min(15, 'Quote at least a full phrase.').max(800, 'Quote at most a short passage; summarize the rest in the note.')
    .describe('Exact words from the source. They are checked against the saved text; the page is found automatically.'),
  kind: z.enum(clipKinds).describe('setup: the experimental setup (participants, apparatus, conditions, measures). claim: what the '
    + 'authors say they found, e.g. in the abstract. finding: the measured result itself, quoted from the results or a table with its '
    + 'numbers. limitation: stated by the authors. gap: a stated open question. definition: a term. requirement: an application rule. '
    + 'future: work the authors say should come next or that they could not do, and why; cut out without a track to build the seed '
    + 'library. fact: a fact about the lab, such as a grant acknowledgement, an alumni placement, or a venue. criteria: what the professor '
    + 'or programme looks for in a candidate, who is usually admitted, and their advice to applicants.'),
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
export const verdicts = ['supports', 'challenges', 'answers', 'weak', 'unrelated'] as const;
export type Verdict = (typeof verdicts)[number];

const researchQuestions = z.array(text.max(600)).min(2, 'Name at least two research questions that build on each other.').max(4)
  .describe('Two to four research questions that build into a three- to four-year programme; each needs its own studies.');
const contribution = text.max(2000)
  .describe('The general knowledge others will use: a theory, framework, measure, method, or intervention, and who benefits.');
const prediction = z.number().int().min(0).max(100).describe('Your predicted chance (0–100) that this guess survives the audit as '
  + 'strong. It is fixed once the track starts and compared with the outcome to measure whether guessing improves.');
const killCriterion = text.max(1000).describe('The finding that would kill this guess, stated before testing it.');
const seedIds = z.array(id).min(1).max(6).describe('The seeds this guess grows from (seed:list).');
export const killReasons = ['answered', 'new-setting', 'single-study', 'weak-lab-fit', 'weak-student-fit', 'infeasible', 'competition',
  'student-choice', 'withdrawn'] as const;
export type KillReason = (typeof killReasons)[number];
const killReason = z.enum(killReasons).describe('Why the guess stopped. answered: prior work settles it. new-setting: a known '
  + 'mechanism in an unstudied setting or population. single-study: one study, not a programme. weak-lab-fit, weak-student-fit. '
  + 'infeasible: ethics, access, or cost. competition: another group is already doing it. student-choice. withdrawn: stopped '
  + 'before testing.');

export const trackInputSchema = z.strictObject({
  targetId: id,
  kind: z.enum(['question', 'frontier']).default('question')
    .describe('frontier: the general state of the art around the lab; one per target.'),
  origin: z.enum(['student', 'agent']).describe('student: the student proposed it. agent: you inferred it from the papers.'),
  ideaId: id.nullable().default(null).describe('The student idea this track came from, if any.'),
  title: text.max(120),
  question: text.describe('The research question, stated as a question.'),
  rationale: text.describe('What made this track worth exploring: the papers, gaps, and student interests behind it.'),
  researchQuestions: researchQuestions.optional(),
  contribution: contribution.optional(),
  prediction: prediction.optional(),
  killCriterion: killCriterion.optional(),
  seedIds: seedIds.optional(),
  control: z.boolean().default(false).describe('A comparison guess written without the seed library, to test whether seeds help. '
    + 'It names no seeds and is counted apart in the batch metrics.'),
}).refine((value) => !(value.control && (value.seedIds?.length ?? 0) > 0), 'A control guess names no seeds.');
export const trackApprovalSchema = z.strictObject({
  studentSaid: text.max(2000).describe('The student’s own words approving this track in chat.'),
});
export const trackPatchSchema = z.strictObject({
  title: text.max(120).optional(),
  question: text.optional(),
  rationale: text.optional(),
  status: z.enum(['running', 'awaiting', 'paused', 'dropped', 'strong']).optional().describe('awaiting: the student must decide; '
    + 'set `prompt`. strong: survived the novelty audit. Stopping (awaiting, paused, dropped, strong) needs `stopReason`. '
    + 'An agent-proposed track starts running only after the student approves it.'),
  summary: text.nullable().optional().describe('Current findings: what was read, the strongest evidence, and the objections.'),
  stopReason: text.nullable().optional().describe('Where the track stopped and why.'),
  nextSteps: text.nullable().optional().describe('What exploring further would involve and whether it looks worthwhile.'),
  prompt: text.nullable().optional().describe('The question shown to the student when status is awaiting.'),
  researchQuestions: researchQuestions.optional(),
  contribution: contribution.optional(),
  prediction: prediction.optional(),
  killCriterion: killCriterion.optional(),
  seedIds: seedIds.optional(),
  killReason: killReason.optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field.');
export const trackLinkSchema = z.strictObject({
  sourceId: id,
  role: z.enum(trackRoles).describe('seed: started the track. supporting: motivates it. competing: closest prior work that may '
    + 'already answer it. background: foundations. frontier: recent work shaping it.'),
  note: text.nullable().default(null),
});
export const trackAssessmentSchema = z.strictObject({
  sourceId: id,
  verdict: z.enum(verdicts).describe('supports: strengthens the hypothesis or its motivation. challenges: contradicts it. answers: '
    + 'already answers the question, so repeating it would not change the result. weak: the evidence is too small, noisy, or flawed '
    + 'to rely on. unrelated: not relevant after reading.'),
  assessment: text.max(4000).describe('What this paper means for the hypothesis, citing its cutouts as [c<id>]. Compare the claims '
    + 'with the measured findings.'),
});
export const eventKinds = ['search', 'reading', 'objection', 'decision', 'note', 'probe'] as const;
export const trackEventInputSchema = z.strictObject({
  kind: z.enum(eventKinds).describe('search: the query, where, and how many results. reading: what was read. objection: a '
    + 'challenge to novelty or design. decision: why the track changed status. probe: the cheap kill test before full reading; '
    + 'start the text with “pass:” or “kill:”. note: anything else.'),
  text: text.max(4000),
});

const level = z.number().int().min(0).max(3);
export const trackScoreInputSchema = z.strictObject({
  novelty: level.describe('0: answered. 1: a known mechanism in a new setting or population. 2: open within a known construct. '
    + '3: a new construct, measure, or theory with no close prior work.'),
  depth: level.describe('0: one study. 1: two linked studies. 2: a programme of two to four research questions. 3: a programme '
    + 'whose contribution others would reuse.'),
  labFit: level.describe('0: none. 1: adjacent to the lab. 2: builds on a lab paper. 3: answers the lab’s own stated future work.'),
  studentFit: level.describe('0: none. 1: partial. 2: uses the student’s skills or interests. 3: builds on the student’s own work '
    + 'or idea.'),
  feasibility: level.describe('0: infeasible or unethical. 1: major obstacles. 2: feasible with care. 3: clearly feasible within a '
    + 'PhD.'),
  rationale: text.max(6000).describe('One line per criterion, citing the cutouts behind each score as [c<id>].'),
  reviewer: text.max(200).describe('Who scored. Scores come from an independent reviewer with no stake in the guess, never from '
    + 'the agent that proposed or investigated it.'),
});
export const trackScoreSchema = z.strictObject({
  ...trackScoreInputSchema.shape, total: z.number().int().min(0).max(15), scoredAt: timestamp,
});
export type TrackScore = z.infer<typeof trackScoreSchema>;
export const barMinimum = 2;
export function clearsBar(score: Pick<TrackScore, 'novelty' | 'depth' | 'labFit' | 'studentFit' | 'feasibility'>): boolean {
  return Math.min(score.novelty, score.depth, score.labFit, score.studentFit, score.feasibility) >= barMinimum;
}

export const trackSchema = z.strictObject({
  id, targetId: id, kind: z.enum(['question', 'frontier']), origin: z.enum(['student', 'agent']), ideaId: id.nullable(),
  title: z.string(), question: z.string(), rationale: z.string().nullable(), status: z.enum(trackStatuses),
  summary: z.string().nullable(), stopReason: z.string().nullable(), nextSteps: z.string().nullable(),
  prompt: z.string().nullable(), brief: z.string().nullable(), researchQuestions: z.array(z.string()), contribution: z.string().nullable(),
  batchId: id.nullable(), prediction: z.number().int().nullable(), killCriterion: z.string().nullable(),
  killReason: z.enum(killReasons).nullable(), seedIds: z.array(id), control: z.boolean(), score: trackScoreSchema.nullable(),
  createdAt: timestamp, updatedAt: timestamp,
});
export const trackBriefSchema = z.strictObject({
  brief: text.max(20000).describe('A research brief for discussion, never a proposal to submit: question and subquestions, why it '
    + 'matters, closest work and the gap, possible studies, first-year deliverables, risks, and fit. Use “## ” headings and “- ” '
    + 'bullets; cite cutouts as [c<id>]. Only for tracks marked strong.'),
});
export type Track = z.infer<typeof trackSchema>;
export const trackEventSchema = z.strictObject({
  id, trackId: id, actor: z.enum(['student', 'agent']), kind: z.string(), text: z.string(), createdAt: timestamp,
});
export const trackSourceSchema = z.strictObject({
  sourceId: id, role: z.enum(trackRoles), note: z.string().nullable(),
  verdict: z.enum(verdicts).nullable(), assessment: z.string().nullable(), assessedAt: timestamp.nullable(),
});

export const trackDetailSchema = z.strictObject({
  track: trackSchema,
  sources: z.array(sourceSchema),
  links: z.array(trackSourceSchema),
  clips: z.array(clipSchema),
  events: z.array(trackEventSchema),
});
export type TrackDetail = z.infer<typeof trackDetailSchema>;

export const manualSourceSchema = z.strictObject({
  title: text.max(500).describe('For documents outside OpenAlex: theses, regulations, reports, and policy papers.'),
  authors: z.array(text.max(200)).max(50).default([]),
  year: z.number().int().min(1900).max(2100).nullable().default(null),
  url: z.url({ protocol: /^https?$/ }).describe('Where the document is published.'),
  pdfUrl: z.url({ protocol: /^https?$/ }).nullable().default(null).describe('A direct PDF address, if there is one.'),
  abstract: text.max(10_000).nullable().default(null).describe('The published abstract, if there is one.'),
});

export const paperRequestSchema = z.strictObject({
  reason: text.max(2000).describe('Why this paper matters, shown to the student with its link.'),
});

export const settingsSchema = z.strictObject({
  trackLimit: z.number().int().min(1).max(10)
    .describe('How many question tracks may run at once; the student sets it to control research effort.'),
});
export type Settings = z.infer<typeof settingsSchema>;
export const settingsPatchSchema = settingsSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide a setting.');

export const seedKinds = ['future-work', 'conflict', 'theory-gap', 'stopped-track', 'survivor', 'student'] as const;
export type SeedKind = (typeof seedKinds)[number];
export const seedStatuses = ['open', 'used', 'set-aside'] as const;
export const seedInputSchema = z.strictObject({
  targetId: id,
  kind: z.enum(seedKinds).describe('future-work: what authors say they could not do or should come next (cite future, '
    + 'limitation, or gap cutouts). conflict: strong papers with opposite results (cite findings from at least two papers). '
    + 'theory-gap: a construct used without theory or a measure. stopped-track: a lesson from a dropped or paused track. survivor: '
    + 'a strong track to deepen or recombine. student: the student’s own feedback or wish.'),
  text: text.max(2000).describe('The idea this seed suggests, in your words.'),
  clipIds: z.array(id).max(12).default([]).describe('The cutouts that ground the seed. Paper-based seeds need at least one source '
    + 'published in 2022 or later.'),
  trackId: id.nullable().default(null).describe('For stopped-track and survivor seeds: the track it comes from.'),
  note: text.max(2000).nullable().default(null).describe('For student seeds: the student’s own words.'),
});
export const seedPatchSchema = z.strictObject({
  status: z.enum(seedStatuses).optional(),
  text: text.max(2000).optional(),
  note: text.max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field.');
export const seedSchema = z.strictObject({
  id, targetId: id, batchId: id.nullable(), kind: z.enum(seedKinds), text: z.string(), clipIds: z.array(id), trackId: id.nullable(),
  status: z.enum(seedStatuses), note: z.string().nullable(), strength: z.number().int().min(0).max(100),
  newestYear: z.number().int().nullable(), citationsPerYear: z.number().nullable(), fromLab: z.boolean(), sources: z.number().int(),
  usedBy: z.array(id), createdAt: timestamp, updatedAt: timestamp,
});
export type Seed = z.infer<typeof seedSchema>;

export const batchStartSchema = z.strictObject({
  studentSaid: text.max(2000).describe('The student’s own words approving this batch.'),
  size: z.number().int().min(1).max(100).describe('How many guesses the student approved for this batch.'),
});
export const batchCloseSchema = z.strictObject({
  lessons: text.max(20000).describe('What the batch taught: what killed guesses, which seeds and sources produced survivors, how '
    + 'well predictions matched outcomes, what to avoid, and what the next batch should try. Cite tracks by number.'),
});
const armSchema = z.strictObject({
  guesses: z.number().int(), scored: z.number().int(), clearedBar: z.number().int(), meanScore: z.number().nullable(),
});
export const batchMetricsSchema = z.strictObject({
  guesses: z.number().int(), open: z.number().int(), strong: z.number().int(), paused: z.number().int(), dropped: z.number().int(),
  probeKills: z.number().int(), scored: z.number().int(), clearedBar: z.number().int(), meanScore: z.number().nullable(),
  meanStrongScore: z.number().nullable(),
  predicted: z.number().int(), brier: z.number().nullable(), seeded: z.number().int(),
  killReasons: z.record(z.string(), z.number().int()),
  arms: z.strictObject({ seeded: armSchema, control: armSchema }),
});
export const batchSchema = z.strictObject({
  id, targetId: id, number: z.number().int().positive(), status: z.enum(['open', 'closed']), size: z.number().int().nullable(),
  approval: z.string().nullable(), lessons: z.string().nullable(), createdAt: timestamp, closedAt: timestamp.nullable(),
  metrics: batchMetricsSchema,
});
export type Batch = z.infer<typeof batchSchema>;

export const categoryKinds = ['lab', 'institution', 'theme'] as const;
export const categoryInputSchema = z.strictObject({
  targetId: id,
  name: text.max(120),
  kind: z.enum(categoryKinds).describe('lab: the target lab’s own work. institution: a university, lab, or company whose papers '
    + 'cluster in the library. theme: a topic.'),
  parentId: id.nullable().default(null).describe('The category this one sits under, for a subcategory.'),
  description: text.max(500).nullable().default(null),
});
export const sourceCategoriesSchema = z.strictObject({
  categoryIds: z.array(id).max(8).describe('Every category the source belongs to; replaces its current categories.'),
});
export const categorySchema = z.strictObject({
  id, targetId: id, parentId: id.nullable(), kind: z.enum(categoryKinds), name: z.string(), description: z.string().nullable(),
  sourceIds: z.array(id), createdAt: timestamp,
});
export type Category = z.infer<typeof categorySchema>;

export const researchSchema = z.strictObject({
  sources: z.array(sourceSchema),
  tracks: z.array(trackSchema),
  clips: z.array(clipSchema),
  author: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
  settings: settingsSchema,
  running: z.number().int(),
  batches: z.array(batchSchema),
  seeds: z.array(seedSchema),
  categories: z.array(categorySchema),
});
export type Research = z.infer<typeof researchSchema>;
