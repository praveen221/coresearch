import { z } from 'zod';
import { text } from './profile-schema.ts';

export const labKinds = ['university', 'independent'] as const;
export const linkKinds = ['professor', 'programme', 'university', 'lab', 'publications', 'position'] as const;
export type LabKind = (typeof labKinds)[number];
export type LinkKind = (typeof linkKinds)[number];

export const linkUrl = z.url({ protocol: /^https?$/, error: 'Enter a full http(s) address.' }).max(2048);
export const linkSchema = z.strictObject({
  kind: z.enum(linkKinds).describe('professor: faculty or personal page. programme: PhD programme or admissions. '
    + 'university, lab: their websites. publications: Google Scholar, DBLP, ORCID, or a publication list. '
    + 'position: an advertised PhD project.'),
  url: linkUrl,
});
export type Link = z.infer<typeof linkSchema>;

const professor = text.describe('One specific professor. General applications to a lab or university are not accepted.');
const labKind = z.enum(labKinds).describe('university: the lab belongs to a university. independent: a standalone institute or lab.');
const university = text.nullable()
  .describe('Degree-granting university; for an independent lab, its partner university. null when unknown.');
const lab = text.nullable().describe('Lab name. Required for an independent lab.');
const links = z.array(linkSchema).max(50);

interface Placement { labKind: LabKind; university: string | null; lab: string | null }
const universityKnown = (value: Placement): boolean => value.labKind !== 'university' || value.university !== null;
const labNamed = (value: Placement): boolean => value.labKind !== 'independent' || value.lab !== null;
const universityRule = { message: 'A university lab needs its university.', path: ['university'] };
const labRule = { message: 'An independent lab needs its name.', path: ['lab'] };
const uniqueUrls = (items: readonly Link[]): boolean => new Set(items.map((item) => item.url)).size === items.length;

export const targetInputSchema = z.strictObject({
  professor,
  labKind,
  university: university.default(null),
  lab: lab.default(null),
  links: links.default([]).refine(uniqueUrls, 'Each address can be saved once.'),
}).refine(universityKnown, universityRule).refine(labNamed, labRule);

// Fields after a patch is merged; the same placement rules apply to every saved target.
export const targetFieldsSchema = z.strictObject({ professor, labKind, university, lab })
  .refine(universityKnown, universityRule).refine(labNamed, labRule);

const linkChanges = z.strictObject({
  add: links.optional().describe('Adding an address that is already saved changes its kind.'),
  remove: z.array(linkUrl).max(50).optional().describe('Addresses to remove; missing addresses are ignored.'),
}).refine((value) => (value.add?.length ?? 0) + (value.remove?.length ?? 0) > 0, 'Provide links to add or remove.')
  .refine((value) => !(value.add ?? []).some((item) => value.remove?.includes(item.url)),
    'An address cannot be added and removed in the same update.')
  .refine((value) => uniqueUrls(value.add ?? []), 'Each address can be added once.');

export const targetPatchSchema = z.strictObject({
  professor: professor.optional(),
  labKind: labKind.optional(),
  university: university.optional(),
  lab: lab.optional(),
  links: linkChanges.optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field.')
  .describe('Omitted fields are unchanged. Updates are atomic; invalid input changes nothing.');

export const targetSchema = z.strictObject({
  id: z.number().int().positive(),
  professor: text,
  labKind: z.enum(labKinds),
  university: text.nullable(),
  lab: text.nullable(),
  links,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const targetListSchema = z.array(targetSchema);

export type Target = z.infer<typeof targetSchema>;
export type TargetInput = z.input<typeof targetInputSchema>;
export type TargetPatch = z.infer<typeof targetPatchSchema>;
