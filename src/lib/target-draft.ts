import type { LabKind, Link, Target, TargetInput, TargetPatch } from './target-schema.ts';

export interface TargetDraft {
  labKind: LabKind;
  professor: string;
  university: string;
  lab: string;
  links: Link[];
}

export const emptyTargetDraft: TargetDraft = { labKind: 'university', professor: '', university: '', lab: '', links: [] };

export function toTargetDraft(target: Target): TargetDraft {
  return {
    labKind: target.labKind,
    professor: target.professor,
    university: target.university ?? '',
    lab: target.lab ?? '',
    links: target.links.map((link) => ({ ...link })),
  };
}

function optional(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

export function toTargetInput(draft: TargetDraft): TargetInput {
  return {
    labKind: draft.labKind, professor: draft.professor.trim(),
    university: optional(draft.university), lab: optional(draft.lab), links: draft.links,
  };
}

export function toTargetPatch(base: Target, draft: TargetDraft): TargetPatch {
  const patch: TargetPatch = {};
  if (draft.labKind !== base.labKind) patch.labKind = draft.labKind;
  if (draft.professor.trim() !== base.professor) patch.professor = draft.professor.trim();
  for (const key of ['university', 'lab'] as const) {
    const value = optional(draft[key]);
    if (value !== base[key]) patch[key] = value;
  }
  const add = draft.links.filter((link) => !base.links.some((saved) => saved.url === link.url && saved.kind === link.kind));
  const remove = base.links.filter((saved) => !draft.links.some((link) => link.url === saved.url)).map((saved) => saved.url);
  if (add.length > 0 || remove.length > 0) {
    patch.links = { ...(add.length > 0 ? { add } : {}), ...(remove.length > 0 ? { remove } : {}) };
  }
  return patch;
}

export function rebaseTarget(latest: Target, patch: TargetPatch): TargetDraft {
  const draft = toTargetDraft(latest);
  if (patch.labKind !== undefined) draft.labKind = patch.labKind;
  if (patch.professor !== undefined) draft.professor = patch.professor;
  if (patch.university !== undefined) draft.university = patch.university ?? '';
  if (patch.lab !== undefined) draft.lab = patch.lab ?? '';
  const removed = patch.links?.remove ?? [];
  const added = patch.links?.add ?? [];
  const kept = draft.links.filter((link) => !removed.includes(link.url) && !added.some((item) => item.url === link.url));
  draft.links = [...kept, ...added];
  return draft;
}

const fieldLabels = [
  ['labKind', 'lab type'], ['professor', 'professor'], ['university', 'university'], ['lab', 'lab'], ['links', 'links'],
] as const;

export function changedTargetFields(before: Target, after: Target): string[] {
  const a = toTargetDraft(before);
  const b = toTargetDraft(after);
  return fieldLabels.filter(([key]) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(([, label]) => label);
}
