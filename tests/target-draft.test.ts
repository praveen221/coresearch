import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedTargetFields, emptyTargetDraft, rebaseTarget, toTargetDraft, toTargetInput, toTargetPatch } from '../src/lib/target-draft.ts';
import { targetInputSchema, targetPatchSchema } from '../src/lib/target-schema.ts';
import type { Target } from '../src/lib/target-schema.ts';

const base: Target = {
  id: 1, professor: 'Example Professor', labKind: 'university', university: 'Example University', lab: null,
  links: [{ kind: 'professor', url: 'https://example.edu/p' }],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

void test('a new form produces valid input; blank optional fields become null', () => {
  const input = toTargetInput({ ...emptyTargetDraft, professor: ' Example Professor ', university: 'Example University', lab: ' ' });
  assert.deepEqual(targetInputSchema.parse(input), {
    professor: 'Example Professor', labKind: 'university', university: 'Example University', lab: null, links: [],
  });
});

void test('the patch holds only changed fields, and a re-kinded link is sent as an add', () => {
  assert.deepEqual(toTargetPatch(base, toTargetDraft(base)), {});
  const patch = toTargetPatch(base, { ...toTargetDraft(base), lab: 'Example Lab',
    links: [{ kind: 'publications', url: 'https://example.edu/p' }, { kind: 'lab', url: 'https://lab.example' }] });
  assert.deepEqual(patch, { lab: 'Example Lab', links: { add: [
    { kind: 'publications', url: 'https://example.edu/p' }, { kind: 'lab', url: 'https://lab.example' }] } });
  assert.equal(targetPatchSchema.safeParse(patch).success, true);
});

void test('rebasing keeps the student edits and the other writer changes', () => {
  const latest: Target = { ...base, lab: 'Saved by the agent',
    links: [...base.links, { kind: 'programme', url: 'https://example.edu/phd' }], updatedAt: '2026-01-02T00:00:00.000Z' };
  const edits = toTargetPatch(base, { ...toTargetDraft(base), professor: 'Edited Professor', links: [] });
  const draft = rebaseTarget(latest, edits);
  assert.equal(draft.professor, 'Edited Professor');
  assert.equal(draft.lab, 'Saved by the agent');
  assert.deepEqual(draft.links, [{ kind: 'programme', url: 'https://example.edu/phd' }]);
  assert.deepEqual(changedTargetFields(base, latest), ['lab', 'links']);
});
