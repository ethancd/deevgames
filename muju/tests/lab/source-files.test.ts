// @vitest-environment node
/**
 * `lab/ai/source-files.ts` replaced three `rg --files` shell-outs on 2026-09-21.
 *
 * `ripgrep` is not installed on `ubuntu-latest`, so `tests/lab/gate1-shard.test.ts`
 * failed in CI with `spawnSync rg ENOENT` while passing on every developer
 * machine. The swap is only safe if the file list — and therefore every
 * source-identity hash a Gate 1 manifest carries — is byte-identical, so that
 * is what this file asserts, both ways round:
 *
 *   - when `rg` IS on PATH (a developer box), the walker's output is compared
 *     byte for byte against `rg --files` for all three call shapes, and the
 *     gate-1 identity hash is rebuilt from the `rg` list and compared;
 *   - always, the identity hash is re-derived from `listSourceFiles` plus the
 *     named extras, which pins the WIRING (`sourceFileHashes` walks these five
 *     directories with this filter) without pinning the CONTENT of `src/`.
 *
 * Byte-equality on THIS repository rests on a precondition — no hidden segment,
 * no `node_modules` segment and no git-ignored path under the walked
 * directories — because the walker is not `rg`. `describe('the walker contract,
 * on a fixture directory')` below pins the three places the two functions
 * genuinely differ, and `describe('the precondition ...')` re-checks that
 * nothing under the real directories has landed in one of them.
 *
 * Measured at branch tip `fbfd58e7`, `sourceIdentitySha256()` is
 * `d78a2e2fca5d9a691ef44ecc5ffb47cd68f8c4c7951c39c1fc18eca1a70bafc7` over 148
 * files. That number is recorded here rather than asserted, because it moves
 * with every ordinary edit under `src/ai`, `src/game`, `assembly`, `lab/ai` or
 * `lab/harness` — which is exactly what a source identity is for. Re-measure it
 * when you quote it; do not copy it forward.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSourceFiles } from '../../lab/ai/source-files';
import { BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH, SUPERSEDED_BANDS_PATH, sha, sourceFileHashes, sourceIdentitySha256 }
  from '../../lab/ai/gate1-sources';

/** The five directories `sourceFileHashes()` walks, and its `-g '*.ts'` filter. */
const GATE1_DIRS = ['src/ai', 'src/game', 'assembly', 'lab/ai', 'lab/harness'];
/** Hashed alongside the walk; not discovered by it. Mirrors `gate1-sources.ts`. */
const GATE1_EXTRAS = ['package-lock.json', 'src/ai/wasm/tactics.wasm', 'lab/hard-ai/ladder/elo.ts',
  'lab/hard-ai/ladder/heavy.ts', 'lab/hard-ai/ladder/ruleset.ts', 'lab/hard-ai/ladder/openings.ts',
  'lab/hard-ai/ladder/openings/phasing.ts',
  'docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md',
  'docs/PHASING-2026-09-16.md',
  BANDS_PATH, SUPERSEDED_BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH];

/** The three shapes the lab used to spell as `rg --files …`. */
const CALLS: { args: string[]; dirs: string[]; ext: string | null; caller: string }[] = [
  { args: ['--files', ...GATE1_DIRS, '-g', '*.ts'], dirs: GATE1_DIRS, ext: '.ts', caller: 'lab/ai/gate1-sources.ts' },
  { args: ['--files', 'src', 'assembly'], dirs: ['src', 'assembly'], ext: null, caller: 'lab/ai/run.ts' },
  { args: ['--files', 'src/ai', 'src/game', 'assembly', 'lab/ai', '-g', '*.ts'],
    dirs: ['src/ai', 'src/game', 'assembly', 'lab/ai'], ext: '.ts', caller: 'lab/ai/phasing-selfplay.ts' },
];

function ripgrepAvailable(): boolean {
  try {
    execFileSync('rg', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}
const HAS_RG = ripgrepAvailable();
const rgFiles = (args: string[]): string[] =>
  execFileSync('rg', args, { encoding: 'utf8' }).trim().split('\n').sort();

describe('listSourceFiles', () => {
  it.each(CALLS)('reproduces `rg $args` for $caller', ({ args, dirs, ext }) => {
    // Skipped, not failed, where ripgrep is absent — that absence is the bug
    // this module exists to fix, and CI is the machine without it.
    if (!HAS_RG) return;
    expect(listSourceFiles(dirs, ext)).toEqual(rgFiles(args));
  });

  it('hashes the same gate-1 source identity as the ripgrep list did', () => {
    if (!HAS_RG) return;
    const paths = [...rgFiles(CALLS[0].args), ...GATE1_EXTRAS];
    const viaRg = Object.fromEntries([...new Set(paths)].sort().map(p => [p, sha(readFileSync(p))]));
    expect(sourceFileHashes()).toEqual(viaRg);
    expect(sourceIdentitySha256()).toBe(sourceIdentitySha256(viaRg));
  });

  it('is what `sourceFileHashes` walks, on a machine with no ripgrep at all', () => {
    const paths = [...listSourceFiles(GATE1_DIRS, '.ts'), ...GATE1_EXTRAS];
    const expected = Object.fromEntries([...new Set(paths)].sort().map(p => [p, sha(readFileSync(p))]));
    const hashes = sourceFileHashes();
    expect(hashes).toEqual(expected);
    expect(Object.keys(hashes)).toEqual([...Object.keys(hashes)].sort());
    // The identity is that map, canonicalised — no shell, no PATH, no ordering luck.
    const canonical = JSON.stringify(Object.fromEntries(
      Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))));
    expect(sourceIdentitySha256(hashes)).toBe(createHash('sha256').update(canonical).digest('hex'));
    expect(sourceIdentitySha256()).toBe(sourceIdentitySha256(hashes));
  });

  it('lists relative, sorted, unique files and nothing else', () => {
    const ts = listSourceFiles(GATE1_DIRS, '.ts');
    expect(ts.length).toBeGreaterThan(100);
    expect(ts).toEqual([...ts].sort());
    expect(new Set(ts).size).toBe(ts.length);
    expect(ts.every(p => p.endsWith('.ts') && !p.startsWith('/') && !p.startsWith('.'))).toBe(true);
    expect(ts.some(p => p.includes('node_modules') || p.split('/').some(s => s.startsWith('.')))).toBe(false);
    // Directories are not files, and `-g '*.ts'` never matched `.tsx`.
    expect(ts.some(p => p.endsWith('.tsx'))).toBe(false);
    expect(ts).toContain('src/game/rules.ts');
    expect(ts).toContain('lab/ai/gate1-sources.ts');
    expect(ts).toContain('lab/ai/source-files.ts');
  });

  it('drops the extension filter for the whole-tree walk `lab/ai/run.ts` hashes', () => {
    const all = listSourceFiles(['src', 'assembly'], null);
    expect(all).toContain('src/ai/wasm/tactics.wasm');
    expect(all).toContain('src/game/rules.ts');
    expect(all.length).toBeGreaterThan(listSourceFiles(['src', 'assembly'], '.ts').length);
  });
});

/**
 * Amendment A-L1-a(b): a fixture directory holding exactly the entries the real
 * directories do not have — a dotfile, a hidden directory, a nested directory, a
 * non-`.ts` file, a `node_modules/` entry, an ignore-file entry and a symlink —
 * so the walker's contract is executed rather than inferred from a tree that
 * happens to contain none of them. Without this, `visible()`'s skip branch is
 * run by no test and no real input.
 */
const FIXTURE_TS = ['a.ts', 'ignored.ts', 'nested/b.ts', 'nested/deep/c.ts'];
const FIXTURE_ALL = ['a.ts', 'h.tsx', 'ignored.ts', 'nested/b.ts', 'nested/deep/c.ts', 'notes.md'];
/** Printed by `rg --files -g '*.ts'` in the fixture and deliberately NOT by the walker. */
const RG_ONLY = ['.dotfile.ts', 'node_modules/pkg/f.ts'];

describe('the walker contract, on a fixture directory', () => {
  let fixture = '';
  let restoreCwd = '';

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), 'muju-source-files-'));
    for (const dir of ['nested/deep', '.hidden', 'node_modules/pkg']) {
      mkdirSync(join(fixture, dir), { recursive: true });
    }
    for (const file of ['a.ts', 'nested/b.ts', 'nested/deep/c.ts', '.hidden/d.ts', '.dotfile.ts',
      'node_modules/pkg/f.ts', 'notes.md', 'h.tsx', 'ignored.ts']) {
      writeFileSync(join(fixture, file), `// ${file}\n`);
    }
    // Honoured by ripgrep (outside a git repo `.gitignore` is not), ignored by the walker.
    writeFileSync(join(fixture, '.ignore'), 'ignored.ts\n');
    symlinkSync('a.ts', join(fixture, 'link.ts'));
  });
  afterAll(() => { if (fixture) rmSync(fixture, { recursive: true, force: true }); });
  // The callers pass RELATIVE dirs, so the fixture is walked the same way.
  beforeEach(() => { restoreCwd = process.cwd(); process.chdir(fixture); });
  afterEach(() => { if (restoreCwd) process.chdir(restoreCwd); });

  it('recurses, and skips hidden segments, `node_modules`, symlinks and other extensions', () => {
    expect(listSourceFiles(['.'], '.ts')).toEqual(FIXTURE_TS);
    // Named individually so a regression says which rule broke.
    const ts = listSourceFiles(['.'], '.ts');
    expect(ts).not.toContain('.dotfile.ts');        // hidden file
    expect(ts).not.toContain('.hidden/d.ts');       // hidden directory
    expect(ts).not.toContain('node_modules/pkg/f.ts');
    expect(ts).not.toContain('link.ts');            // symlink: not a regular file
    expect(ts).not.toContain('h.tsx');              // `-g '*.ts'` never matched `.tsx`
    expect(ts).not.toContain('notes.md');
    expect(ts).toContain('nested/deep/c.ts');       // recursion, two levels down
    expect(ts).toContain('ignored.ts');             // `.ignore` is NOT consulted
  });

  it('takes every extension when `ext` is null, under the same visibility filter', () => {
    expect(listSourceFiles(['.'], null)).toEqual(FIXTURE_ALL);
    // `.ignore` and `.dotfile.ts` are hidden; `link.ts` is a symlink.
    expect(listSourceFiles(['.'], null)).not.toContain('.ignore');
  });

  it('walks each entry of `dirs`, relative to the cwd', () => {
    expect(listSourceFiles(['nested'], '.ts')).toEqual(['nested/b.ts', 'nested/deep/c.ts']);
    // Overlapping dirs repeat a path — which is why `gate1-sources.ts` builds
    // its map through a `new Set`. Pinned so that stays a deliberate choice.
    expect(listSourceFiles(['nested/deep', 'nested'], '.ts'))
      .toEqual(['nested/b.ts', 'nested/deep/c.ts', 'nested/deep/c.ts']);
  });

  it('differs from `rg --files` exactly on hidden paths, `node_modules` and ignore files', () => {
    if (!HAS_RG) return;
    // With a `-g` whitelist ripgrep's override matcher beats its hidden filter and
    // its ignore filter, and ripgrep has no built-in `node_modules` rule at all.
    const whitelisted = rgFiles(['--files', '-g', '*.ts']);
    for (const extra of RG_ONLY) expect(whitelisted).toContain(extra);
    expect(whitelisted).toContain('ignored.ts');
    expect(whitelisted.filter(p => !RG_ONLY.includes(p))).toEqual(FIXTURE_TS);
    expect(listSourceFiles(['.'], '.ts')).toEqual(FIXTURE_TS);

    // Without a whitelist the divergence runs BOTH ways: ripgrep drops the
    // ignore-file entry the walker hashes, and still prints `node_modules`.
    const unfiltered = rgFiles(['--files']);
    expect(unfiltered).not.toContain('ignored.ts');
    expect(unfiltered).toContain('node_modules/pkg/f.ts');
    expect(listSourceFiles(['.'], null)).toContain('ignored.ts');
    expect(listSourceFiles(['.'], null)).not.toContain('node_modules/pkg/f.ts');
  });
});

describe('the precondition that makes the swap byte-equal here', () => {
  /** Every file under `dirs`, with NO visibility filter — everything the walker could see. */
  function everyFile(dirs: string[]): string[] {
    const out: string[] = [];
    for (const dir of dirs) {
      for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) out.push(join(entry.parentPath, entry.name));
      }
    }
    return [...new Set(out)].sort();
  }
  const hidden = (p: string) => p.split('/').some(s => s.startsWith('.'));
  const vendored = (p: string) => p.split('/').some(s => s === 'node_modules');
  /** `-g '*.ts'` shapes: gate1-sources and phasing-selfplay. */
  const GLOB_DIRS = [...new Set(CALLS.filter(c => c.ext === '.ts').flatMap(c => c.dirs))];
  /** The unfiltered shape: `lab/ai/run.ts` hashes every file under these. */
  const RAW_DIRS = [...new Set(CALLS.filter(c => c.ext === null).flatMap(c => c.dirs))];

  it('no hidden or vendored `.ts` file exists under a `-g` walked directory', () => {
    // Under a `-g '*.ts'` whitelist ripgrep prints hidden and `node_modules`
    // matches and this walker drops them, so such a file would move the gate-1
    // identity the day it landed. `src/ai/.generated/table.ts` turns this red
    // instead of the identity silently stopping short of a file the engine uses.
    const diverging = everyFile(GLOB_DIRS).filter(p => p.endsWith('.ts') && (hidden(p) || vendored(p)));
    expect(diverging).toEqual([]);
  });

  it('no vendored file exists under an unfiltered walked directory', () => {
    // No `-g` here, so ripgrep and the walker agree about hidden files (both skip
    // them) and disagree about `node_modules` (ripgrep has no built-in rule).
    expect(everyFile(RAW_DIRS).filter(vendored)).toEqual([]);
  });

  it('no git-ignored path the walker would list exists under an unfiltered walked directory', () => {
    // The other half of the unfiltered shape: ripgrep honours `.gitignore` and
    // this walker does not, so a git-ignored file under `src`/`assembly` would
    // make `lab/ai/run.ts`'s `sourceSha256` incomparable across the swap. (Under
    // a `-g` whitelist the override beats the ignore filter and both list it, so
    // the `-g` directories are deliberately not checked here.) A git-ignored
    // path that is ALSO hidden or vendored — `src/.DS_Store` is the everyday one
    // — is skipped by both and is not a divergence.
    let status: string;
    try {
      status = execFileSync('git', ['status', '--ignored=matching', '--porcelain', '--', ...RAW_DIRS],
        { encoding: 'utf8' });
    } catch {
      return; // No git, or no work tree: the two assertions above stand on their own.
    }
    const diverging = status.split('\n')
      .filter(line => line.startsWith('!! '))
      .map(line => line.slice(3))
      .filter(path => !hidden(path) && !vendored(path));
    expect(diverging).toEqual([]);
  });
});
