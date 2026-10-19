import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedFields, rebase, toDraft, toPatch } from '../src/lib/profile-draft.ts';
import { profilePatchSchema } from '../src/lib/profile-schema.ts';
import type { Profile } from '../src/lib/profile-schema.ts';

const base: Profile = {
  name: 'Example Student', background: null, needsFunding: null, fundingNotes: null,
  interests: ['Voice agents'], constraints: [], updatedAt: '2026-01-01T00:00:00.000Z',
};

void test('an unchanged form produces no patch', () => {
  assert.deepEqual(toPatch(base, toDraft(base)), {});
});

void test('the patch holds only changed fields; blank text clears and lists become add/remove', () => {
  const draft = { ...toDraft(base), name: '  ', background: ' Engineer ', needsFunding: 'yes' as const,
    interests: ['Hindi interaction'] };
  const patch = toPatch(base, draft);
  assert.deepEqual(patch, { name: null, background: 'Engineer', needsFunding: true,
    interests: { add: ['Hindi interaction'], remove: ['Voice agents'] } });
  assert.equal(profilePatchSchema.safeParse(patch).success, true);
});

void test('rebasing keeps the student edits and the other writer changes to different fields', () => {
  const latest: Profile = { ...base, background: 'Saved by the agent', interests: ['Voice agents', 'Agent interest'],
    updatedAt: '2026-01-02T00:00:00.000Z' };
  const edits = toPatch(base, { ...toDraft(base), name: 'Edited name', interests: ['UI interest'] });
  const draft = rebase(latest, edits);
  assert.equal(draft.name, 'Edited name');
  assert.equal(draft.background, 'Saved by the agent');
  assert.deepEqual(draft.interests, ['Agent interest', 'UI interest']);
  assert.deepEqual(changedFields(base, latest), ['background', 'interests']);
});
