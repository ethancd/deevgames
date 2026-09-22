/** Lane T: writes the Stage A plan (SPEC §3 "Stage A (screen)"): 29 arms (24 random + 4
 * hand + control) x 8 pairs vs Rush, `fixed:60000` (N chosen by the fixed-work probe,
 * PROGRESS.md), seed 20260970, p1-dev, `--shards 4`. Run from `muju/`:
 *   node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/gen-plan-stageA.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const WEIGHTS_DIR = path.join(HERE, '../weights');
const N = 60000;
const SEED = 20260970;
const OPENINGS = 'lab/hard-ai/ladder/openings/p1-dev.jsonl';

const manifest = JSON.parse(readFileSync(path.join(WEIGHTS_DIR, 'MANIFEST.json'), 'utf8'));
const arms: string[] = manifest.arms.map((r: { name: string }) => r.name);
// sanity: every weight file referenced actually exists
for (const arm of arms) {
  const f = path.join(WEIGHTS_DIR, `${arm}.json`);
  readFileSync(f); // throws if missing
}

const plan = arms.map(arm => ({
  id: `A-${arm}-Rush`,
  stage: 'A',
  arm,
  weightsFile: `docs/hard-ai/phasing/p3-retune-2026-09-22/weights/${arm}.json`,
  engineA: 'hard@env',
  engineB: 'Rush',
  work: `fixed:${N}`,
  pairs: 8,
  seed: SEED,
  openings: OPENINGS,
  shards: 4,
  outDir: `docs/hard-ai/phasing/p3-retune-2026-09-22/results/stageA/${arm}-Rush`,
}));

writeFileSync(path.join(HERE, 'stageA-plan.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(`wrote ${plan.length} rows to stageA-plan.json`);
