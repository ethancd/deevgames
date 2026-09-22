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
 * The tree printed `088505ab703720cacf10a8581ea306f104a0fe66fe652c88e3d051f6776bb57e`
 * over 148 files when the swap landed; that number is recorded here rather than
 * asserted, because it moves with every ordinary edit under `src/ai`,
 * `src/game`, `assembly`, `lab/ai` or `lab/harness` — which is exactly what a
 * source identity is for.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
