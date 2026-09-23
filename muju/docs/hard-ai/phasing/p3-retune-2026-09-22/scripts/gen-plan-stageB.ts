/** Lane T: writes the Stage B plan (SPEC §3 "Stage B (confirm on dev)"): the 8 Stage A
 * survivors + control, each playing:
 *   - 16 pairs vs aiv2-hard-turn, wall:6000, seed 20260971 (the primary ranking opponent)
 *   - 8 pairs vs Rush, fixed:N, seed 20260971
 *   - 8 pairs vs Balanced, fixed:N, seed 20260971 (regression guard)
 *   - 8 pairs vs Expand, fixed:N, seed 20260971 (regression guard)
 * Rank candidates by the SUM of the aiv2-hard-turn and Rush scores; a candidate that falls below
 * control on Balanced OR Expand is a Rush counter-strategy and is dropped regardless of its sum.
 * Keep top 3 for Stage C.
 *
 * CONCURRENCY: read PROGRESS.md's most recent "Concurrency ..." note before running this and set
 * SHARDS_FIXED / SHARDS_AIV2 / CONCURRENCY below (or override via env/CLI) accordingly -- the
 * coordinator changed this twice during Stage A (8->2->8 heavy slots) as the shared box's load
 * changed. SPEC default: aiv2-hard-turn rows must stay at <=4 concurrent GAMES total, i.e. one
 * aiv2 row at a time with --shards 4 (never run two aiv2 rows concurrently). Rush/Balanced/Expand
 * (fixed-work, cannot be VOID) can run two rows at a time with --shards 4 under
 * MUJU_HEAVY_SLOTS=8, same as Stage A's default cadence.
 *
 * Run from `muju/`:
 *   node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/gen-plan-stageB.ts
 * Then, respecting whatever the CURRENT coordinator concurrency directive is:
 *   MUJU_HEAVY_SLOTS=<n> node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
 *     docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageB-plan.json --concurrency <k>
 * (the aiv2 rows and the fixed-work rows are interleaved in plan order per arm; sweep.ts's
 * concurrency is GLOBAL across the whole plan, so if aiv2 rows must never run two-at-a-time while
 * fixed rows may, split stageB-plan.json into stageB-plan-aiv2.json / stageB-plan-fixed.json and
 * run the aiv2 file with --concurrency 1 and the fixed file with --concurrency 2, in either order --
 * this script writes both alongside the combined file.)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const N = 60000; // from the Stage A fixed-work probe, PROGRESS.md
const SEED = 20260971;
const OPENINGS = 'lab/hard-ai/ladder/openings/p1-dev.jsonl';
const WEIGHTS_DIR = 'docs/hard-ai/phasing/p3-retune-2026-09-22/weights';
const RESULTS = 'docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageB';

// Stage A survivors (PROGRESS.md "Stage B set"), rank order preserved for readability only.
const SURVIVORS = ['hv-mine', 'p3-s18', 'hv-blocks', 'hv-clock', 'p3-s19', 'p3-s08', 'p3-s21', 'p3-s10'];
const ARMS = ['control', ...SURVIVORS];

const SHARDS_FIXED = 4; // Rush/Balanced/Expand: fixed-work, cannot be VOID
const SHARDS_AIV2 = 4; // aiv2-hard-turn: must stay <=4 concurrent games -> one row at a time at shards 4

interface Row {
  id: string; stage: 'B'; arm: string; weightsFile: string; engineA: string; engineB: string;
  work: string; pairs: number; seed: number; openings: string; shards: number; outDir: string;
}
function row(arm: string, engineB: string, work: string, pairs: number, shards: number): Row {
  return {
    id: `B-${arm}-${engineB}`, stage: 'B', arm,
    weightsFile: `${WEIGHTS_DIR}/${arm}.json`,
    engineA: 'hard@env', engineB, work, pairs, seed: SEED, openings: OPENINGS, shards,
    outDir: `${RESULTS}/${arm}-${engineB}`,
  };
}

const aiv2Rows: Row[] = ARMS.map(arm => row(arm, 'aiv2-hard-turn', 'wall:6000', 16, SHARDS_AIV2));
const fixedRows: Row[] = ARMS.flatMap(arm => [
  row(arm, 'Rush', `fixed:${N}`, 8, SHARDS_FIXED),
  row(arm, 'Balanced', `fixed:${N}`, 8, SHARDS_FIXED),
  row(arm, 'Expand', `fixed:${N}`, 8, SHARDS_FIXED),
]);

writeFileSync(path.join(HERE, 'stageB-plan-aiv2.json'), JSON.stringify(aiv2Rows, null, 2) + '\n');
writeFileSync(path.join(HERE, 'stageB-plan-fixed.json'), JSON.stringify(fixedRows, null, 2) + '\n');
writeFileSync(path.join(HERE, 'stageB-plan.json'), JSON.stringify([...aiv2Rows, ...fixedRows], null, 2) + '\n');
console.log(`wrote ${aiv2Rows.length} aiv2 rows + ${fixedRows.length} fixed rows (stageB-plan{-aiv2,-fixed}.json)`);
