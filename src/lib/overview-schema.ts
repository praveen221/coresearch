import { z } from 'zod';
import { fitKindSchema } from './fit-schema.ts';

const id = z.number().int().positive();
const date = z.iso.date();

export const stageStates = ['done', 'doing', 'todo', 'blocked'] as const;
export type StageState = (typeof stageStates)[number];
export const stageSchema = z.strictObject({ label: z.string(), state: z.enum(stageStates), detail: z.string().nullable() });
export type Stage = z.infer<typeof stageSchema>;

const fitSchema = z.strictObject({ score: z.number(), max: z.number(), checked: z.number(), counted: z.number() }).nullable();

const professorSchema = z.strictObject({
  targetId: id, professor: z.string(), university: z.string().nullable(), deadline: date.nullable(), daysLeft: z.number().int().nullable(),
  finalList: z.boolean(), fit: fitSchema, rank: z.number().int().positive().nullable(), papers: z.number().int(), stages: z.array(stageSchema),
  next: z.string(),
});

export const proposalSchema = professorSchema.extend({
  directions: z.strictObject({
    tested: z.number().int(), running: z.number().int(), waiting: z.number().int(), strong: z.number().int(), clear: z.number().int(),
  }),
  shortlist: z.array(z.strictObject({ id, title: z.string(), score: z.number().int().nullable(), clears: z.boolean() })),
});
export type ProposalItem = z.infer<typeof proposalSchema>;

export const pitchStates = ['draft', 'sent', 'replied', 'declined', 'hold', 'none'] as const;
export type PitchState = (typeof pitchStates)[number];
export const pitchItemSchema = professorSchema.extend({ status: z.enum(pitchStates), sendBy: date.nullable() });
export type PitchItem = z.infer<typeof pitchItemSchema>;

export const stepSchema = z.strictObject({
  date: date.nullable(), professor: z.string().nullable(), text: z.string(), href: z.string(), targetId: id.nullable(), finalList: z.boolean(),
});
export type Step = z.infer<typeof stepSchema>;

export const overviewSchema = z.strictObject({
  name: z.string().nullable(), cv: z.boolean(), today: date, proposals: z.array(proposalSchema), pitches: z.array(pitchItemSchema),
  steps: z.array(stepSchema), kinds: z.array(fitKindSchema),
});
export type Overview = z.infer<typeof overviewSchema>;
