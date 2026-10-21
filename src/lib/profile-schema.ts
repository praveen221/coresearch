import { z } from 'zod';

export const text = z.string().trim().min(1, 'Cannot be blank.').max(10_000);
const items = z.array(text).max(200);
const changes = z.strictObject({
  add: items.optional().describe('Exact strings to add; duplicates are ignored.'),
  remove: items.optional().describe('Exact strings to remove; missing items are ignored.'),
}).refine((value) => (value.add?.length ?? 0) + (value.remove?.length ?? 0) > 0,
  'Provide items to add or remove.').refine((value) =>
  !(value.add ?? []).some((item) => value.remove?.includes(item)),
  'An item cannot be added and removed in the same update.');
const clearable = text.nullable().optional();

export const profilePatchSchema = z.strictObject({
  name: clearable.describe('Student name; null clears it.'),
  background: clearable.describe('Education, work, and research experience; null clears it.'),
  needsFunding: z.boolean().nullable().optional().describe('null means unknown.'),
  fundingNotes: clearable.describe('Funding details; null clears it.'),
  website: z.url({ protocol: /^https?$/, error: 'Enter a full http(s) address.' }).max(2048).nullable().optional()
    .describe('The student’s website or portfolio; read it to understand their background. null clears it.'),
  interests: changes.optional(),
  constraints: changes.optional(),
  collaborators: changes.optional().describe('People the student has worked with, such as co-authors and advisors, as full names; used '
    + 'to find contacts they share with each professor.'),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field.')
  .describe('Omitted fields are unchanged. Updates are atomic; invalid input changes nothing.');

export const profileSchema = z.strictObject({
  name: text.nullable(),
  background: text.nullable(),
  needsFunding: z.boolean().nullable(),
  fundingNotes: text.nullable(),
  website: z.string().nullable(),
  interests: items,
  constraints: items,
  collaborators: items,
  cv: z.strictObject({ filePath: z.string(), pageCount: z.number().int().nonnegative(), addedAt: z.iso.datetime() }).nullable(),
  updatedAt: z.iso.datetime().nullable(),
});

export type Profile = z.infer<typeof profileSchema>;
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
