import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { currentRevision, pullLatest } from '../src/lib/installation.ts';
import { coreCommands } from './commands.ts';
import { guide } from './guide.ts';
import { isResearchCommand, researchCommands, researchOptions, runResearch } from './research-commands.ts';
import { chooseWorkspace, currentWorkspace, rememberWorkspace, rememberedWorkspace } from '../src/lib/workspace.ts';
import { attachCv, cvPages } from '../src/lib/cv.ts';
import { createExport, exportOptionsSchema, listExports } from '../src/lib/export.ts';
import { blindDrafts } from '../src/lib/drafts.ts';
import { configureFitKinds, listFitKinds } from '../src/lib/fit.ts';
import { slug, targetFolder } from '../src/lib/files.ts';
import { getTrackDetail, listBatches } from '../src/lib/research.ts';
import { role, roleNames } from './roles.ts';
import type { RoleContext, RoleName } from './roles.ts';
import { fitKindsInputSchema } from '../src/lib/fit-schema.ts';
import { importList, previewList, readList } from '../src/lib/import.ts';
import {
  citeCollaborator, editPitch, getFit, getPitch, listOutreach, savePitch, scoreFit, setPitchStatus, sharedContacts,
} from '../src/lib/outreach.ts';
import {
  collaboratorCiteSchema, fitInputSchema, importInputSchema, pitchEditSchema, pitchInputSchema, pitchStatusSchema,
} from '../src/lib/outreach-schema.ts';
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
  share: z.string().nullable().default(null),
});
const shareSchema = z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i, 'Give the full machine name, such as laptop.example.ts.net.').max(253);
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
async function start(workspace: string, port: number, share: string | null): Promise<unknown> {
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const lock = join(workspace, 'start.lock');
  mkdirSync(lock);
  try {
    const previous = loadState(workspace);
    if (previous !== null && await healthy(previous)) {
      if (previous.share !== share) {
        throw new Error(`Coresearch is already running${previous.share === null ? '' : ` and shared with ${previous.share}`}; run stop, then start again.`);
      }
      return { running: true, url: address(previous), workspace, shared: share === null ? null : `https://${share}` };
    }
    if (!existsSync(join(packageRoot, '.next', 'BUILD_ID'))) throw new Error('Run setup before start.');
    await assertFreePort(port);
    const instance = randomUUID();
    const logPath = join(workspace, 'server.log');
    const log = openSync(logPath, 'a', 0o600);
    const child = spawn(process.execPath, [nextBinary, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: packageRoot,
      env: { ...process.env, CORESEARCH_WORKSPACE: workspace, CORESEARCH_INSTANCE: instance, CORESEARCH_SHARE: share ?? '', NEXT_TELEMETRY_DISABLED: '1' },
      detached: true,
      stdio: ['ignore', log, log],
    });
    closeSync(log);
    let launchError: Error | undefined;
    child.on('error', (error: Error) => { launchError = error; });
    if (child.pid === undefined) throw new Error('Server did not start.');
    const state: ServerState = { pid: child.pid, port, instance, share };
    try {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (launchError !== undefined) throw launchError;
        if (child.exitCode !== null) throw new Error(`Server exited. Inspect ${logPath}`);
        if (await healthy(state)) {
          const temporaryState = `${statePath(workspace)}.tmp`;
          writeFileSync(temporaryState, JSON.stringify(state), { mode: 0o600 });
          renameSync(temporaryState, statePath(workspace));
          child.unref();
          return { running: true, url: address(state), workspace, shared: share === null ? null : `https://${share}` };
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
const installedRevision = join(packageRoot, '.next', 'coresearch-revision');
const settings = join(packageRoot, '.workspace');
async function update(workspace: string, requestedPort: number | undefined): Promise<unknown> {
  const { from, to } = pullLatest(packageRoot);
  const installed = existsSync(installedRevision) ? readFileSync(installedRevision, 'utf8').trim() : null;
  if (from === to && installed === to) return { updated: false, revision: to.slice(0, 7), workspace };
  const port = requestedPort ?? loadState(workspace)?.port ?? 3780;
  const share = loadState(workspace)?.share ?? null;
  await stop(workspace);
  const npmCli = process.env['npm_execpath'];
  if (npmCli === undefined) run('Dependency installation', 'npm', ['ci']);
  else run('Dependency installation', process.execPath, [npmCli, 'ci']);
  const cli = ['--import', 'tsx', 'scripts/coresearch.ts'];
  run('Setup', process.execPath, [...cli, 'setup', '--workspace', workspace]);
  const started: unknown = JSON.parse(run('Start', process.execPath, [...cli, 'start', '--workspace', workspace, '--port', String(port),
    ...(share === null ? [] : ['--share', share])], true));
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
async function optionalInput(): Promise<unknown> {
  if (process.stdin.isTTY) return {};
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) input += z.string().parse(chunk);
  const parsed: unknown = input.trim() === '' ? {} : JSON.parse(input);
  return parsed;
}
function roleContext(workspace: string, name: RoleName, values: Partial<Record<'target' | 'track' | 'arm' | 'count', string>>): RoleContext {
  const detail = values.track === undefined ? null : getTrackDetail(workspace, targetIdSchema.parse(values.track));
  const targetId = detail?.track.targetId ?? (values.target === undefined ? null : targetIdSchema.parse(values.target));
  const target = targetId === null ? null : getTarget(targetId, workspace);
  const batches = target === null ? [] : listBatches(workspace, target.id);
  const concluded = batches.reduce((sum, batch) => sum + batch.metrics.strong + batch.metrics.dropped + batch.metrics.paused, 0);
  const strong = batches.reduce((sum, batch) => sum + batch.metrics.strong, 0);
  const batch = batches.find((item) => item.status === 'open') ?? batches.at(-1);
  const folder = join(workspace, 'agents', name === 'drafter' || name === 'critic'
    ? `drafts-target-${String(targetId ?? 0)}-batch-${String(batch?.number ?? 1)}` : `${name}-${String(detail?.track.id ?? targetId ?? 0)}`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (name === 'critic' && blindDrafts(folder) === 0) throw new Error(`No drafts in ${folder}; run the drafter role first.`);
  const profile = getProfile(workspace);
  return {
    skill: resolve(packageRoot), workspace, folder,
    student: { name: profile.name, background: profile.background, interests: profile.interests },
    target: target === null ? null : { id: target.id, professor: target.professor, place: target.lab ?? target.university ?? 'an independent lab',
      pathway: target.pathway },
    track: detail === null || target === null ? null : { id: detail.track.id, title: detail.track.title,
      report: join(workspace, targetFolder(target), 'tracks', `${String(detail.track.id)}-${slug(detail.track.title)}.md`) },
    kinds: listFitKinds(workspace),
    arm: z.enum(['seeded', 'control']).default('seeded').parse(values.arm),
    count: z.coerce.number().int().min(1).max(30).default(8).parse(values.count),
    survival: concluded === 0 ? null : Math.round(100 * strong / concluded),
  };
}
async function main(): Promise<unknown> {
  const args = parseArgs({
    options: {
      workspace: { type: 'string' }, port: { type: 'string' }, id: { type: 'string' }, share: { type: 'string' }, arm: { type: 'string' },
      count: { type: 'string' }, ...researchOptions,
    },
    allowPositionals: true,
    strict: true,
  });
  const command = z.enum([...coreCommands, ...researchCommands]).parse(args.positionals[0]);
  if (args.positionals.length !== (command === 'role' ? 2 : 1)) {
    throw new Error(command === 'role' ? `Name one role: ${roleNames.join(', ')}.` : 'Provide exactly one command.');
  }
  if (command === 'workspace') return { workspace: rememberedWorkspace(settings) };
  if (command === 'guide') return guide();
  const workspace = command === 'setup'
    ? chooseWorkspace(settings, args.values.workspace)
    : currentWorkspace(settings, args.values.workspace);
  const port = z.coerce.number().int().min(1024).max(65535).parse(args.values.port ?? '3780');
  function id(): number {
    if (args.values.id === undefined) throw new Error('Provide --id.');
    return targetIdSchema.parse(args.values.id);
  }
  function targetId(): number {
    if (args.values.target === undefined) throw new Error('Provide --target.');
    return targetIdSchema.parse(args.values.target);
  }
  if (isResearchCommand(command)) return runResearch(command, workspace, args.values, inputFromStdin);
  switch (command) {
    case 'setup': {
      const existing = loadState(workspace);
      if (existing !== null && await healthy(existing)) throw new Error('Stop the app before rebuilding it.');
      getProfile(workspace);
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
      return start(workspace, port, args.values.share === undefined ? null : shareSchema.parse(args.values.share).toLowerCase());
    case 'role': {
      const name = z.enum(roleNames).parse(args.positionals[1]);
      return role(name, roleContext(workspace, name, args.values));
    }
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
    case 'profile:cv': {
      if (args.values.file === undefined) throw new Error('Provide --file with the CV as a PDF.');
      return attachCv(workspace, args.values.file);
    }
    case 'profile:cv-text': {
      const pages = cvPages(workspace);
      if (args.values.page === undefined) return { pages: pages.length, text: pages };
      const page = z.coerce.number().int().positive().max(pages.length).parse(args.values.page);
      return { page, text: pages[page - 1] };
    }
    case 'list:preview': return previewList(workspace, await readList({
      ...(args.values.url === undefined ? {} : { url: args.values.url }), ...(args.values.file === undefined ? {} : { file: args.values.file }),
    }));
    case 'list:import': return importList(workspace, await inputFromStdin());
    case 'export': return createExport(workspace, await optionalInput());
    case 'export:list': return { options: z.toJSONSchema(exportOptionsSchema, { io: 'input' }), exports: listExports(workspace) };
    case 'outreach:list': return listOutreach(workspace);
    case 'outreach:contacts': return sharedContacts(workspace, targetId());
    case 'contact:cite': return citeCollaborator(workspace, await inputFromStdin());
    case 'fit:kinds': return listFitKinds(workspace);
    case 'fit:configure': return configureFitKinds(workspace, await inputFromStdin());
    case 'fit:get': return getFit(workspace, targetId());
    case 'fit:score': return scoreFit(workspace, await inputFromStdin());
    case 'fit:schema': return {
      configure: z.toJSONSchema(fitKindsInputSchema, { io: 'input' }), score: z.toJSONSchema(fitInputSchema, { io: 'input' }),
      cite: z.toJSONSchema(collaboratorCiteSchema, { io: 'input' }),
    };
    case 'pitch:get': return getPitch(workspace, targetId());
    case 'pitch:draft': return savePitch(workspace, await inputFromStdin());
    case 'pitch:edit': return editPitch(workspace, targetId(), await inputFromStdin());
    case 'pitch:status': return setPitchStatus(workspace, targetId(), await inputFromStdin());
    case 'pitch:schema': return {
      draft: z.toJSONSchema(pitchInputSchema, { io: 'input' }), edit: z.toJSONSchema(pitchEditSchema, { io: 'input' }),
      status: z.toJSONSchema(pitchStatusSchema, { io: 'input' }), import: z.toJSONSchema(importInputSchema, { io: 'input' }),
    };
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
  process.stdout.write(typeof result === 'string' ? `${result}\n` : `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown failure' })}\n`);
  process.exitCode = 1;
}
