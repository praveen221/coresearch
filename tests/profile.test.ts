import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { getProfile, updateProfile } from '../src/lib/profile.ts';
import { workspacePath } from '../src/lib/database.ts';

function fixture(run: (workspace: string) => void): void {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-profile-'));
  try { run(workspace); } finally { rmSync(workspace, { recursive: true, force: true }); }
}

void test('initialization is repeatable and preserves unknown fields', () => {
  fixture((workspace) => {
    const empty = getProfile(workspace);
    assert.equal(empty.name, null);
    assert.equal(empty.needsFunding, null);
    assert.equal(empty.updatedAt, null);
    updateProfile({ name: 'Example Student', interests: { add: ['Voice agents'] } }, workspace);
    assert.equal(getProfile(workspace).name, 'Example Student');
    assert.deepEqual(getProfile(workspace).interests, ['Voice agents']);
    const db = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try {
      assert.throws(() => db.prepare('INSERT INTO profile (id) VALUES (2)').run());
      assert.equal(db.prepare('SELECT count(*) AS count FROM profile').get()?.['count'], 1);
    } finally { db.close(); }
  });
});

void test('partial updates, explicit clearing, list changes, and duplicate handling persist across connections', () => {
  fixture((workspace) => {
    updateProfile({ name: ' Example Student ', background: 'Engineer', needsFunding: true,
      interests: { add: ['Voice agents', 'Voice agents', 'Manipulation in voice'] } }, workspace);
    const saved = updateProfile({ fundingNotes: 'Full funding needed', interests: { remove: ['Voice agents', 'Missing'], add: ['Hindi interaction'] } }, workspace);
    assert.equal(saved.name, 'Example Student');
    assert.equal(saved.background, 'Engineer');
    assert.equal(saved.needsFunding, true);
    assert.deepEqual(saved.interests, ['Manipulation in voice', 'Hindi interaction']);
    const cleared = updateProfile({ name: null, needsFunding: false }, workspace);
    assert.equal(cleared.name, null);
    assert.equal(cleared.needsFunding, false);
    assert.equal(updateProfile({ needsFunding: null }, workspace).needsFunding, null);
    assert.equal(getProfile(workspace).fundingNotes, 'Full funding needed');
  });
});

void test('invalid updates leave all existing data unchanged', () => {
  fixture((workspace) => {
    const before = updateProfile({ name: 'Original' }, workspace);
    for (const bad of [{ name: '' }, { needsFunding: 'yes' }, { arbitrary: 'field' }, {},
      { interests: {} }, { interests: { add: ['same'], remove: ['same'] } }, { name: 'x'.repeat(10_001) }]) {
      assert.throws(() => updateProfile(bad, workspace));
      assert.deepEqual(getProfile(workspace), before);
    }
  });
});

void test('list overflow rolls back scalar and item changes together', () => {
  fixture((workspace) => {
    const before = updateProfile({ name: 'Original', interests: { add: Array.from({ length: 200 }, (_, i) => `Interest ${String(i)}`) } }, workspace);
    assert.throws(() => updateProfile({ name: 'Changed', interests: { add: ['Overflow'] } }, workspace));
    assert.deepEqual(getProfile(workspace), before);
  });
});

void test('Unicode, quotes, SQL-like strings, and full sentences remain literal data', () => {
  fixture((workspace) => {
    const value = "आवाज़ — I study manipulation; DROP TABLE profile; 'quoted'";
    updateProfile({ interests: { add: [value] }, constraints: { add: ['Requires funding.'] } }, workspace);
    assert.deepEqual(getProfile(workspace).interests, [value]);
    assert.deepEqual(getProfile(workspace).constraints, ['Requires funding.']);
  });
});

void test('rejects corrupted stored values and unsupported schema versions', () => {
  fixture((workspace) => {
    getProfile(workspace);
    const db = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try { db.exec("UPDATE profile SET updated_at = 'invalid'"); } finally { db.close(); }
    assert.throws(() => getProfile(workspace));
  });
  fixture((workspace) => {
    getProfile(workspace);
    const db = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try { db.exec('PRAGMA user_version = 99'); } finally { db.close(); }
    assert.throws(() => getProfile(workspace), /Unsupported database version/);
  });
});

void test('refuses unknown databases and ambiguous relative workspace paths', () => {
  fixture((workspace) => {
    const db = new DatabaseSync(join(workspace, 'coresearch.sqlite'));
    try { db.exec('CREATE TABLE unrelated (id INTEGER)'); } finally { db.close(); }
    assert.throws(() => getProfile(workspace), /unknown database/);
  });
  assert.throws(() => workspacePath('./private'), /absolute path/);
});
