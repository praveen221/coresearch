import { mkdirSync, realpathSync, existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function slug(value: string, words = 6): string {
  const text = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((word) => word !== '').slice(0, words).join('-');
  return text === '' ? 'untitled' : text;
}

export function targetFolder(target: { id: number; professor: string }): string {
  return join('targets', `${String(target.id)}-${slug(target.professor, 4)}`);
}

export function ensureTargetFolders(workspace: string, target: { id: number; professor: string }): string {
  const folder = targetFolder(target);
  for (const part of ['pages', 'papers', join('papers', 'text'), 'inbox', 'tracks']) {
    mkdirSync(join(workspace, folder, part), { recursive: true, mode: 0o700 });
  }
  return folder;
}

export function paperFileName(paper: { id: number; year: number | null; authors: readonly string[]; title: string }): string {
  const author = slug(paper.authors[0]?.split(' ').at(-1) ?? 'unknown', 1);
  return `${String(paper.year ?? 'undated')}-${author}-${slug(paper.title, 6)}-${String(paper.id)}`;
}

export function resolveServedFile(workspace: string, requested: string): { path: string; folder: 'targets' | 'profile' | 'exports' } | null {
  if (requested === '' || isAbsolute(requested) || requested.includes('\0')) return null;
  const candidate = resolve(workspace, requested);
  for (const folder of ['targets', 'profile', 'exports'] as const) {
    const root = resolve(workspace, folder);
    if (!candidate.startsWith(`${root}${sep}`) || !existsSync(candidate)) continue;
    const real = realpathSync(candidate);
    const inside = relative(realpathSync(root), real);
    return inside.startsWith('..') || isAbsolute(inside) ? null : { path: real, folder };
  }
  return null;
}
