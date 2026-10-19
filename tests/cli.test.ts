import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { profilePatchSchema, profileSchema } from '../src/lib/profile-schema.ts';
import { targetListSchema, targetSchema } from '../src/lib/target-schema.ts';

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

void test('CLI adds, reads, updates, and removes targets, and prints both target schemas', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-cli-targets-'));
  function run(args: string[], input?: string): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/coresearch.ts', ...args, '--workspace', workspace], {
      cwd: root, encoding: 'utf8', ...(input === undefined ? {} : { input }),
    });
  }
  try {
    const added = run(['target:add'], JSON.stringify({ professor: 'Example Professor', labKind: 'independent', lab: 'Example Institute' }));
    assert.equal(added.status, 0, added.stderr);
    const target = targetSchema.parse(JSON.parse(added.stdout));
    const id = String(target.id);
    const updated = run(['target:update', '--id', id], JSON.stringify({ links: { add: [{ kind: 'lab', url: 'https://lab.example' }] } }));
    assert.equal(updated.status, 0, updated.stderr);
    assert.deepEqual(targetSchema.parse(JSON.parse(run(['target:get', '--id', id]).stdout)).links, [{ kind: 'lab', url: 'https://lab.example' }]);
    assert.equal(targetListSchema.parse(JSON.parse(run(['target:list']).stdout)).length, 1);
    assert.match(run(['target:get']).stderr, /Provide --id/);
    assert.equal(run(['target:add'], JSON.stringify({ professor: 'Example Professor', labKind: 'independent' })).status, 1);
    const schemas = z.object({ add: z.object({ properties: z.record(z.string(), z.unknown()) }), update: z.object({}) })
      .parse(JSON.parse(run(['target:schema']).stdout));
    assert.deepEqual(Object.keys(schemas.add.properties), ['professor', 'labKind', 'university', 'lab', 'links']);
    assert.equal(run(['target:remove', '--id', id]).status, 0);
    assert.equal(run(['target:remove', '--id', id]).status, 1);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
