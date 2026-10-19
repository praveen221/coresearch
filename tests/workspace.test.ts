import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chooseWorkspace, currentWorkspace, rememberWorkspace, rememberedWorkspace } from '../src/lib/workspace.ts';

function fixture(run: (root: string, settings: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'coresearch-workspace-'));
  try { run(root, join(root, 'settings')); } finally { rmSync(root, { recursive: true, force: true }); }
}

void test('the first setup needs a chosen folder, which every later command then uses', () => {
  fixture((root, settings) => {
    assert.throws(() => chooseWorkspace(settings, undefined), /Choose where/);
    assert.throws(() => currentWorkspace(settings, undefined), /not set up/);
    assert.throws(() => chooseWorkspace(settings, 'relative/folder'), /absolute/);
    const chosen = join(root, 'My PhD research');
    assert.equal(chooseWorkspace(settings, chosen), chosen);
    mkdirSync(chosen);
    rememberWorkspace(settings, chosen);
    assert.equal(rememberedWorkspace(settings), chosen);
    assert.equal(currentWorkspace(settings, undefined), chosen);
    assert.equal(chooseWorkspace(settings, undefined), chosen);
    assert.equal(chooseWorkspace(settings, chosen), chosen);
  });
});

void test('only one workspace is supported, unless the remembered folder no longer exists', () => {
  fixture((root, settings) => {
    const first = join(root, 'first');
    mkdirSync(first);
    rememberWorkspace(settings, first);
    assert.throws(() => chooseWorkspace(settings, join(root, 'second')), /only one workspace/);
    rmSync(first, { recursive: true });
    assert.throws(() => currentWorkspace(settings, undefined), /missing/);
    assert.equal(chooseWorkspace(settings, join(root, 'moved')), join(root, 'moved'));
  });
});

void test('a workspace inside a Git repository must be a folder the repository ignores', () => {
  fixture((root, settings) => {
    const repository = join(root, 'repository');
    mkdirSync(repository);
    assert.equal(spawnSync('git', ['init', '--quiet', repository]).status, 0);
    writeFileSync(join(repository, '.gitignore'), '/private/\n');
    assert.throws(() => chooseWorkspace(settings, join(repository, 'research')), /could be committed/);
    assert.throws(() => chooseWorkspace(settings, repository), /could be committed/);
    assert.equal(chooseWorkspace(settings, join(repository, 'private')), join(repository, 'private'));
  });
});
