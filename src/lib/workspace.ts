import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { workspacePath } from './database.ts';

// `settings` is a file inside the installation, so each installation remembers its own single workspace.
export function rememberedWorkspace(settings: string): string | null {
  return existsSync(settings) ? workspacePath(readFileSync(settings, 'utf8').trim()) : null;
}

export function rememberWorkspace(settings: string, workspace: string): void {
  writeFileSync(settings, `${workspace}\n`);
}

// Personal data inside a Git repository could be committed, unless the repository ignores that folder.
export function assertPrivateLocation(folder: string): void {
  let existing = folder;
  while (!existsSync(existing)) existing = dirname(existing);
  const top = spawnSync('git', ['-C', existing, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.error !== undefined || top.status !== 0) return;
  const repository = top.stdout.trim();
  // Git reports real paths, so resolve symlinks; the trailing separator lets folder-only ignore
  // rules (`/private/`) match a workspace that does not exist yet.
  const real = `${join(realpathSync(existing), relative(existing, folder))}${sep}`;
  if (spawnSync('git', ['-C', repository, 'check-ignore', '-q', real]).status !== 0) {
    throw new Error(`${folder} is inside the Git repository ${repository}, so your data could be committed. `
      + 'Choose a folder outside it, or one the repository ignores.');
  }
}

// Setup: a first choice, the same folder again, or a new location when the old folder no longer exists.
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

// Every other command. An explicit path is for development and tests; students rely on the remembered one.
export function currentWorkspace(settings: string, requested: string | undefined): string {
  if (requested !== undefined) return workspacePath(requested);
  const saved = rememberedWorkspace(settings);
  if (saved === null) throw new Error('Coresearch is not set up yet. Run setup --workspace <absolute-path>.');
  if (!existsSync(saved)) throw new Error(`The workspace ${saved} is missing. If it moved, run setup --workspace <new location>.`);
  return saved;
}
