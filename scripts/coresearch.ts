import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { currentRevision, pullLatest } from '../src/lib/installation.ts';
import { chooseWorkspace, currentWorkspace, rememberWorkspace, rememberedWorkspace } from '../src/lib/workspace.ts';
import { getProfile, updateProfile } from '../src/lib/profile.ts';
import { profilePatchSchema } from '../src/lib/profile-schema.ts';
import { targetInputSchema, targetPatchSchema } from '../src/lib/target-schema.ts';
import { addTarget, getTarget, listTargets, removeTarget, targetIdSchema, updateTarget } from '../src/lib/targets.ts';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const nextBinary = createRequire(import.meta.url).resolve('next/dist/bin/next');
const serverSchema = z.strictObject({
  pid: z.number().int().positive(),
  port: z.number().int().min(1024).max(65535),
  instance: z.uuid(),
});
type ServerState = z.infer<typeof serverSchema>;
const healthSchema = z.strictObject({ app: z.literal('coresearch'), instance: z.string(), pid: z.number().int().positive() });

function statePath(workspace: string): string { return join(workspace, 'server.json'); }
function loadState(workspace: string): ServerState | null {
  if (!existsSync(statePath(workspace))) return null;
  return serverSchema.parse(JSON.parse(readFileSync(statePath(workspace), 'utf8')));
}
function address(state: ServerState): string { return `http://127.0.0.1:${String(state.port)}`; }
async function healthy(state: ServerState): Promise<boolean> {
  try {
    const response = await fetch(`${address(state)}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return false;
    const result = healthSchema.safeParse(await response.json());
    return result.success && result.data.instance === state.instance && result.data.pid === state.pid;
  } catch { return false; }
}
async function assertFreePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        if (error !== undefined) reject(error);
        else resolve();
      });
    });
  });
}
async function start(workspace: string, port: number): Promise<unknown> {
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const lock = join(workspace, 'start.lock');
  // Exclusive lock prevents simultaneous invocations from launching duplicate servers.
  mkdirSync(lock);
  try {
    const previous = loadState(workspace);
    if (previous !== null && await healthy(previous)) return { running: true, url: address(previous), workspace };
    if (!existsSync(join(packageRoot, '.next', 'BUILD_ID'))) throw new Error('Run setup before start.');
    await assertFreePort(port);
    const instance = randomUUID();
    const logPath = join(workspace, 'server.log');
    const log = openSync(logPath, 'a', 0o600);
    const child = spawn(process.execPath, [nextBinary, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: packageRoot,
      env: { ...process.env, CORESEARCH_WORKSPACE: workspace, CORESEARCH_INSTANCE: instance, NEXT_TELEMETRY_DISABLED: '1' },
      detached: true,
      stdio: ['ignore', log, log],
    });
    closeSync(log);
    let launchError: Error | undefined;
    child.on('error', (error: Error) => { launchError = error; });
    if (child.pid === undefined) throw new Error('Server did not start.');
    const state: ServerState = { pid: child.pid, port, instance };
    try {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (launchError !== undefined) throw launchError;
        if (child.exitCode !== null) throw new Error(`Server exited. Inspect ${logPath}`);
        if (await healthy(state)) {
          const temporaryState = `${statePath(workspace)}.tmp`;
          writeFileSync(temporaryState, JSON.stringify(state), { mode: 0o600 });
          renameSync(temporaryState, statePath(workspace));
          child.unref();
          return { running: true, url: address(state), workspace };
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`Server startup timed out. Inspect ${logPath}`);
    } catch (error) {
      child.kill('SIGTERM');
      throw error;
    }
  } finally {
    rmSync(lock, { recursive: true });
  }
}
async function stop(workspace: string): Promise<{ stopped: boolean; reason?: string }> {
  const state = loadState(workspace);
  if (state === null || !await healthy(state)) return { stopped: false, reason: 'No verified running server.' };
  process.kill(state.pid, 'SIGTERM');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!await healthy(state)) {
      rmSync(statePath(workspace), { force: true });
      return { stopped: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server did not stop; state retained for inspection.');
}
function run(description: string, executable: string, args: string[], capture = false): string {
  const result = spawnSync(executable, args, { cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', capture ? 'pipe' : 2, 2] });
  if (result.error !== undefined || result.status !== 0) throw new Error(`${description} failed. Run update again.`);
  return capture ? result.stdout : '';
}
// Revision whose dependencies and build completed, so an interrupted update is retried rather than skipped.
const installedRevision = join(packageRoot, '.next', 'coresearch-revision');
const settings = join(packageRoot, '.workspace');
async function update(workspace: string, requestedPort: number | undefined): Promise<unknown> {
  // Pull while the app runs; stop it only once new code has arrived.
  const { from, to } = pullLatest(packageRoot);
  const installed = existsSync(installedRevision) ? readFileSync(installedRevision, 'utf8').trim() : null;
  if (from === to && installed === to) return { updated: false, revision: to.slice(0, 7), workspace };
  const port = requestedPort ?? loadState(workspace)?.port ?? 3780;
  await stop(workspace);
  const npmCli = process.env['npm_execpath'];
  if (npmCli === undefined) run('Dependency installation', 'npm', ['ci']);
  else run('Dependency installation', process.execPath, [npmCli, 'ci']);
  // The pulled code may have changed this script, so the new version performs setup and start.
  const cli = ['--import', 'tsx', 'scripts/coresearch.ts'];
  run('Setup', process.execPath, [...cli, 'setup', '--workspace', workspace]);
  const started: unknown = JSON.parse(run('Start', process.execPath, [...cli, 'start', '--workspace', workspace, '--port', String(port)], true));
  return { updated: true, from: from.slice(0, 7), to: to.slice(0, 7), app: started,
    ...(from === to ? { note: 'Completed an earlier interrupted update.' } : {}) };
}
async function inputFromStdin(): Promise<unknown> {
  if (process.stdin.isTTY) throw new Error('Supply JSON on stdin.');
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += z.string().parse(chunk);
    if (Buffer.byteLength(input) > 65_536) throw new Error('Input exceeds 64 KiB.');
  }
  const parsed: unknown = JSON.parse(input);
  return parsed;
}
async function main(): Promise<unknown> {
  const args = parseArgs({
    options: { workspace: { type: 'string' }, port: { type: 'string' }, id: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  });
  const command = z.enum(['setup', 'workspace', 'start', 'status', 'stop', 'update', 'profile:get', 'profile:update', 'profile:schema',
    'target:list', 'target:get', 'target:add', 'target:update', 'target:remove', 'target:schema']).parse(args.positionals[0]);
  if (args.positionals.length !== 1) throw new Error('Provide exactly one command.');
  if (command === 'workspace') return { workspace: rememberedWorkspace(settings) };
  const workspace = command === 'setup'
    ? chooseWorkspace(settings, args.values.workspace)
    : currentWorkspace(settings, args.values.workspace);
  const port = z.coerce.number().int().min(1024).max(65535).parse(args.values.port ?? '3780');
  function id(): number {
    if (args.values.id === undefined) throw new Error('Provide --id.');
    return targetIdSchema.parse(args.values.id);
  }
  switch (command) {
    case 'setup': {
      const existing = loadState(workspace);
      if (existing !== null && await healthy(existing)) throw new Error('Stop the app before rebuilding it.');
      getProfile(workspace);
      // Build logs go to stderr so stdout stays a single JSON result.
      const build = spawnSync(process.execPath, [nextBinary, 'build'], {
        cwd: packageRoot,
        stdio: ['ignore', 2, 2],
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      });
      if (build.error !== undefined) throw build.error;
      if (build.status !== 0) throw new Error('Application build failed.');
      const revision = currentRevision(packageRoot);
      if (revision !== null) writeFileSync(installedRevision, `${revision}\n`);
      rememberWorkspace(settings, workspace);
      return { initialized: true, workspace };
    }
    case 'start':
      getProfile(workspace);
      return start(workspace, port);
    case 'status': {
      const state = loadState(workspace);
      const running = state !== null && await healthy(state);
      return { running, url: running ? address(state) : null, workspace };
    }
    case 'stop': return stop(workspace);
    case 'update': return update(workspace, args.values.port === undefined ? undefined : port);
    case 'profile:get': return getProfile(workspace);
    case 'profile:update': return updateProfile(await inputFromStdin(), workspace);
    case 'profile:schema': return z.toJSONSchema(profilePatchSchema, { io: 'input' });
    case 'target:list': return listTargets(workspace);
    case 'target:get': return getTarget(id(), workspace);
    case 'target:add': return addTarget(await inputFromStdin(), workspace);
    case 'target:update': return updateTarget(id(), await inputFromStdin(), workspace);
    case 'target:remove': return removeTarget(id(), workspace);
    case 'target:schema': return {
      add: z.toJSONSchema(targetInputSchema, { io: 'input' }),
      update: z.toJSONSchema(targetPatchSchema, { io: 'input' }),
    };
  }
}

try {
  const result = await main();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown failure' })}\n`);
  process.exitCode = 1;
}
