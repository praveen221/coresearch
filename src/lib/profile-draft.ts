// Converts between saved profiles and editable form state.
import type { Profile, ProfilePatch } from './profile-schema.ts';

type Funding = 'unknown' | 'yes' | 'no';
export interface Draft {
  name: string;
  background: string;
  needsFunding: Funding;
  fundingNotes: string;
  interests: string[];
  constraints: string[];
}

export function toDraft(profile: Profile): Draft {
  return {
    name: profile.name ?? '',
    background: profile.background ?? '',
    needsFunding: profile.needsFunding === null ? 'unknown' : profile.needsFunding ? 'yes' : 'no',
    fundingNotes: profile.fundingNotes ?? '',
    interests: [...profile.interests],
    constraints: [...profile.constraints],
  };
}

function fundingValue(value: Funding): boolean | null {
  return value === 'unknown' ? null : value === 'yes';
}

// Sends only changed fields, so concurrent edits to other fields are never overwritten.
export function toPatch(base: Profile, draft: Draft): ProfilePatch {
  const patch: ProfilePatch = {};
  for (const key of ['name', 'background', 'fundingNotes'] as const) {
    const value = draft[key].trim() === '' ? null : draft[key].trim();
    if (value !== base[key]) patch[key] = value;
  }
  const needsFunding = fundingValue(draft.needsFunding);
  if (needsFunding !== base.needsFunding) patch.needsFunding = needsFunding;
  for (const key of ['interests', 'constraints'] as const) {
    const add = draft[key].filter((item) => !base[key].includes(item));
    const remove = base[key].filter((item) => !draft[key].includes(item));
    if (add.length > 0 || remove.length > 0) {
      patch[key] = { ...(add.length > 0 ? { add } : {}), ...(remove.length > 0 ? { remove } : {}) };
    }
  }
  return patch;
}

const fieldLabels = [
  ['name', 'name'], ['background', 'background'], ['needsFunding', 'funding situation'],
  ['fundingNotes', 'funding details'], ['interests', 'interests'], ['constraints', 'constraints'],
] as const;

export function changedFields(before: Profile, after: Profile): string[] {
  const a = toDraft(before);
  const b = toDraft(after);
  return fieldLabels.filter(([key]) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(([, label]) => label);
}

// Re-applies the student's own changes on top of a profile another writer saved.
export function rebase(latest: Profile, patch: ProfilePatch): Draft {
  const draft = toDraft(latest);
  for (const key of ['name', 'background', 'fundingNotes'] as const) {
    const value = patch[key];
    if (value !== undefined) draft[key] = value ?? '';
  }
  if (patch.needsFunding !== undefined) {
    draft.needsFunding = patch.needsFunding === null ? 'unknown' : patch.needsFunding ? 'yes' : 'no';
  }
  for (const key of ['interests', 'constraints'] as const) {
    const changes = patch[key];
    if (changes === undefined) continue;
    const kept = draft[key].filter((item) => !(changes.remove ?? []).includes(item));
    draft[key] = [...kept, ...(changes.add ?? []).filter((item) => !kept.includes(item))];
  }
  return draft;
}
