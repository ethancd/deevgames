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
 * the revision from `muju-phasing-1` to `muju-phasing-2`; amendment A7
 * (2026-09-22, the kill clock) replaced the draw entirely — the tenth kill-free
 * ply now decides on mined totals instead of drawing — and advanced the revision
 * again, to `muju-phasing-3`. Carrying the revision as a literal was already
 * shown to be a defect once (fourteen stale `muju-phasing-1` literals found at
 * A4): a row would stamp, check and report a revision the harness no longer
 * plays, and could pass its own per-game check while `lab/harness/runner.ts`
 * wrote the OTHER value. `RULES_VERSION` is therefore the ladder's own constant
 * (`lab/hard-ai/ladder/ruleset.ts` → `openings/phasing.ts` →
 * `harness/types.ts#HARNESS_RULES_VERSION`), re-exported so nothing in this lane
 * can drift from what the harness stamps.
 *
 * WHY THE BANDS PATH MOVED WITH IT, TWICE. A1's behaviour condition reads the
 * frozen purchase/inactivity bands. A4 re-scaled the inactivity-rate band
 * because the SAME quantity (`GameRecord.inactivityDraw`) was measured at a
 * different ply count: the p1 bands allow up to 0.866, the p2 bands up to
 * 0.726. A7 is a different kind of move: under the kill clock
 * `GameRecord.inactivityDraw` is structurally always false (a decided ten-ply
 * ending is `winType: 'kill-clock'`, not an inactivity draw — see the kill-clock
 * coordinator record's decision 3), so the band computed from it is not a
 * rescaled version of the old one, it is frozen at 0 for every stratum by
 * construction. `BANDS_PATH` is the re-frozen p3 reference
 * (`lab/harness/results/p3-scripted-2026-09-22/sanity-bands.json`);
 * `SUPERSEDED_BANDS_PATH` now names the p2 reference (which itself superseded
 * p1's, retained there for audit). Both prior references stay on disk; the
 * runner refuses a superseded bands file BY NAME as well as by hash mismatch.
 * Neither frozen file is ever edited here.
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

/** A7's re-frozen scripted reference: the bands a row under `RULES_VERSION` reads. */
export const BANDS_PATH: string = 'lab/harness/results/p3-scripted-2026-09-22/sanity-bands.json';
/** The 20-ply-clock (`muju-phasing-2`) bands A4 froze. Kept for audit; refused as a row's bands. */
export const SUPERSEDED_BANDS_PATH: string = 'lab/harness/results/p2-scripted-2026-09-19/sanity-bands.json';
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
