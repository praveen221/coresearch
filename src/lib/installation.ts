import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

function git(root: string, ...args: string[]): string {
  // `-C root` pins every command to the installation, never the caller's current directory.
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.error !== undefined) throw new Error('Git is required to update Coresearch.');
  if (result.status !== 0) throw new Error(result.stderr.trim() === '' ? `git ${args.join(' ')} failed.` : result.stderr.trim());
  return result.stdout.trim();
}

// Fast-forwards the installation to its upstream branch; refuses anything that could lose local work.
export function pullLatest(root: string): { from: string; to: string } {
  let top: string | null = null;
  try { top = git(root, 'rev-parse', '--show-toplevel'); } catch { top = null; }
  // A copy without its own .git inside another repository must not update that repository.
  if (top === null || realpathSync(top) !== realpathSync(root)) {
    throw new Error('This installation is not its own Git checkout; reinstall Coresearch to update it.');
  }
  if (git(root, 'status', '--porcelain') !== '') {
    throw new Error('The installation has local changes; update refused so they are not overwritten.');
  }
  const from = git(root, 'rev-parse', 'HEAD');
  git(root, 'pull', '--ff-only', '--quiet');
  return { from, to: git(root, 'rev-parse', 'HEAD') };
}

// Commit of a Git installation, or null when it was installed some other way.
export function currentRevision(root: string): string | null {
  try { return git(root, 'rev-parse', 'HEAD'); } catch { return null; }
}
