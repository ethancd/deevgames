/**
 * The identity of the TREE a Gate 1 measurement was taken in.
 *
 * One row must run at one pinned source/config identity (A2's "the full
 * replacement must run at one pinned clean source/config identity"), and the
 * calibration a row uses is itself a measurement of that same tree: a budget
 * measured before a search-ordering change describes an engine that no longer
 * exists. So the file-hash map lives here, where both the calibration
 * (`gate1-calibrate.ts`) and the row (`gate1.ts`) can record it and the row can
 * refuse a calibration taken against a different tree.
 *
 * The guard is deliberately blunt — it hashes every source the harness can
 * reach, not only the ones this row's engines import — so it also fires when an
 * unrelated lane edits the tree while a row is running. That is the intended
 * trade: a false alarm costs a re-run, a missed edit costs the row's meaning.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const BANDS_PATH = 'lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json';
export const PROPOSAL_PATH = 'lab/docs/GATE1-AMENDMENT-PROPOSAL-2026-09-19.md';
export const REFERENCE_PATH = 'lab/ai/gate1-references.json';

export const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');

/** Read hashes only; never read any opening corpus but the dev book the row replays. */
export function sourceFileHashes(): Record<string, string> {
  const paths = execFileSync('rg', ['--files', 'src/ai', 'src/game', 'assembly', 'lab/ai', 'lab/harness', '-g', '*.ts'],
    { encoding: 'utf8' }).trim().split('\n');
  paths.push('package-lock.json', 'src/ai/wasm/tactics.wasm', 'lab/hard-ai/ladder/elo.ts',
    'lab/hard-ai/ladder/heavy.ts', 'lab/hard-ai/ladder/ruleset.ts', 'lab/hard-ai/ladder/openings.ts',
    'lab/hard-ai/ladder/openings/phasing.ts',
    'docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md',
    'docs/PHASING-2026-09-16.md', BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH);
  return Object.fromEntries([...new Set(paths)].sort().map(p => [p, sha(readFileSync(p))]));
}

/** One hash standing for that whole map, so a manifest can carry it in a line. */
export function sourceIdentitySha256(files: Record<string, string> = sourceFileHashes()): string {
  return sha(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))));
}

/** Paths whose hash differs between two snapshots, named rather than counted. */
export function driftedSources(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]);
}
