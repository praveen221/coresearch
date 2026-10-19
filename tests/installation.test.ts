import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pullLatest } from '../src/lib/installation.ts';

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

// An upstream repository, a developer clone that publishes changes, and an installed clone.
function fixture(run: (paths: { root: string; developer: string; installed: string }) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'coresearch-install-'));
  try {
    git(root, 'init', '--bare', '--initial-branch=main', 'origin.git');
    git(root, 'clone', '--quiet', 'origin.git', 'developer');
    const developer = join(root, 'developer');
    writeFileSync(join(developer, 'SKILL.md'), 'v1\n');
    git(developer, 'add', '.');
    git(developer, 'commit', '--quiet', '-m', 'v1');
    git(developer, 'push', '--quiet', 'origin', 'HEAD:main');
    git(root, 'clone', '--quiet', 'origin.git', 'installed');
    run({ root, developer, installed: join(root, 'installed') });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

void test('update fast-forwards the installation itself and reports when nothing changed', () => {
  fixture(({ developer, installed }) => {
    writeFileSync(join(developer, 'SKILL.md'), 'v2\n');
    git(developer, 'commit', '--quiet', '-am', 'v2');
    git(developer, 'push', '--quiet', 'origin', 'HEAD:main');
    const first = pullLatest(installed);
    assert.notEqual(first.from, first.to);
    const second = pullLatest(installed);
    assert.equal(second.from, second.to);
    assert.equal(second.to, first.to);
  });
});

void test('update refuses local changes and folders that are not their own checkout', () => {
  fixture(({ root, installed }) => {
    writeFileSync(join(installed, 'SKILL.md'), 'edited locally\n');
    assert.throws(() => pullLatest(installed), /local changes/);
    // A copy without its own .git, nested in another repository, must not update that repository.
    const nested = join(installed, 'copy');
    mkdirSync(nested);
    assert.throws(() => pullLatest(nested), /not its own Git checkout/);
    const plain = join(root, 'plain');
    mkdirSync(plain);
    assert.throws(() => pullLatest(plain), /not its own Git checkout/);
  });
});
