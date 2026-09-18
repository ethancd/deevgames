/**
 * `node --import tsx lab/results/hard-ai-e3/correct/b6/scan.ts [--out <path>]`
 *
 * The measurement record of E3.2 B6 (`HardConfig.evalFix.approachTieOrder`,
 * lane 14): the rot180 + seat-swap mirror scan over `fuzz-1000` with the flag
 * off and on beside the other five, and the tie-free invariance scan that says
 * where `retreats` is allowed to move. Writes `scan.json` next to this file;
 * every number in `docs/hard-ai/e3/E3.2-CORRECTNESS-B6.md` is read off it.
 *
 * WHY IT LIVES UNDER `lab/results`. Lane 14 owns `tables/approach.ts` (behind
 * the flag), one optional `config.ts` field, `ablate/arms.ts`, three test files,
 * the doc and `lab/results/hard-ai-e3/correct/b6/**`. `lab/hard-ai/audit/` is
 * not this lane's, and `lab/hard-ai/audit/eval-audit.ts` takes no `--eval-fix`
 * argument, so its rot180 check cannot be pointed at an arm; this script is
 * lane 12's `rot180Scan` (`../repro.ts`) re-run with the sixth flag, using the
 * `Evaluator` directly with a stamped `evalFix`. Lane 12's A1 proposal — move
 * the reproduction instrument under `lab/hard-ai/audit/` — covers this file
 * too; until it lands `npm run hard:types` does NOT typecheck it, and the
 * assertions that must hold are in `tests/ai/hard/approach-tie.test.ts` and
 * `tests/ai/hard/eval-correct.test.ts`, which are typechecked and run.
 *
 * NO ENGINE IS CONSTRUCTED HERE: every number is a static `Evaluator.full` or a
 * `buildTables` call, so E0's I2 lesson applies as the
 * `DEFAULT_WEIGHTS.version !== 0` assertion below. Nothing searches and nothing
 * takes a heavy slot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Replica } from '../../../../../src/ai/hard/core/state';
import { Scratch, bbHas, bbIsEmpty } from '../../../../../src/ai/hard/core/bits';
import { Evaluator } from '../../../../../src/ai/hard/eval/evaluate';
import { DEFAULT_WEIGHTS } from '../../../../../src/ai/hard/eval/weights';
import { FEATURE_COUNT, FEATURE_NAMES } from '../../../../../src/ai/hard/eval/features';
import { allocTables, buildTables, type NodeTables } from '../../../../../src/ai/hard/tables/context';
import { Approach } from '../../../../../src/ai/hard/tables/approach';
import { activeCatalog } from '../../../../../src/ai/hard/core/catalog';
import { newSpawnInfo, spawnInfo } from '../../../../../src/ai/hard/core/spawn';
import { ADJ } from '../../../../../src/ai/hard/core/tables';
import { DEAD, MAX_SLOTS, NO_SLOT, type PackedState, type Side } from '../../../../../src/ai/hard/types';
import type { EvalFix } from '../../../../../src/ai/hard/config';
import { mirror180, readPositions } from '../../../../hard-ai/positions/corpus';

if (DEFAULT_WEIGHTS.version === 0) throw new Error('scan: placeholder weights (E0 I2)');

const MUJU = path.resolve(import.meta.dirname, '../../../../..');
const FUZZ = path.join(MUJU, 'lab/hard-ai/positions/fuzz-1000.jsonl');
const DEFAULT_OUT = path.resolve(import.meta.dirname, 'scan.json');

const rep = new Replica();
const sc = new Scratch(4, 8, 8, 8);
const corpus = readPositions(FUZZ);

const B1_B5: EvalFix = {
  relocationCompare: true,
  rot180TieOrder: true,
  infiltrationPerAnchor: true,
  inv3RetreatConjunct: true,
  rentOnce: true,
};
const ARMS: Record<string, EvalFix | null> = {
  off: null,
  b4: { inv3RetreatConjunct: true },
  b6: { approachTieOrder: true },
  'b4+b6': { inv3RetreatConjunct: true, approachTieOrder: true },
  'b1-b5': B1_B5,
  'b1-b6': { ...B1_B5, approachTieOrder: true },
};

interface Violation {
  id: string;
  features: { name: string; position: number; mirror: number }[];
  scoreDeltaCc: number;
}

/** Lane 12's `rot180Scan`: each position against its own rot180 + seat-swap mirror. */
function rot180Scan(arm: string): unknown {
  const e = new Evaluator(rep, DEFAULT_WEIGHTS, ARMS[arm]);
  const byFeature = new Map<string, number>();
  const violations: Violation[] = [];
  let checked = 0;
  for (const item of corpus) {
    let p: PackedState;
    let q: PackedState;
    try {
      p = rep.pack(item.state);
      q = rep.pack(mirror180(item.state));
    } catch {
      continue;
    }
    checked++;
    const fa = new Int32Array(FEATURE_COUNT);
    e.full(p, 0, sc, 0, fa);
    const fb = new Int32Array(FEATURE_COUNT);
    e.full(q, 1, sc, 0, fb);
    const features: Violation['features'] = [];
    let delta = 0;
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (fa[i] === fb[i]) continue;
      features.push({ name: FEATURE_NAMES[i], position: fa[i], mirror: fb[i] });
      byFeature.set(FEATURE_NAMES[i], (byFeature.get(FEATURE_NAMES[i]) ?? 0) + 1);
      delta += DEFAULT_WEIGHTS.w[i] * (fb[i] - fa[i]);
    }
    if (features.length > 0) violations.push({ id: item.id, features, scoreDeltaCc: delta });
  }
  const inv3 = violations.filter(v => v.features.some(f => f.name === 'Inv3RetreatSquare'));
  return {
    arm,
    checked,
    violations: violations.length,
    byFeature: [...byFeature.entries()].map(([name, positions]) => ({ name, positions })),
    inv3Violations: inv3.length,
    inv3Ids: inv3.map(v => v.id),
    inv3Rows: inv3.map(v => ({
      id: v.id,
      inv3: v.features.find(f => f.name === 'Inv3RetreatSquare'),
      scoreDeltaCc: v.scoreDeltaCc,
    })),
  };
}

function tablesFor(p: PackedState, fix: EvalFix | null): NodeTables {
  const t = allocTables();
  t.evalFix = fix;
  return buildTables(p, sc, 0, 2, t);
}

/**
 * `classifyFrom`'s candidate set for one (distance field, speed) against one
 * target: the target's neighbours that are empty or the attacker's own square,
 * costed `ceil(dist/speed)`. Returns how many tie on the cheapest cost. The
 * class filter and the action budget are NOT applied — both only shrink the
 * set, so "no tie here" is sound.
 */
function minCostTies(p: PackedState, dist: Int8Array, attackerSq: number, speed: number, targetSq: number): number {
  let best = -1;
  let n = 0;
  for (let q = 0; q < 100; q++) {
    if (!bbHas(ADJ[targetSq], q)) continue;
    if (p.pieceAt[q] !== NO_SLOT && q !== attackerSq) continue;
    const d = dist[q];
    if (d < 0) continue;
    const cost = d === 0 ? 0 : ((d + speed - 1) / speed) | 0;
    if (best < 0 || cost < best) {
      best = cost;
      n = 1;
    } else if (cost === best) {
      n++;
    }
  }
  return n;
}

/** True when NO enemy attacker of slot `v` has two equally cheap attack squares. */
function tieFree(p: PackedState, t: NodeTables, v: number): boolean {
  const cat = activeCatalog();
  const defender = p.owner[v] as Side;
  const attacker = (1 - defender) as Side;
  const targetSq = p.sq[v];
  for (let a = 0; a < MAX_SLOTS; a++) {
    if (p.sq[a] === DEAD || p.owner[a] !== attacker) continue;
    const existing = p.defId[a];
    const promoted = cat.nextDef[existing];
    const forms = promoted >= 0 ? [existing, promoted] : [existing];
    for (const def of forms) {
      const speed = cat.spd[def];
      if (speed < 1) continue;
      if (minCostTies(p, t.dist.get(p, p.sq[a]), p.sq[a], speed, targetSq) > 1) return false;
    }
  }
  const info = newSpawnInfo();
  spawnInfo(p, attacker, info);
  if (!bbIsEmpty(info.legal)) {
    const buyDist = new Int8Array(100);
    t.dist.multi(p, info.legal, buyDist);
    for (let i = 0; i < cat.tier1.length; i++) {
      const def = cat.tier1[i];
      if (cat.cost[def] > p.bank[attacker]) continue;
      const speed = cat.spd[def];
      if (speed < 1) continue;
      if (minCostTies(p, buyDist, -1, speed, targetSq) > 1) return false;
    }
  }
  return true;
}

/** Where `retreats` moves with the flag on, and whether a tie was there. */
function tieScan(): unknown {
  const on: EvalFix = { approachTieOrder: true };
  const moved: { id: string; slot: number; off: number; on: number; tieFree: boolean }[] = [];
  let slots = 0;
  let retreatSlots = 0;
  let tieFreeSlots = 0;
  let movedTieFree = 0;
  for (const item of corpus) {
    const p = rep.pack(item.state);
    const tOff = tablesFor(p, null);
    const retreatsOff = Uint8Array.from(tOff.retreats);
    const approachOff = Uint8Array.from(tOff.approach);
    const tOn = tablesFor(p, on);
    for (let v = 0; v < MAX_SLOTS; v++) {
      if (p.sq[v] === DEAD) continue;
      if (approachOff[v] === Approach.NONE) continue;
      slots++;
      if (approachOff[v] === Approach.RETREAT) retreatSlots++;
      if (approachOff[v] !== tOn.approach[v]) throw new Error(`scan: ${item.id} slot ${v} changed class`);
      const free = tieFree(p, tOff, v);
      if (free) tieFreeSlots++;
      if (retreatsOff[v] === tOn.retreats[v]) continue;
      moved.push({ id: item.id, slot: v, off: retreatsOff[v], on: tOn.retreats[v], tieFree: free });
      if (free) movedTieFree++;
    }
  }
  return {
    positions: corpus.length,
    slotsWithAnApproach: slots,
    retreatSlots,
    tieFreeSlots,
    retreatsMoved: moved.length,
    retreatsMovedAtTieFreeSlots: movedTieFree,
    moved,
  };
}

function main(argv: readonly string[]): void {
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--out') out = path.resolve(argv[i + 1]);
  const record = {
    schema: 'muju-e3-b6-scan-v1',
    at: new Date().toISOString(),
    corpus: path.relative(MUJU, FUZZ),
    positions: corpus.length,
    weights: DEFAULT_WEIGHTS.version,
    rot180: Object.keys(ARMS).map(rot180Scan),
    tieScan: tieScan(),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  for (const row of record.rot180 as { arm: string; violations: number; inv3Violations: number }[]) {
    console.log(`  rot180 ${row.arm.padEnd(6)} violations ${row.violations}, of them Inv3 ${row.inv3Violations}`);
  }
  const ts = record.tieScan as { slotsWithAnApproach: number; tieFreeSlots: number; retreatsMoved: number };
  console.log(`  tie scan: ${ts.slotsWithAnApproach} slots, ${ts.tieFreeSlots} tie-free, ${ts.retreatsMoved} moved`);
  console.log(`  ${out}`);
}

main(process.argv.slice(2));
