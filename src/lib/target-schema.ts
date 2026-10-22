import { z } from 'zod';
import { fitScoresSchema } from './fit-schema.ts';
import { text } from './profile-schema.ts';

export const labKinds = ['university', 'independent'] as const;
export const linkKinds = ['professor', 'programme', 'university', 'lab', 'publications', 'position'] as const;
export const regions = ['us', 'uk', 'europe', 'canada', 'asia-pacific', 'other'] as const;
export const pathways = ['proposal', 'pitch'] as const;
export const openings = ['yes', 'no', 'unknown'] as const;
export type LabKind = (typeof labKinds)[number];
export type LinkKind = (typeof linkKinds)[number];
export type Region = (typeof regions)[number];
export type Pathway = (typeof pathways)[number];
export type Opening = (typeof openings)[number];

export const regionLabels: Record<Region, string> = {
  us: 'US', uk: 'UK', europe: 'Europe', canada: 'Canada', 'asia-pacific': 'Asia-Pacific', other: 'Other',
};
export const pathwayLabels: Record<Pathway, string> = { proposal: 'Proposal', pitch: 'Pitch' };
export function onFinalList(target: Readonly<{ notes: Readonly<Record<string, string>> }>): boolean {
  return target.notes['Final list'] !== undefined;
}

export function defaultPathway(region: Region | null): Pathway {
  return region === 'uk' || region === 'europe' ? 'proposal' : 'pitch';
}

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
const country = text.max(80).nullable().describe('Country of the university or lab; null when unknown.');
const region = z.enum(regions).nullable().describe('us, uk, europe, canada, asia-pacific, or other; null when unknown. UK and '
  + 'Europe default to the proposal path, everywhere else to the pitch path.');
const pathway = z.enum(pathways).nullable().describe('proposal: strong tracks become a research proposal the student writes. pitch: a '
  + 'connection pitch and an outreach draft the student edits and sends. null follows the region.');
const notes = z.record(text.max(120), text.max(2000)).refine((value) => Object.keys(value).length <= 40, 'Keep at most 40 notes.')
  .describe('The student’s own notes about this professor, such as the columns of an imported list.');
const clipId = z.number().int().positive();
const openingsInput = z.strictObject({
  status: z.enum(openings).describe('Whether the professor says they are taking PhD students.'),
  clipId: clipId.nullable().default(null).describe('The cutout from their page or programme that says so; required unless unknown.'),
}).refine((value) => value.status === 'unknown' || value.clipId !== null, 'Cite the cutout that states it.');
const deadlineInput = z.strictObject({
  date: z.iso.date().describe('The application deadline, YYYY-MM-DD.'),
  clipId: clipId.describe('The requirement cutout from the programme page that states the deadline.'),
});

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
  country: country.default(null),
  region: region.default(null),
  pathway: pathway.default(null),
  notes: notes.default({}),
}).refine(universityKnown, universityRule).refine(labNamed, labRule);

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
  country: country.optional(),
  region: region.optional(),
  pathway: pathway.optional(),
  notes: notes.optional().describe('Replaces the saved notes.'),
  openings: openingsInput.optional(),
  deadline: deadlineInput.nullable().optional(),
  pitchHold: text.max(600).nullable().optional().describe('Why no outreach draft should be written, such as a programme rule against '
    + 'AI assistance; null clears it.'),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field.')
  .describe('Omitted fields are unchanged. Updates are atomic; invalid input changes nothing.');

export const targetSchema = z.strictObject({
  id: z.number().int().positive(),
  professor: text,
  labKind: z.enum(labKinds),
  university: text.nullable(),
  lab: text.nullable(),
  links,
  country: text.nullable(),
  region: z.enum(regions).nullable(),
  pathway: z.enum(pathways),
  notes: z.record(z.string(), z.string()),
  openings: z.strictObject({ status: z.enum(openings), clipId: clipId.nullable() }),
  deadline: z.strictObject({ date: z.string(), clipId }).nullable(),
  pitchHold: text.nullable(),
  fit: fitScoresSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const targetListSchema = z.array(targetSchema);

export type Target = z.infer<typeof targetSchema>;
export type TargetInput = z.input<typeof targetInputSchema>;
export type TargetPatch = z.infer<typeof targetPatchSchema>;
