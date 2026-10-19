import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { profilePatchSchema, profileSchema } from '../src/lib/profile-schema.ts';

const root = new URL('..', import.meta.url);

void test('CLI accepts stdin updates, survives separate invocations, rejects malformed input, and prints its update schema', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-cli-'));
  function run(command: string, input?: string): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/coresearch.ts', command, '--workspace', workspace], {
      cwd: root, encoding: 'utf8', ...(input === undefined ? {} : { input }),
    });
  }
  try {
    const saved = run('profile:update', JSON.stringify({ name: 'Example Student', interests: { add: ['Voice agents'] } }));
    assert.equal(saved.status, 0, saved.stderr);
    const result = profileSchema.parse(JSON.parse(saved.stdout));
    assert.equal(result.name, 'Example Student');
    assert.deepEqual(result.interests, ['Voice agents']);
    assert.equal(run('profile:update', '{bad json').status, 1);
    assert.equal(run('profile:update', JSON.stringify({ unexpected: true })).status, 1);
    const read = run('profile:get');
    assert.equal(read.status, 0, read.stderr);
    assert.deepEqual(profileSchema.parse(JSON.parse(read.stdout)), result);
    assert.equal(run('unknown-command').status, 1);
    const schema = run('profile:schema');
    assert.equal(schema.status, 0, schema.stderr);
    const fields = z.object({ properties: z.record(z.string(), z.unknown()), additionalProperties: z.literal(false) })
      .parse(JSON.parse(schema.stdout));
    assert.deepEqual(Object.keys(fields.properties), Object.keys(profilePatchSchema.shape));
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
