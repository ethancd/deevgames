/**
 * The identity of the TREE a Gate 1 measurement was taken in, and the RULES
 * REVISION it was taken under.
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
 *
 * WHY THE RULES REVISION IS ALSO HERE, AND WHY IT IS NOT A LITERAL. Amendment A4
 * (2026-09-19) moved the inactivity draw clock from 10 plies to 20 and advanced
 * the revision from `muju-phasing-1` to `muju-phasing-2`. Fourteen string
 * literals across this lane still said `muju-phasing-1`, so a row would have
 * stamped, checked and reported a revision the harness no longer plays — and,
 * worse, would have passed its own per-game check while `lab/harness/runner.ts`
 * wrote the OTHER value. `RULES_VERSION` is therefore the ladder's own constant
 * (`lab/hard-ai/ladder/ruleset.ts` → `openings/phasing.ts` →
 * `harness/types.ts#HARNESS_RULES_VERSION`), re-exported so nothing in this lane
 * can drift from what the harness stamps.
 *
 * WHY THE BANDS PATH MOVED WITH IT. A1's behaviour condition reads the frozen
 * purchase/inactivity bands, and the inactivity rate is a direct function of the
 * clock A4 changed: the p1 bands allow an inactivity draw rate up to 0.866, the
 * p2 bands up to 0.726, and Expand's measured rate fell from 0.70 to 0.55. Read
 * under the old bands, a row would be judged against a population that no longer
 * exists. `BANDS_PATH` is the re-frozen p2 reference; `SUPERSEDED_BANDS_PATH` is
 * named rather than deleted so the runner can refuse it BY NAME instead of only
 * noticing a hash mismatch. Neither frozen file is ever edited here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { listSourceFiles } from './source-files';
import { LADDER_RULES_VERSION } from '../hard-ai/ladder/ruleset';

/**
 * The rules revision every Gate 1 row is measured under, stamped on every
 * `GameRecord.rulesVersion` by the harness itself. Never a literal in this lane.
 */
export const RULES_VERSION = LADDER_RULES_VERSION;

/** A4's re-frozen scripted reference: the bands a row under `RULES_VERSION` reads. */
export const BANDS_PATH: string = 'lab/harness/results/p2-scripted-2026-09-19/sanity-bands.json';
/** The 10-ply-clock bands A1 named. Kept for audit; refused as a row's bands. */
export const SUPERSEDED_BANDS_PATH: string = 'lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json';
export const PROPOSAL_PATH = 'lab/docs/GATE1-AMENDMENT-PROPOSAL-2026-09-19.md';
export const REFERENCE_PATH = 'lab/ai/gate1-references.json';

export const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');

/** Read hashes only; never read any opening corpus but the dev book the row replays. */
export function sourceFileHashes(): Record<string, string> {
  const paths = listSourceFiles(['src/ai', 'src/game', 'assembly', 'lab/ai', 'lab/harness'], '.ts');
  paths.push('package-lock.json', 'src/ai/wasm/tactics.wasm', 'lab/hard-ai/ladder/elo.ts',
    'lab/hard-ai/ladder/heavy.ts', 'lab/hard-ai/ladder/ruleset.ts', 'lab/hard-ai/ladder/openings.ts',
    'lab/hard-ai/ladder/openings/phasing.ts',
    'docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md',
    'docs/PHASING-2026-09-16.md',
    // Both band files are hashed: the one this revision reads, and the superseded
    // one, so a row's evidence records that the old bands were where they were.
    BANDS_PATH, SUPERSEDED_BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH);
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
