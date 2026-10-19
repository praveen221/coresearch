import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ConflictError, NotFoundError } from '../src/lib/errors.ts';
import { getProfile, updateProfile } from '../src/lib/profile.ts';
import { addTarget, getTarget, listTargets, removeTarget, updateTarget } from '../src/lib/targets.ts';

function fixture(run: (workspace: string) => void): void {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-targets-'));
  try { run(workspace); } finally { rmSync(workspace, { recursive: true, force: true }); }
}

const universityTarget = {
  professor: 'Example Professor', labKind: 'university', university: 'Example University',
  links: [{ kind: 'professor', url: 'https://example.edu/people/professor' }],
};

void test('a target needs a specific professor and the institution its lab type requires', () => {
  fixture((workspace) => {
    for (const bad of [
      { ...universityTarget, professor: ' ' },
      { labKind: 'university', university: 'Example University' },
      { professor: 'Example Professor', labKind: 'university' },
      { professor: 'Example Professor', labKind: 'independent' },
      { ...universityTarget, labKind: 'department' },
      { ...universityTarget, extra: true },
    ]) assert.throws(() => addTarget(bad, workspace));
    assert.deepEqual(listTargets(workspace), []);
    const independent = addTarget({ professor: 'Example Professor', labKind: 'independent', lab: 'Example Institute' }, workspace);
    assert.equal(independent.university, null);
    assert.deepEqual(independent.links, []);
  });
});

void test('links accept only http(s) addresses, once each, from the known kinds', () => {
  fixture((workspace) => {
    for (const links of [
      [{ kind: 'professor', url: 'javascript:alert(1)' }],
      [{ kind: 'professor', url: 'example.edu' }],
      [{ kind: 'blog', url: 'https://example.edu' }],
      [{ kind: 'lab', url: 'https://lab.example' }, { kind: 'professor', url: 'https://lab.example' }],
    ]) assert.throws(() => addTarget({ ...universityTarget, links }, workspace));
    assert.deepEqual(listTargets(workspace), []);
  });
});

void test('updates merge fields, add, re-kind, and remove links, and keep other targets unchanged', () => {
  fixture((workspace) => {
    const first = addTarget(universityTarget, workspace);
    const other = addTarget({ ...universityTarget, professor: 'Other Professor' }, workspace);
    const updated = updateTarget(first.id, { lab: 'Example Lab', links: {
      add: [{ kind: 'lab', url: 'https://lab.example' }, { kind: 'publications', url: 'https://example.edu/people/professor' }],
    } }, workspace);
    assert.equal(updated.university, 'Example University');
    assert.equal(updated.lab, 'Example Lab');
    assert.deepEqual(updated.links, [
      { kind: 'publications', url: 'https://example.edu/people/professor' }, { kind: 'lab', url: 'https://lab.example' },
    ]);
    const removed = updateTarget(first.id, { links: { remove: ['https://lab.example', 'https://missing.example'] } }, workspace);
    assert.equal(removed.links.length, 1);
    assert.deepEqual(getTarget(other.id, workspace), other);
  });
});

void test('invalid, conflicting, or stale updates change nothing', () => {
  fixture((workspace) => {
    const loaded = addTarget(universityTarget, workspace);
    for (const bad of [{}, { university: null }, { labKind: 'independent' }, { professor: '' },
      { links: { add: [{ kind: 'lab', url: 'https://lab.example' }], remove: ['https://lab.example'] } },
      { links: { add: Array.from({ length: 50 }, (_, i) => ({ kind: 'lab', url: `https://lab.example/${String(i)}` })) } }]) {
      assert.throws(() => updateTarget(loaded.id, bad, workspace));
      assert.deepEqual(getTarget(loaded.id, workspace), loaded);
    }
    const elsewhere = updateTarget(loaded.id, { lab: 'Saved by the agent' }, workspace);
    assert.throws(() => updateTarget(loaded.id, { lab: 'Stale edit' }, workspace, { updatedAt: loaded.updatedAt }), ConflictError);
    assert.deepEqual(getTarget(loaded.id, workspace), elsewhere);
  });
});

void test('removing a target deletes its links; missing targets are reported', () => {
  fixture((workspace) => {
    const target = addTarget(universityTarget, workspace);
    assert.deepEqual(removeTarget(target.id, workspace), { removed: target.id });
    assert.throws(() => getTarget(target.id, workspace), NotFoundError);
    assert.throws(() => removeTarget(target.id, workspace), NotFoundError);
    assert.throws(() => updateTarget(target.id, { lab: 'x' }, workspace), NotFoundError);
    const db = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try { assert.equal(db.prepare('SELECT count(*) AS count FROM target_links').get()?.['count'], 0); } finally { db.close(); }
  });
});

void test('a version 1 database gains target tables and keeps its profile', () => {
  fixture((workspace) => {
    const profile = updateProfile({ name: 'Example Student' }, workspace);
    const db = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try { db.exec('DROP TABLE target_links; DROP TABLE targets; PRAGMA user_version = 1;'); } finally { db.close(); }
    assert.deepEqual(getProfile(workspace), profile);
    assert.deepEqual(listTargets(workspace), []);
    addTarget(universityTarget, workspace);
    const upgraded = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try { assert.equal(upgraded.prepare('PRAGMA user_version').get()?.['user_version'], 3); } finally { upgraded.close(); }
  });
});
