import type { Profile, ProfilePatch } from './profile-schema.ts';

type Funding = 'unknown' | 'yes' | 'no';
export interface Draft {
  name: string;
  background: string;
  needsFunding: Funding;
  fundingNotes: string;
  website: string;
  interests: string[];
  constraints: string[];
  collaborators: string[];
}

export function toDraft(profile: Profile): Draft {
  return {
    name: profile.name ?? '',
    background: profile.background ?? '',
    needsFunding: profile.needsFunding === null ? 'unknown' : profile.needsFunding ? 'yes' : 'no',
    fundingNotes: profile.fundingNotes ?? '',
    website: profile.website ?? '',
    interests: [...profile.interests],
    constraints: [...profile.constraints],
    collaborators: [...profile.collaborators],
  };
}

function fundingValue(value: Funding): boolean | null {
  return value === 'unknown' ? null : value === 'yes';
}

export function toPatch(base: Profile, draft: Draft): ProfilePatch {
  const patch: ProfilePatch = {};
  for (const key of ['name', 'background', 'fundingNotes', 'website'] as const) {
    const value = draft[key].trim() === '' ? null : draft[key].trim();
    if (value !== base[key]) patch[key] = value;
  }
  const needsFunding = fundingValue(draft.needsFunding);
  if (needsFunding !== base.needsFunding) patch.needsFunding = needsFunding;
  for (const key of ['interests', 'constraints', 'collaborators'] as const) {
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
  ['fundingNotes', 'funding details'], ['website', 'website'], ['interests', 'interests'], ['constraints', 'constraints'],
  ['collaborators', 'collaborators'],
] as const;

export function changedFields(before: Profile, after: Profile): string[] {
  const a = toDraft(before);
  const b = toDraft(after);
  return fieldLabels.filter(([key]) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(([, label]) => label);
}

export function rebase(latest: Profile, patch: ProfilePatch): Draft {
  const draft = toDraft(latest);
  for (const key of ['name', 'background', 'fundingNotes', 'website'] as const) {
    const value = patch[key];
    if (value !== undefined) draft[key] = value ?? '';
  }
  if (patch.needsFunding !== undefined) {
    draft.needsFunding = patch.needsFunding === null ? 'unknown' : patch.needsFunding ? 'yes' : 'no';
  }
  for (const key of ['interests', 'constraints', 'collaborators'] as const) {
    const changes = patch[key];
    if (changes === undefined) continue;
    const kept = draft[key].filter((item) => !(changes.remove ?? []).includes(item));
    draft[key] = [...kept, ...(changes.add ?? []).filter((item) => !kept.includes(item))];
  }
  return draft;
}
