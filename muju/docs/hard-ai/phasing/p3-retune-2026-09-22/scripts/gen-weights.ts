/**
 * Lane T (p3 retune, 2026-09-22): generates every weight-vector arm for the
 * preregistered random search (SPEC §3). Run from `muju/`:
 *   node --import tsx docs/hard-ai/phasing/p3-retune-2026-09-22/scripts/gen-weights.ts
 *
 * Reproducible: a mulberry32 PRNG seeded with SEED (20260970, the same seed
 * the SPEC assigns to Stage A) draws every random number in a fixed, recorded
 * order. Re-running this script regenerates byte-identical JSONs (verified
 * below by hash comparison against the manifest on a second run).
 *
 * BASE VECTOR for every "rest v1" / block-scaled arm is `phasing-priors-v1`
 * (the feature audit's recommended vector, `docs/hard-ai/phasing/repair-2026-09-20/weights/phasing-priors-v1.json`,
 * hash fd5a13e5) -- NOT current production `DEFAULT_WEIGHTS` (label
 * `phasing-hand-priors-v1`, a different, Standard-era-derived vector; the
 * naming is confusingly close but the numbers differ). The random-search plan
 * in `repair-2026-09-20/reports/knobs/synthesis.json` scales "the v1 values"
 * of the home/tactical/geometry blocks, and `v1` there names this audit
 * vector throughout that doc and `make-variants.ts`. `control` (below) is the
 * SEPARATE, exact copy of production `DEFAULT_WEIGHTS` used to verify the
 * `hard@env` hook reproduces `hard@desktop`.
 *
 * INTERPRETIVE DECISION (recorded for the lane report): the SPEC's kill-clock
 * knobs 9-11 (DrawPressure, Inv16ClockDiscipline, PstMine) are NEW relative to
 * the repair-2026-09-20 random-search plan, which had folded PstMine,
 * DrawPressure and Inv16ClockDiscipline into its "geometry/structure block"
 * (see `combined-best-guess`'s hypothesis text in synthesis.json). Since the
 * SPEC now samples those three independently, this script's GEOMETRY_BLOCK
 * (knob 7, "g") is the original geometry set MINUS those three, so a knob-7
 * draw never gets silently overwritten by knobs 9-11 (or vice versa):
 *   GEOMETRY_BLOCK = SpawnArea, SpawnZero, AnchorDepth, AnchorFragility,
 *                    BlockingDeficit, CornerInfiltration, Inv13Turtle.
 */
import { writeFileSync } from 'node:fs';
import {
  DEFAULT_WEIGHTS,
  cloneWeights,
  serializeWeights,
  loadWeights,
  weightsHash,
} from '../../../../../src/ai/hard/eval/weights';
import { F, FEATURE_COUNT } from '../../../../../src/ai/hard/eval/features';
import { activeCatalog, NDEF } from '../../../../../src/ai/hard/core/catalog';

const OUT_WEIGHTS = new URL('../weights/', import.meta.url).pathname;
const SEED = 20260970;

type Named = Record<string, number>;
const cat = activeCatalog();

// --- deterministic PRNG (mulberry32), draws recorded in `DRAW_LOG` ---------
let state = SEED >>> 0;
const DRAW_LOG: { arm: string; knob: string; draws: number[] }[] = [];
function rawUniform(): number {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
let currentArm = '';
let currentDraws: number[] = [];
function uniform(lo: number, hi: number): number {
  const u = rawUniform();
  currentDraws.push(u);
  return lo + u * (hi - lo);
}
function logUniform(lo: number, hi: number): number {
  return Math.exp(uniform(Math.log(lo), Math.log(hi)));
}
function intUniform(lo: number, hi: number): number {
  return Math.round(uniform(lo, hi));
}
function maybe(p: number, lo: number, hi: number): number {
  const trigger = rawUniform();
  currentDraws.push(trigger);
  if (trigger < p) return 0;
  return uniform(lo, hi);
}
function maybeInt(p: number, lo: number, hi: number): number {
  const v = maybe(p, lo, hi);
  return v === 0 ? 0 : Math.round(v);
}
function beginArm(name: string): void {
  currentArm = name;
  currentDraws = [];
}
function endArm(knobSummary: string): void {
  DRAW_LOG.push({ arm: currentArm, knob: knobSummary, draws: currentDraws.slice() });
}

// --- V1 ingredient (verbatim from repair-2026-09-20/weights/phasing-priors-v1.json / make-variants.ts) ---
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
// see INTERPRETIVE DECISION above: PstMine, DrawPressure, Inv16ClockDiscipline excluded (independent knobs 9-11)
const GEOMETRY_BLOCK = ['SpawnArea', 'SpawnZero', 'AnchorDepth', 'AnchorFragility', 'BlockingDeficit', 'CornerInfiltration', 'Inv13Turtle'];

function idx(k: string): number {
  const i = (F as Record<string, number>)[k];
  if (i === undefined) throw new Error(`no feature ${k}`);
  return i;
}

/** cost x 100 x multiplier[tier]; tier 1 stays at 1.0 (BUY -> arrival continuity with PendingValue principal). */
function tierTable(mult: Record<number, number>): number[] {
  const out: number[] = [];
  for (let d = 0; d < NDEF; d++) out.push(Math.round(cat.cost[d] * 100 * (mult[cat.tier[d]] ?? 1)));
  return out;
}

interface Row { name: string; hash: string; changes: string }
const rows: Row[] = [];

function build(name: string, w0: Named, material: number[]): void {
  const w = cloneWeights(DEFAULT_WEIGHTS);
  w.label = name;
  w.w.fill(0);
  for (const [k, v] of Object.entries(w0)) w.w[idx(k)] = v;
  if (material.length !== NDEF) throw new Error(`${name}: material length`);
  for (let d = 0; d < NDEF; d++) {
    const v = material[d];
    if (!Number.isInteger(v)) throw new Error(`${name}: material[${d}] not integer`);
    w.material[d] = v;
  }
  if (w.w[F.PendingValue] !== 1) throw new Error(`${name}: PendingValue must stay 1`);
  if (w.w[F.Material] !== 100) throw new Error(`${name}: w[Material] must stay 100 (informational)`);
  // fixed-dead features enforced zero by construction (fill(0) above + w0 never sets them):
  const mustBeZero = ['Rent', 'BankConvertible', 'ElementCoverage', 'ApproachRetreat', 'ApproachStrand', 'StrandPunish',
    'Inv1SpawnZero', 'Inv2CornerSeal', 'Inv3RetreatSquare', 'Inv4StrandUnpunished', 'Inv5PoorMinerSquare',
    'Inv6FragileAnchor', 'Inv12CleaveLine', 'Inv14LiquidityFloor', 'Inv15UnknownAsSafe', 'Inv17SelfBlock',
    'Inv18WastedEndPlace', 'Inv19SoftMinerExposed', 'Inv20StrandNoRetreat', 'ArrivalThreat', 'DisruptPressure',
    'DepletionWaste', 'RunwayCliff', 'Insolvency', 'RelocationDebt', 'Infiltration', 'CornerSeal',
    'ActionsLeft', 'Corridor'];
  for (const n of mustBeZero) if (w.w[idx(n)] !== 0) throw new Error(`${name}: ${n} should be 0 (dead/double-charging feature), got ${w.w[idx(n)]}`);

  const json = serializeWeights(w);
  const path = `${OUT_WEIGHTS}${name}.json`;
  writeFileSync(path, json + '\n');
  const parsed = JSON.parse(json);
  const back = loadWeights(parsed);
  if (weightsHash(back) !== parsed.hash) throw new Error(`${name}: hash did not round-trip`);
  for (let i = 0; i < FEATURE_COUNT; i++) if (back.w[i] !== w.w[i]) throw new Error(`${name}: w[${i}] round-trip mismatch`);
  const diffs: string[] = [];
  for (const [k, v] of Object.entries(w0)) diffs.push(`${k}=${v}`);
  rows.push({ name, hash: parsed.hash, changes: diffs.join(', ') });
}

// --- control: exact production DEFAULT_WEIGHTS (label phasing-hand-priors-v1) ---
{
  const w = cloneWeights(DEFAULT_WEIGHTS);
  w.label = 'control';
  const json = serializeWeights(w);
  writeFileSync(`${OUT_WEIGHTS}control.json`, json + '\n');
  const parsed = JSON.parse(json);
  if (parsed.hash !== weightsHash(DEFAULT_WEIGHTS)) throw new Error('control does not match DEFAULT_WEIGHTS hash');
  rows.push({ name: 'control', hash: parsed.hash, changes: '(exact DEFAULT_WEIGHTS / phasing-hand-priors-v1)' });
}

// --- 24 random arms ---------------------------------------------------------
const N_RANDOM = 24;
for (let i = 1; i <= N_RANDOM; i++) {
  const name = `p3-s${String(i).padStart(2, '0')}`;
  beginArm(name);
  const bankExcess = intUniform(0, 60); // knob 1
  const bankLiquid = intUniform(60, 100); // knob 2
  const m = logUniform(1.3, 2.5); // knob 3
  const tierClimb = maybeInt(0.5, 100, 800); // knob 4
  const h = maybe(0.2, 0.4, 2.5); // knob 5 (0 means block off)
  const t = maybe(0.2, 0.4, 2.5); // knob 6
  const g = maybe(0.2, 0.4, 2.5); // knob 7
  const rentShortfall = Math.round(uniform(-600, 0)); // knob 8
  const drawPressure = Math.round(uniform(-80, 0)); // knob 9
  const inv16 = maybeInt(0.5, -300, 0); // knob 10
  const pstMine = maybeInt(0.5, 0, 60); // knob 11

  const w0: Named = {
    Material: 100, PendingValue: 1, EconDelta: 100,
    BankExcess: bankExcess, BankLiquid: bankLiquid,
    TierClimb: tierClimb,
    RentShortfall: rentShortfall,
    Inv7PromoteNoRunway: -600, // fixed, per spec
    DrawPressure: drawPressure,
    Inv16ClockDiscipline: inv16,
    PstMine: pstMine,
  };
  if (h > 0) for (const f of HOME_BLOCK) w0[f] = Math.round(V1[f] * h);
  if (t > 0) for (const f of TACTICAL_BLOCK) w0[f] = Math.round(V1[f] * t);
  if (g > 0) for (const f of GEOMETRY_BLOCK) w0[f] = Math.round(V1[f] * g);

  const material = tierTable({ 1: 1, 2: m, 3: m });
  build(name, w0, material);
  endArm(
    `BankExcess=${bankExcess} BankLiquid=${bankLiquid} m=${m.toFixed(3)} TierClimb=${tierClimb} ` +
      `h=${h.toFixed(3)} t=${t.toFixed(3)} g=${g.toFixed(3)} RentShortfall=${rentShortfall} ` +
      `DrawPressure=${drawPressure} Inv16=${inv16} PstMine=${pstMine}`,
  );
}

// --- 4 hand variants ---------------------------------------------------------
{
  const w0: Named = { ...V1, DrawPressure: -40, Inv16ClockDiscipline: 0, PstMine: 30 };
  build('hv-clock', w0, tierTable({ 1: 1, 2: 1.75, 3: 1.75 }));
}
{
  const w0: Named = { ...V1, PstMine: 45, BankExcess: 20 };
  build('hv-mine', w0, tierTable({ 1: 1, 2: 1.75, 3: 1.75 }));
}
{
  const w0: Named = { ...V1, TierClimb: 300 };
  build('hv-tier', w0, tierTable({ 1: 1, 2: 1.7, 3: 1.7 }));
}
{
  const w0: Named = { ...V1 };
  for (const f of HOME_BLOCK) w0[f] = Math.round(V1[f] * 1.5);
  for (const f of TACTICAL_BLOCK) w0[f] = Math.round(V1[f] * 1.5);
  build('hv-blocks', w0, tierTable({ 1: 1, 2: 1.75, 3: 1.75 }));
}

// --- write manifest ----------------------------------------------------------
const hashes = new Map<string, string>();
for (const r of rows) {
  if (hashes.has(r.hash) && r.name !== 'control') {
    // duplicates are only a problem among the 28 sampled/hand arms, not vs control by coincidence
    const other = hashes.get(r.hash)!;
    if (other !== 'control') throw new Error(`${r.name} duplicates ${other} (hash ${r.hash})`);
  }
  hashes.set(r.hash, r.name);
}
const manifest = {
  schema: 'p3-retune-2026-09-22-weights-manifest-v1',
  seed: SEED,
  generatedAt: new Date().toISOString(),
  base: 'phasing-priors-v1 (repair-2026-09-20/weights/phasing-priors-v1.json, hash fd5a13e5)',
  geometryBlockNote: 'GEOMETRY_BLOCK excludes PstMine/DrawPressure/Inv16ClockDiscipline (independent knobs 9-11); see file header',
  arms: rows,
  draws: DRAW_LOG,
};
writeFileSync(`${OUT_WEIGHTS}MANIFEST.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${rows.length} weight files + MANIFEST.json to ${OUT_WEIGHTS}`);
for (const r of rows) console.log(`${r.name} | ${r.hash} | ${r.changes}`);
