/**
 * The file list every source-identity hash is built from, without shelling out.
 *
 * The three callers used to run `rg --files <dirs> [-g '*.ts']`. `ripgrep` is
 * not installed on `ubuntu-latest`, so `tests/lab/gate1-shard.test.ts` failed in
 * CI with `spawnSync rg ENOENT` while passing on every developer machine — a
 * lab dependency that only exists because agents happen to have `rg` on PATH.
 *
 * This reproduces `rg --files` for the directories the lab actually walks:
 * files only, hidden entries skipped, `node_modules` skipped, paths relative to
 * the process cwd (`muju/`), sorted with the plain `Array.prototype.sort`
 * comparator the callers already applied. Nothing under `src/`, `assembly/`,
 * `lab/ai/` or `lab/harness/` is git-ignored, so "not hidden and not
 * `node_modules`" is the whole of `rg`'s filtering there;
 * `tests/lab/source-files.test.ts` asserts the two lists are byte-equal
 * whenever `rg` is on PATH, and that the gate-1 identity hash is the same
 * either way.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** `true` for a path `rg --files` would also print (no hidden segment, no `node_modules`). */
function visible(relative: string): boolean {
  return !relative.split(/[\\/]/).some(segment => segment.startsWith('.') || segment === 'node_modules');
}

/**
 * Every file under `dirs`, relative to the cwd and sorted.
 *
 * `ext` filters by suffix the way `-g '*.ts'` does (and, like that glob, does
 * NOT match `.tsx`); pass `null` for "every file", which is what
 * `lab/ai/run.ts` hashes.
 */
export function listSourceFiles(dirs: string[], ext: string | null = '.ts'): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (ext !== null && !entry.name.endsWith(ext)) continue;
      const relative = join(entry.parentPath, entry.name);
      if (!visible(relative)) continue;
      out.push(relative);
    }
  }
  return out.sort();
}
