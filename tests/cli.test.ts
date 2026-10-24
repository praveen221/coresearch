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
    assert.match(run('profile:update', '{bad json').stderr, /Stdin was not valid JSON/);
    assert.match(run('profile:update', '').stderr, /Supply JSON on stdin/);
    assert.match(run('profile:update', JSON.stringify({ unexpected: true })).stderr, /unexpected/);
    const read = run('profile:get');
    assert.equal(read.status, 0, read.stderr);
    assert.deepEqual(profileSchema.parse(JSON.parse(read.stdout)), result);
    assert.match(run('unknown-command').stderr, /Unknown command/);
    assert.doesNotMatch(run('unknown-command').stderr, /profile:schema/);
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
    assert.deepEqual(Object.keys(schemas.add.properties), ['professor', 'labKind', 'university', 'lab', 'links', 'country', 'region', 'pathway', 'notes']);
    const brief = run(['role', 'fit-scorer', '--target', id]);
    assert.equal(brief.status, 0, brief.stderr);
    assert.match(brief.stdout, /^You are the fit scorer for Coresearch/);
    assert.match(brief.stdout, /Professor: Example Professor, Example Institute\. Target \d+, pitch path\./);
    assert.match(brief.stdout, /- topic \(Topic\): Does your work address/);
    assert.match(brief.stdout, /Never put the student’s name, email, or other personal data/);
    assert.match(run(['role', 'critic', '--target', id]).stderr, /No drafts in .*run the drafter role first/);
    assert.match(run(['role', 'investigator', '--target', id]).stderr, /needs --track/);
    assert.match(run(['role', 'nobody', '--target', id]).stderr, /error/);
    assert.match(run(['role']).stderr, /Name one role/);
    assert.equal(run(['target:remove', '--id', id]).status, 0);
    assert.equal(run(['target:remove', '--id', id]).status, 1);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

void test('CLI saves ideas, prints the research guide and schemas, and reports research errors', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch-cli-research-'));
  function run(args: string[], input?: string): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/coresearch.ts', ...args, '--workspace', workspace], {
      cwd: root, encoding: 'utf8', ...(input === undefined ? {} : { input }),
    });
  }
  try {
    const idea = run(['idea:add'], JSON.stringify({ kind: 'question', text: 'Does warmth make wrong advice persuasive?' }));
    assert.equal(idea.status, 0, idea.stderr);
    assert.equal(z.array(z.unknown()).parse(JSON.parse(run(['idea:list']).stdout)).length, 1);
    const guide = z.object({ rules: z.array(z.string()), steps: z.array(z.object({ step: z.string(), do: z.array(z.string()) })) })
      .parse(JSON.parse(run(['guide']).stdout));
    assert.ok(guide.steps.length >= 8);
    const schemas = z.record(z.string(), z.unknown()).parse(JSON.parse(run(['research:schema']).stdout));
    assert.deepEqual(Object.keys(schemas), ['idea:add', 'paper:document', 'source:status', 'source:future', 'source:categorize',
      'category:add', 'paper:request', 'clip:add', 'seed:add', 'seed:update', 'batch:start', 'batch:close', 'track:add', 'track:approve',
      'track:assess', 'track:brief', 'track:score', 'track:update', 'track:link', 'track:log', 'settings:update']);
    assert.match(run(['track:add'], JSON.stringify({ targetId: 7, origin: 'agent', title: 'T', question: 'Q?', rationale: 'R.' })).stderr,
      /No target with id 7/);
    assert.match(run(['source:get', '--id', '3']).stderr, /No source with id 3/);
    assert.match(run(['papers:discover', '--target', '1']).stderr, /Provide --author/);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
