/**
 * The file list every source-identity hash is built from, without shelling out.
 *
 * The three callers used to run `rg --files <dirs> [-g '*.ts']`. `ripgrep` is
 * not installed on `ubuntu-latest`, so `tests/lab/gate1-shard.test.ts` failed in
 * CI with `spawnSync rg ENOENT` while passing on every developer machine — a
 * lab dependency that only exists because agents happen to have `rg` on PATH.
 *
 * The contract is stated here as what this walker does, NOT as "whatever `rg`
 * does", because the two are not the same function:
 *
 *   - regular files only, found recursively under each entry of `dirs`;
 *   - any path with a segment starting with `.`, or a segment equal to
 *     `node_modules`, is skipped;
 *   - symlinks are not regular files, so they are neither listed nor followed;
 *   - `ext` filters by suffix and, like `-g '*.ts'`, `.ts` does not match `.tsx`;
 *   - `.gitignore` and `.ignore` are NOT consulted;
 *   - paths are relative to the process cwd (`muju/`), sorted with the plain
 *     `Array.prototype.sort` comparator the callers already applied.
 *
 * Three places where that is deliberately not `rg`, all pinned against a fixture
 * directory in `tests/lab/source-files.test.ts`: an explicit `-g` whitelist
 * beats ripgrep's hidden-file filter, so `rg --files -g '*.ts'` prints a
 * top-level `.dotfile.ts` that this walker drops; ripgrep has no built-in
 * `node_modules` rule (it gets that from a `.gitignore`), so it prints
 * `node_modules/pkg/f.ts` that this walker drops; and with no `-g` whitelist
 * ripgrep honours `.gitignore`/`.ignore` while this walker hashes those files.
 *
 * The swap is still byte-equal on this repository, and that is a checked
 * precondition rather than a hope: no path under `src`, `assembly`, `lab/ai` or
 * `lab/harness` has a hidden or `node_modules` segment, and none is git-ignored
 * (`find src assembly lab/ai lab/harness -name '.*'` and
 * `git status --ignored=matching --porcelain -- src assembly lab/ai lab/harness`
 * were both empty on 2026-09-21). `tests/lab/source-files.test.ts` re-checks the
 * hidden/`node_modules` half of that precondition on every run, compares the two
 * lists byte for byte wherever `rg` is on PATH, and asserts the gate-1 identity
 * hash is the same either way. Add `src/ai/.generated/table.ts` and the
 * precondition test goes red, instead of the source identity silently narrowing.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** `false` for any path with a hidden segment or a `node_modules` segment. NOT `rg`'s filter — see the module docstring. */
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
