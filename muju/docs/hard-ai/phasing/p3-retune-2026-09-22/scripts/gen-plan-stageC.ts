/** Lane T: writes the Stage C plan (SPEC §3 "Stage C (select on held-out)"): top 3 Stage B
 * survivors + control, each playing p1-val.jsonl (the held-out set, previously looked at twice):
 *   - 32 pairs vs aiv2-hard-turn, wall:6000, seed 20260972, <=4 concurrent shards, timing must be
 *     valid (re-run at lower concurrency if VOID)
 *   - 32 pairs vs Rush, fixed:N, seed 20260972
 * The winner is chosen ONLY from this table by summed score (aiv2 + Rush); report ONLY these
 * numbers as the tuning result (winner's-curse note in SPEC §3). If no candidate beats control on
 * the sum, ship control (no weight change).
 *
 * EDIT `TOP3` BELOW before running -- it is not known until Stage B's ranking is read (SPEC's
 * rule: rank by SUMMED score of the aiv2-hard-turn and Rush Stage-B rows, drop anything that falls
 * below control on the Balanced OR Expand regression guard, keep top 3 of what remains).
 *
 * Run from `muju/`:
 *   node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/gen-plan-stageC.ts
 * Then (aiv2 rows one at a time, shards<=4; fixed rows two at a time is fine if the coordinator's
 * current concurrency directive allows -- check PROGRESS.md's latest "Concurrency ..." note first):
 *   MUJU_HEAVY_SLOTS=4 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
 *     docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageC-plan-aiv2.json --concurrency 1
 *   MUJU_HEAVY_SLOTS=8 node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/sweep.ts \
 *     docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/stageC-plan-fixed.json --concurrency 2
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const N = 60000;
const SEED = 20260972;
const OPENINGS = 'lab/hard-ai/ladder/openings/p1-val.jsonl';
const WEIGHTS_DIR = 'docs/hard-ai/phasing/p3-retune-2026-09-22/weights';
const RESULTS = 'docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageC';

// FILL IN from the Stage B ranking (top 3 by summed aiv2-hard-turn + Rush score, after the
// Balanced/Expand regression guard). Placeholder below is NOT a real answer.
const TOP3 = ['p3-s08', 'hv-mine', 'p3-s18']; // filled by chain-BC.py from the Stage B ranking
const ARMS = ['control', ...TOP3];

interface Row {
  id: string; stage: 'C'; arm: string; weightsFile: string; engineA: string; engineB: string;
  work: string; pairs: number; seed: number; openings: string; shards: number; outDir: string;
}
function row(arm: string, engineB: string, work: string, pairs: number, shards: number): Row {
  return {
    id: `C-${arm}-${engineB}`, stage: 'C', arm,
    weightsFile: `${WEIGHTS_DIR}/${arm}.json`,
    engineA: 'hard@env', engineB, work, pairs, seed: SEED, openings: OPENINGS, shards,
    outDir: `${RESULTS}/${arm}-${engineB}`,
  };
}

if (TOP3.some(a => a.startsWith('FILL-IN'))) {
  console.error('gen-plan-stageC: edit TOP3 with the real Stage B survivors before running this.');
  process.exit(1);
}

const aiv2Rows: Row[] = ARMS.map(arm => row(arm, 'aiv2-hard-turn', 'wall:6000', 32, 4));
const fixedRows: Row[] = ARMS.map(arm => row(arm, 'Rush', `fixed:${N}`, 32, 4));

writeFileSync(path.join(HERE, 'stageC-plan-aiv2.json'), JSON.stringify(aiv2Rows, null, 2) + '\n');
writeFileSync(path.join(HERE, 'stageC-plan-fixed.json'), JSON.stringify(fixedRows, null, 2) + '\n');
console.log(`wrote ${aiv2Rows.length} aiv2 rows + ${fixedRows.length} fixed rows for arms: ${ARMS.join(', ')}`);
