import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { workspacePath } from './database.ts';

export function rememberedWorkspace(settings: string): string | null {
  return existsSync(settings) ? workspacePath(readFileSync(settings, 'utf8').trim()) : null;
}

export function rememberWorkspace(settings: string, workspace: string): void {
  writeFileSync(settings, `${workspace}\n`);
}

export function assertPrivateLocation(folder: string): void {
  let existing = folder;
  while (!existsSync(existing)) existing = dirname(existing);
  const top = spawnSync('git', ['-C', existing, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.error !== undefined || top.status !== 0) return;
  const repository = top.stdout.trim();
  const real = `${join(realpathSync(existing), relative(existing, folder))}${sep}`;
  if (spawnSync('git', ['-C', repository, 'check-ignore', '-q', real]).status !== 0) {
    throw new Error(`${folder} is inside the Git repository ${repository}, so your data could be committed. `
      + 'Choose a folder outside it, or one the repository ignores.');
  }
}

export function chooseWorkspace(settings: string, requested: string | undefined): string {
  const saved = rememberedWorkspace(settings);
  if (requested === undefined) {
    if (saved === null) throw new Error('Choose where Coresearch keeps your research: setup --workspace <absolute-path>.');
    return saved;
  }
  const chosen = workspacePath(requested);
  if (saved !== null && chosen !== saved && existsSync(saved)) {
    throw new Error(`Coresearch already uses ${saved}; only one workspace is supported.`);
  }
  assertPrivateLocation(chosen);
  return chosen;
}

export function currentWorkspace(settings: string, requested: string | undefined): string {
  if (requested !== undefined) return workspacePath(requested);
  const saved = rememberedWorkspace(settings);
  if (saved === null) throw new Error('Coresearch is not set up yet. Run setup --workspace <absolute-path>.');
  if (!existsSync(saved)) throw new Error(`The workspace ${saved} is missing. If it moved, run setup --workspace <new location>.`);
  return saved;
}
