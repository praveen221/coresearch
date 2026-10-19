import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { profileSchema } from '../src/lib/profile-schema.ts';
import { targetListSchema } from '../src/lib/target-schema.ts';

const root = new URL('..', import.meta.url);
const statusSchema = z.object({ running: z.boolean(), url: z.url().nullable() });
const stateSchema = z.object({ pid: z.number(), port: z.number(), instance: z.string() });

async function request(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  headers.set('Connection', 'close');
  return fetch(url, { ...options, headers, signal: AbortSignal.timeout(5000) });
}

async function foreignHostStatus(base: string): Promise<number> {
  const target = new URL('/api/profile', base);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(target, { headers: { Host: `attacker.example:${target.port}` } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const bound = server.address();
      server.close((error) => {
        if (error !== undefined) reject(error);
        else if (bound === null || typeof bound === 'string') reject(new Error('No port assigned.'));
        else resolve(bound.port);
      });
    });
  });
}

void test('local app preserves data, reuses its instance, denies writes and foreign hosts, and checks process identity', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'coresearch app '));
  const port = await availablePort();
  function run(command: string, input?: string): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/coresearch.ts', command,
      '--workspace', workspace, '--port', String(port)], {
      cwd: root, encoding: 'utf8', timeout: 30_000, ...(input === undefined ? {} : { input }),
    });
  }
  function successful(command: string, input?: string): unknown {
    const result = run(command, input);
    assert.equal(result.status, 0, result.stderr);
    const parsed: unknown = JSON.parse(result.stdout);
    return parsed;
  }
  try {
    successful('profile:get');
    const first = statusSchema.parse(successful('start'));
    assert.equal(first.running, true);
    const statePath = join(workspace, 'server.json');
    const originalState = readFileSync(statePath, 'utf8');
    assert.deepEqual(statusSchema.parse(successful('start')), first);
    assert.equal(readFileSync(statePath, 'utf8'), originalState);
    const base = z.url().parse(first.url);
    const empty = profileSchema.parse(await (await request(`${base}/api/profile`)).json());
    assert.equal(empty.name, null);
    const saved = profileSchema.parse(successful('profile:update', JSON.stringify({ name: 'Example Student',
      interests: { add: ['Live conversational research'] }, needsFunding: true })));
    const response = await request(`${base}/api/profile`);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(profileSchema.parse(await response.json()), saved);
    assert.equal((await request(`${base}/api/profile`, { method: 'POST', body: '{}' })).status, 405);
    assert.deepEqual(targetListSchema.parse(await (await request(`${base}/api/targets`)).json()), []);
    const target = successful('target:add', JSON.stringify({ professor: 'Example Professor', labKind: 'university',
      university: 'Example University' }));
    assert.deepEqual(targetListSchema.parse(await (await request(`${base}/api/targets`)).json()), [target]);
    assert.equal((await request(`${base}/targets/1`)).status, 200);
    assert.equal((await request(`${base}/ideas`)).status, 200);
    assert.deepEqual(await (await request(`${base}/api/ideas`)).json(), []);
    assert.deepEqual(await (await request(`${base}/api/targets/1/research`)).json(), { sources: [], tracks: [], clips: [], author: null });
    assert.equal((await request(`${base}/api/targets/999/research`)).status, 404);
    assert.equal((await request(`${base}/targets/1/tracks/99`)).status, 404);
    assert.equal((await request(`${base}/api/files?path=${encodeURIComponent('../coresearch.sqlite')}`)).status, 404);
    assert.equal((await request(`${base}/api/files?path=coresearch.sqlite`)).status, 404);
    assert.equal((await request(`${base}/targets/999`)).status, 404);
    assert.equal((await request(`${base}/api/targets`, { method: 'POST', body: '{}' })).status, 405);
    assert.equal((await request(`${base}/private/coresearch.sqlite`)).status, 404);
    assert.equal(await foreignHostStatus(base), 403);
    const state = stateSchema.parse(JSON.parse(originalState));
    writeFileSync(statePath, JSON.stringify({ ...state, pid: process.pid }));
    assert.equal(z.object({ stopped: z.boolean() }).parse(successful('stop')).stopped, false);
    writeFileSync(statePath, originalState);
    assert.equal(statusSchema.parse(successful('status')).running, true);
    assert.equal(z.object({ stopped: z.boolean() }).parse(successful('stop')).stopped, true);
    assert.equal(statusSchema.parse(successful('status')).running, false);
    successful('start');
    assert.deepEqual(profileSchema.parse(await (await request(`${base}/api/profile`)).json()), saved);
  } finally {
    run('stop');
    rmSync(workspace, { recursive: true, force: true });
  }
});
