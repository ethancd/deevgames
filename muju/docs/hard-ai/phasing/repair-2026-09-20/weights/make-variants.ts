// Synthesizer experiment set: weight-vector variants for the "why does Hard not promote" ladder runs.
// Scratch only. Run from the muju directory:
//   cd /Users/ethancd/src/deevgames/muju && node --import tsx <this file>
// Every file is produced by the repo's own serializeWeights and immediately round-tripped through loadWeights.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  DEFAULT_WEIGHTS,
  cloneWeights,
  serializeWeights,
  loadWeights,
  weightsHash,
  WEIGHTS_FILE_SCHEMA,
  WEIGHTS_VERSION,
} from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights';
import { F, FEATURE_COUNT } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features';
import { PHASING_EVAL_SCHEMA } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/config';
import { activeCatalog, NDEF } from '/Users/ethancd/src/deevgames/muju/src/ai/hard/core/catalog';

const OUT = '/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/weights';
const AUDIT_V1 = '/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/feature-audit/phasing-priors-v1.weights.json';

type Named = Record<string, number>;
const cat = activeCatalog();

// --- ingredient blocks ---------------------------------------------------------------------------

/** Standard-era hand priors, verbatim from `git show 43b87b6:muju/src/ai/hard/eval/weights.ts` (features 0-57). */
const OLD: Named = {
  Material: 100, Rent: -422, BankLiquid: 90, BankExcess: 25, HomeInvaded: -4000,
  PstMine: 60, BankConvertible: 20, SpawnArea: 30, SpawnReserve: 8, SpawnZero: -800, AnchorDepth: 25,
  Infiltration: 90, CornerSeal: -60, HomeThreat: -400, HomeCountdown: -180, HomePlug: 220, HomeRescuers: 90,
  Exposure: -20, DrawPressure: -8, ActionsLeft: 40, Corridor: 0, TierClimb: 0, ElementCoverage: 150,
  EconDelta: 80, DepletionWaste: -30, RunwayCliff: -600, Insolvency: -150, RelocationDebt: -60,
  Hanging: -50, HangingBuy: -30, ApproachRetreat: -25, ApproachStrand: -10, StrandPunish: 20, KillAvailable: 35,
  CleaveExposure: -40, AnchorFragility: -120, BlockingDeficit: -150, CornerInfiltration: 300,
  Inv1SpawnZero: -800, Inv2CornerSeal: -300, Inv3RetreatSquare: -250, Inv4StrandUnpunished: -100,
  Inv5PoorMinerSquare: -400, Inv6FragileAnchor: -120, Inv7PromoteNoRunway: -600, Inv8NoPreAdjacency: -150,
  Inv9ChipAcrossTurn: -150, Inv10HomeReachable: -400, Inv11HomeBare: -250, Inv12CleaveLine: -40,
  Inv13Turtle: -200, Inv14LiquidityFloor: -200, Inv15UnknownAsSafe: 0, Inv16ClockDiscipline: -200,
  Inv17SelfBlock: -60, Inv18WastedEndPlace: 0, Inv19SoftMinerExposed: -150, Inv20StrandNoRetreat: -250,
};

/** The feature audit's recommended vector (w part). Material is tier x1.75 on tiers 2 and 3. */
const V1: Named = {
  Material: 100, BankLiquid: 85, BankExcess: 40, HomeInvaded: -3000,
  PstMine: 25, SpawnArea: 10, SpawnZero: -400, AnchorDepth: 15,
  HomeThreat: -400, HomeCountdown: -180, HomePlug: 200, HomeRescuers: 90,
  Exposure: -10, DrawPressure: -5,
  EconDelta: 100, Hanging: -30, HangingBuy: -30, KillAvailable: 25, CleaveExposure: -30,
  AnchorFragility: -60, BlockingDeficit: -80, CornerInfiltration: 300,
  Inv8NoPreAdjacency: -100, Inv9ChipAcrossTurn: -100, Inv10HomeReachable: -400, Inv11HomeBare: -150,
  Inv13Turtle: -100, Inv16ClockDiscipline: -200,
  PendingValue: 1, RentShortfall: -150,
};

const HOME_BLOCK = ['HomeInvaded', 'HomeThreat', 'HomeCountdown', 'HomePlug', 'HomeRescuers', 'Inv10HomeReachable', 'Inv11HomeBare'];
const TACTICAL_BLOCK = ['Hanging', 'HangingBuy', 'KillAvailable', 'CleaveExposure', 'Exposure', 'Inv8NoPreAdjacency', 'Inv9ChipAcrossTurn'];
const pick = (from: Named, names: string[]): Named => Object.fromEntries(names.map(n => {
  if (!(n in from)) throw new Error(`pick: ${n} missing`);
  return [n, from[n]];
}));

/** cost x 100 x multiplier[tier]; tier 1 must stay at 1.0 (BUY -> arrival continuity with PendingValue principal). */
function tierTable(mult: Record<number, number>): number[] {
  const out: number[] = [];
  for (let d = 0; d < NDEF; d++) out.push(Math.round(cat.cost[d] * 100 * (mult[cat.tier[d]] ?? 1)));
  return out;
}
/** material-tier-values investigator's combat-grounded per-element table ("moderate"), NDEF order. */
const MATERIAL_MODERATE = [300, 1275, 2650, 300, 1175, 2300, 400, 1575, 3250, 400, 1275, 2750, 500, 1400, 2925, 500, 1625, 3200];

// --- builder ---------------------------------------------------------------------------------------

interface Row { name: string; hash: string; nonZero: number; fire12: number; water12: number; fire23: number; changes: string }
const rows: Row[] = [];
const BOOT = DEFAULT_WEIGHTS;

function build(name: string, opts: { set?: Named; replaceAll?: Named; material?: number[] }): void {
  const w = cloneWeights(BOOT);
  w.label = name;
  if (opts.replaceAll) {
    w.w.fill(0);
    for (const [k, v] of Object.entries(opts.replaceAll)) w.w[idx(k)] = v;
  }
  if (opts.set) for (const [k, v] of Object.entries(opts.set)) w.w[idx(k)] = v;
  if (opts.material) {
    if (opts.material.length !== NDEF) throw new Error(`${name}: material length`);
    for (let d = 0; d < NDEF; d++) {
      const v = opts.material[d];
      if (!Number.isInteger(v)) throw new Error(`${name}: material[${d}] not an integer`);
      if (cat.tier[d] === 1 && v !== cat.cost[d] * 100) throw new Error(`${name}: tier-1 material must stay cost x 100`);
      if (cat.tier[d] > 1 && v <= opts.material[d - 1]) throw new Error(`${name}: material not increasing with tier at def ${d}`);
      w.material[d] = v;
    }
  }
  if (w.w[F.PendingValue] !== 1) throw new Error(`${name}: PendingValue must stay 1 (it scales refundable principal)`);
  if (w.w[F.Material] !== 100) throw new Error(`${name}: w[Material] is informational and stays 100`);

  // write, then prove the file parses and is the same vector
  const json = serializeWeights(w);
  const path = `${OUT}/${name}.json`;
  writeFileSync(path, json + '\n');
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed.schema !== WEIGHTS_FILE_SCHEMA || parsed.featureSchema !== PHASING_EVAL_SCHEMA || parsed.version !== WEIGHTS_VERSION) throw new Error(`${name}: header`);
  if (parsed.w.length !== FEATURE_COUNT || parsed.material.length !== NDEF) throw new Error(`${name}: shape`);
  const back = loadWeights(parsed);
  if (back.label !== name) throw new Error(`${name}: label did not round-trip`);
  if (weightsHash(back) !== weightsHash(w) || weightsHash(back) !== parsed.hash) throw new Error(`${name}: hash did not round-trip`);
  for (let i = 0; i < FEATURE_COUNT; i++) if (back.w[i] !== w.w[i]) throw new Error(`${name}: w[${i}] did not round-trip`);
  for (let d = 0; d < NDEF; d++) if (back.material[d] !== w.material[d]) throw new Error(`${name}: material[${d}] did not round-trip`);

  // what changed from the bootstrap, by feature name / def index
  const names = Object.keys(F) as (keyof typeof F)[];
  const diffs: string[] = [];
  for (const n of names) if (w.w[F[n]] !== BOOT.w[F[n]]) diffs.push(`${n} ${BOOT.w[F[n]]}->${w.w[F[n]]}`);
  let matChanged = false;
  for (let d = 0; d < NDEF; d++) if (w.material[d] !== BOOT.material[d]) matChanged = true;
  if (matChanged) diffs.push(`material [${Array.from(w.material).join(',')}]`);

  rows.push({
    name, hash: parsed.hash, nonZero: Array.from(w.w).filter(v => v !== 0).length,
    fire12: promoDelta(w, 0), water12: promoDelta(w, 6), fire23: promoDelta(w, 1),
    changes: diffs.length ? diffs.join('; ') : '(none)',
  });
}
function idx(k: string): number {
  const i = (F as Record<string, number>)[k];
  if (i === undefined) throw new Error(`no feature ${k}`);
  return i;
}
/**
 * Back-of-envelope static value (cc) of promoting def -> def+1, paid from EXCESS cash, no mining change, first
 * body of its element to reach that tier: material gain - BankExcess x cost + Rent x dUpkeep + TierClimb
 * - EconDelta x trunc(4.22 x dUpkeep). Illustrative only: the engine's own number comes from the forecast.
 */
function promoDelta(w: ReturnType<typeof cloneWeights>, def: number): number {
  const cost = cat.cost[def + 1] - cat.cost[def];
  const dUp = cat.upkeep[def + 1] - cat.upkeep[def];
  return (w.material[def + 1] - w.material[def]) - w.w[F.BankExcess] * cost + w.w[F.Rent] * dUp + w.w[F.TierClimb]
    - w.w[F.EconDelta] * Math.trunc(4.22 * dUp);
}

// --- the set ---------------------------------------------------------------------------------------

// 1. control
build('bootstrap-control', {});
// 2-6. single factors
build('bank-discount', { set: { BankLiquid: 85, BankExcess: 40 } });
build('tier-premium', { material: tierTable({ 1: 1, 2: 1.75, 3: 1.75 }) });
build('tier-climb', { set: { TierClimb: 600 } });
build('home-block', { set: pick(V1, HOME_BLOCK) });
build('tactical-block', { set: pick(V1, TACTICAL_BLOCK) });
// 7. the Standard-era hand priors in full on the current schema (PendingValue 1 is the only Phasing addition)
build('old-priors-restored', { replaceAll: { ...OLD, PendingValue: 1 } });
// 8. the feature audit's recommendation
build('phasing-priors-v1', { replaceAll: V1, material: tierTable({ 1: 1, 2: 1.75, 3: 1.75 }) });
// 9. the v2-spending investigator's translation of AIEngineV2's valuation into Hard's units
build('v2-mirror', { set: { BankLiquid: 50, BankExcess: 50, Rent: 500, TierClimb: 40 } });
// 10. combined best guess: v1's blocks + the ladder-tested 90/25 cash discount + the per-element material table
//     + firmer rent guards (the 90/25 sweep row already shows upkeep-elimination losses)
build('combined-best-guess', {
  replaceAll: { ...V1, BankLiquid: 90, BankExcess: 25, RentShortfall: -300, Inv7PromoteNoRunway: -600 },
  material: MATERIAL_MODERATE,
});
// 10b. the same economy fix WITHOUT the home/tactical/geometry blocks. The first-pass sweep row m-combined
//      (90/25 + old home + old tactical) scored 7/0/25 vs Rush against 12/0/20 for 90/25 alone, so the
//      positional blocks need their own on/off comparison.
build('econ-only-best-guess', {
  set: { BankLiquid: 90, BankExcess: 25, RentShortfall: -300, Inv7PromoteNoRunway: -600 },
  material: MATERIAL_MODERATE,
});
// 11-12. deliberate overshoots
build('overshoot-bank-dump', { set: { BankLiquid: 50, BankExcess: 0 } });
build('overshoot-material-x3', { material: tierTable({ 1: 1, 2: 3, 3: 3 }) });

// --- cross-checks ------------------------------------------------------------------------------------

const control = rows.find(r => r.name === 'bootstrap-control')!;
if (control.hash !== weightsHash(DEFAULT_WEIGHTS)) throw new Error('control is not the bootstrap');
const auditV1 = JSON.parse(readFileSync(AUDIT_V1, 'utf8'));
const mineV1 = rows.find(r => r.name === 'phasing-priors-v1')!;
console.log(`audit v1 hash ${auditV1.hash} vs generated ${mineV1.hash}: ${auditV1.hash === mineV1.hash ? 'IDENTICAL' : 'DIFFERENT'}`);
const hashes = new Map<string, string>();
for (const r of rows) {
  if (hashes.has(r.hash)) throw new Error(`${r.name} duplicates ${hashes.get(r.hash)}`);
  hashes.set(r.hash, r.name);
}
console.log(`schema ${WEIGHTS_FILE_SCHEMA} / ${PHASING_EVAL_SCHEMA} / version ${WEIGHTS_VERSION}; ${rows.length} files, all round-tripped through loadWeights`);
console.log('name | hash | nonzero w | promo fire1->2 | water1->2 | fire2->3 (cc, from excess cash, illustrative)');
for (const r of rows) console.log(`${r.name} | ${r.hash} | ${r.nonZero} | ${r.fire12} | ${r.water12} | ${r.fire23}`);
console.log('');
for (const r of rows) console.log(`${r.name}: ${r.changes}`);
