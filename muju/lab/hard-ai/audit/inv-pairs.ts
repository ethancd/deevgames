/**
 * E3.1 lane 2 — the twenty invariant bits on the authored pairs.
 *
 * `lab/hard-ai/suites/invariants.positions.jsonl` holds twenty PAIRS of
 * post-turn macro positions (`<inv>-violating` / `<inv>-correct`), all with
 * BLACK to move in the Place phase, i.e. WHITE is the side whose turn has just
 * ended and whose invariant bit the fixture is about
 * (`invariants.suite.json`'s `side: "white"` on every case).
 *
 * This script answers four questions and writes them to
 * `lab/results/hard-ai-e3/inv-audit/pairs.json`:
 *
 *   1. PAIRS — does each invariant's bit flip between its two members, and
 *      does the violating member set EXACTLY its own bit (DESIGN §5.13's gate)?
 *   2. SIDES — which invariants can ever fire for the side that has NOT just
 *      moved. Six invariants (5, 7, 8, 9's chip limb, 17, 20) are read off unit
 *      flags that `resetUnitActions` has already cleared for the incoming
 *      player, and invariant 14's `!killedThisTurn` limb is satisfied for that
 *      player by construction.
 *   3. DRAWPRESSURE — DESIGN §5.12.1 row 18 defines the feature as
 *      `sign(v0 + v1 so far) × clock²`; `eval/features.ts:293-294` uses
 *      `sign(leadCc)` instead, where `leadCc` is catalogue material plus bank
 *      only (`eval/invariants.ts:374-377`). The run reports how often the two
 *      signs disagree on these forty positions.
 *   4. HOME OVERLAP — `HomeInvaded`, `HomeThreat`, `HomeCountdown` and
 *      `Inv10HomeReachable` on every position, with their weighted cc, because
 *      invariant 10's first limb (`home.occupied === 1`) is `HomeInvaded`'s
 *      predicate verbatim.
 *
 * Plus one CONSTRUCTED demonstration: `eval/invariants.ts`'s header says bits 8
 * and 9 are "deliberately DISJOINT", and `tests/ai/hard/invariants.test.ts:161`
 * asserts "never both fire", but the implementation ORs a damaged-enemy limb
 * into bit 9 (`invariants.ts:308-316`), so both fire on a node where the
 * enemy's damage is still visible. The demo takes the `inv8` violating fixture,
 * marks it `upkeepPending` and leaves damage on the chipped body — it does NOT
 * edit the fixture on disk.
 *
 * No engine is constructed here; the evaluator is built on `DEFAULT_WEIGHTS`
 * and the script asserts `version !== 0` (E0's I2 lesson).
 *
 * Usage: `node --import tsx lab/hard-ai/audit/inv-pairs.ts [--out <file>]`
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState } from '../../../src/game/types';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import { F, FEATURE_COUNT, FEATURE_NAMES, INV_BASE } from '../../../src/ai/hard/eval/features';
import { INVARIANT_COUNT, invariantBits, leadCc } from '../../../src/ai/hard/eval/invariants';
import type { Side } from '../../../src/ai/hard/types';
import { Approach } from '../../../src/ai/hard/tables/approach';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { ACTIONS_PER_TURN } from '../../../src/ai/hard/core/state';
import { ADJ_COUNT, ADJ_LIST } from '../../../src/ai/hard/core/tables';
import { DEAD, NO_SLOT } from '../../../src/ai/hard/types';
import { KILL_IMPOSSIBLE } from '../../../src/ai/hard/tables/kill';
import { readPositions, type RulesBlock, type StoredPosition } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS = path.resolve(REPO_ROOT, 'lab/hard-ai/suites/invariants.positions.jsonl');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-e3/inv-audit/pairs.json');

const WHITE: Side = 0;
const BLACK: Side = 1;

if (DEFAULT_WEIGHTS.version === 0) throw new Error('inv-pairs: placeholder weights (version 0)');

const replica = new Replica();
const packScratch = allocState();
const sc = new Scratch(1, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
const evaluator = new Evaluator(replica, DEFAULT_WEIGHTS);
const features = new Int32Array(FEATURE_COUNT);

function applyRules(rules: RulesBlock): void {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
}

/** The stage-0 + stage-1 weighted sum with `DrawPressure` itself removed —
 * DESIGN §5.12.1's "v0 + v1 so far" as closely as this code can name it. */
function partialScoreCc(f: Int32Array, side: Side): number {
  const w = DEFAULT_WEIGHTS.w;
  let s = 0;
  for (let i: number = F.Material; i <= F.ElementCoverage; i++) {
    if (i === F.DrawPressure) continue;
    s += w[i] * f[i];
  }
  return side === WHITE ? s : -s;
}

/**
 * Invariant features whose predicate is a subset of, or identical to, a
 * non-invariant feature's. Lane 1 owns the feature side of the overlap; this
 * list names the NON-invariant partner each invariant is priced on top of, so
 * the two readings can be compared. Each entry is checked by printing both
 * weighted contributions on the pair's violating member.
 */
const OVERLAP: ReadonlyArray<{ inv: number; own: number; partners: number[] }> = [
  { inv: 1, own: F.Inv1SpawnZero, partners: [F.SpawnZero, F.SpawnArea] },
  { inv: 2, own: F.Inv2CornerSeal, partners: [F.CornerSeal] },
  { inv: 3, own: F.Inv3RetreatSquare, partners: [F.ApproachRetreat] },
  { inv: 4, own: F.Inv4StrandUnpunished, partners: [F.ApproachStrand, F.StrandPunish] },
  { inv: 5, own: F.Inv5PoorMinerSquare, partners: [F.PstMine, F.DepletionWaste] },
  { inv: 6, own: F.Inv6FragileAnchor, partners: [F.BlockingDeficit, F.AnchorDepth, F.AnchorFragility] },
  { inv: 7, own: F.Inv7PromoteNoRunway, partners: [F.Insolvency, F.RunwayCliff] },
  { inv: 8, own: F.Inv8NoPreAdjacency, partners: [F.KillAvailable] },
  { inv: 10, own: F.Inv10HomeReachable, partners: [F.HomeInvaded, F.HomeThreat, F.HomeCountdown, F.HomeRescuers] },
  { inv: 11, own: F.Inv11HomeBare, partners: [F.HomePlug, F.CornerSeal] },
  { inv: 12, own: F.Inv12CleaveLine, partners: [F.CleaveExposure] },
  { inv: 13, own: F.Inv13Turtle, partners: [F.AnchorDepth, F.Infiltration] },
  { inv: 14, own: F.Inv14LiquidityFloor, partners: [F.BankLiquid] },
  { inv: 16, own: F.Inv16ClockDiscipline, partners: [F.DrawPressure] },
  { inv: 19, own: F.Inv19SoftMinerExposed, partners: [F.Exposure, F.HangingBuy] },
  { inv: 20, own: F.Inv20StrandNoRetreat, partners: [F.Exposure, F.Hanging] },
];

interface Reading {
  id: string;
  bitsWhite: number;
  bitsBlack: number;
  setWhite: number[];
  setBlack: number[];
  features: number[];
  fullCc: number;
  leadCcWhite: number;
  partialCcWhite: number;
  clock: number;
  drawPressure: number;
  homeInvaded: number;
  homeThreat: number;
  homeCountdown: number;
  inv10: number;
  /** White units the approach table classes RETREAT with cost >= 4 — invariant
   * 3's population — carrying DESIGN §5.13 row 3's unused `retreats` count. */
  retreatUnits: Array<{ slot: number; square: string; cost: number; retreats: number }>;
  /** White units classed STRAND — invariant 4's population — and whether an
   * enemy ALREADY adjacent to them is killable, the only escape the code has. */
  strandUnits: Array<{ slot: number; square: string; adjacentEnemyKillable: boolean }>;
}

/** `invariantBits` for both sides plus the feature vector, on one stored state. */
function read(id: string, state: GameState, rules: RulesBlock): Reading {
  applyRules(rules);
  const p = replica.pack(state, packScratch);
  evaluator.invalidate();
  const fullCc = evaluator.full(p, WHITE, sc, 0, features);
  const t = evaluator.lastTables;
  const bitsWhite = invariantBits(p, t, WHITE, sc, 0);
  const bitsBlack = invariantBits(p, t, BLACK, sc, 0);
  const cat = activeCatalog();
  const retreatUnits: Array<{ slot: number; square: string; cost: number; retreats: number }> = [];
  const strandUnits: Array<{ slot: number; square: string; adjacentEnemyKillable: boolean }> = [];
  for (let slot = 0; slot < p.slotCount; slot++) {
    const sq = p.sq[slot];
    if (sq === DEAD || p.owner[slot] !== WHITE) continue;
    const cls = t.approach[slot];
    if (cls === Approach.RETREAT && cat.cost[p.defId[slot]] >= 4) {
      retreatUnits.push({ slot, square: squareName(sq), cost: cat.cost[p.defId[slot]], retreats: t.retreats[slot] });
    }
    if (cls === Approach.STRAND) {
      // `eval/invariants.ts adjacentAttackerKillable` (97-110), inlined.
      let killable = false;
      const base = sq * 4;
      for (let i = 0; i < ADJ_COUNT[sq]; i++) {
        const q = ADJ_LIST[base + i];
        const a = p.pieceAt[q];
        if (a === NO_SLOT || p.owner[a] === WHITE) continue;
        const e = t.killNow[WHITE].entry[a];
        if (e.minActions < KILL_IMPOSSIBLE && e.minActions <= ACTIONS_PER_TURN) killable = true;
      }
      strandUnits.push({ slot, square: squareName(sq), adjacentEnemyKillable: killable });
    }
  }
  return {
    retreatUnits,
    strandUnits,
    id,
    bitsWhite,
    bitsBlack,
    setWhite: listBits(bitsWhite),
    setBlack: listBits(bitsBlack),
    features: [...features],
    fullCc,
    leadCcWhite: leadCc(p, WHITE),
    partialCcWhite: partialScoreCc(features, WHITE),
    clock: p.drawRuleOn === 1 ? p.clock : 0,
    drawPressure: features[F.DrawPressure],
    homeInvaded: features[F.HomeInvaded],
    homeThreat: features[F.HomeThreat],
    homeCountdown: features[F.HomeCountdown],
    inv10: features[F.Inv10HomeReachable],
  };
}

/** `(x,y)` of a packed square, the coordinates the fixtures are written in. */
function squareName(sq: number): string {
  return `(${sq % 10},${(sq / 10) | 0})`;
}

function listBits(mask: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= INVARIANT_COUNT; i++) if ((mask & (1 << (i - 1))) !== 0) out.push(i);
  return out;
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function padStart(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function outPath(argv: readonly string[]): string {
  const i = argv.indexOf('--out');
  return i >= 0 && i + 1 < argv.length ? path.resolve(argv[i + 1]) : DEFAULT_OUT;
}

/** The `inv8` violating fixture with the chipped black body still damaged at an
 * `upkeepPending` node — the case `invariants.ts`'s header calls impossible. */
function chipDemo(base: StoredPosition): { both: boolean; bits: number[]; note: string } | null {
  const chipped = base.state.board.units.find(u => u.owner === 'black');
  if (chipped === undefined) return null;
  const state: GameState = {
    ...base.state,
    upkeepPending: true,
    board: {
      ...base.state.board,
      units: base.state.board.units.map(u => (u.id === chipped.id ? { ...u, damageTaken: 1 } : u)),
    },
  };
  const r = read(`${base.id}+damaged+upkeepPending`, state, base.rules);
  return {
    both: r.setWhite.includes(8) && r.setWhite.includes(9),
    bits: r.setWhite,
    note: `black ${chipped.definitionId} at (${chipped.position.x},${chipped.position.y}) carries damageTaken 1`,
  };
}

function main(): void {
  const positions = readPositions(POSITIONS);
  const byId = new Map(positions.map(p => [p.id, p]));

  const rows: Record<string, unknown>[] = [];
  const readings: Reading[] = [];
  for (let inv = 1; inv <= INVARIANT_COUNT; inv++) {
    const stem = positions.find(p => p.tags?.includes(`inv${inv}`) && p.id.endsWith('-violating'));
    if (stem === undefined) throw new Error(`inv-pairs: no violating position tagged inv${inv}`);
    const correctId = `${stem.id.slice(0, -'-violating'.length)}-correct`;
    const correct = byId.get(correctId);
    if (correct === undefined) throw new Error(`inv-pairs: no ${correctId}`);

    const v = read(stem.id, stem.state, stem.rules);
    const c = read(correct.id, correct.state, correct.rules);
    readings.push(v, c);

    const own = 1 << (inv - 1);
    const onViolating = (v.bitsWhite & own) !== 0;
    const onCorrect = (c.bitsWhite & own) !== 0;
    // DESIGN §5.13's gate: exactly its own bit on the violating member, none on
    // the correct one. Invariants 15 and 18 have no weight and no bit at all.
    const structural = inv === 15 || inv === 18;
    const expected = structural ? 'both 0 (structural)' : 'violating 1, correct 0';
    const extraViolating = v.setWhite.filter(i => i !== inv);
    const verdict = structural
      ? !onViolating && !onCorrect && v.setWhite.length === 0 && c.setWhite.length === 0
        ? 'as-authored'
        : 'unexpected-bits'
      : onViolating && !onCorrect && extraViolating.length === 0 && c.setWhite.length === 0
        ? 'flips-clean'
        : onViolating && !onCorrect
          ? 'flips-with-extra-bits'
          : 'no-flip';
    rows.push({
      invariant: inv,
      id: stem.id.slice(0, -'-violating'.length),
      expected,
      bitOnViolating: onViolating ? 1 : 0,
      bitOnCorrect: onCorrect ? 1 : 0,
      allBitsViolating: v.setWhite,
      allBitsCorrect: c.setWhite,
      blackBitsViolating: v.setBlack,
      blackBitsCorrect: c.setBlack,
      verdict,
      // The feature is the DIFFERENCE bit(white) - bit(black), so an invariant
      // both sides violate on the same position contributes nothing.
      featureViolating: v.features[INV_BASE + inv - 1],
      featureCorrect: c.features[INV_BASE + inv - 1],
      ownCcViolating: DEFAULT_WEIGHTS.w[INV_BASE + inv - 1] * v.features[INV_BASE + inv - 1],
      ownCcCorrect: DEFAULT_WEIGHTS.w[INV_BASE + inv - 1] * c.features[INV_BASE + inv - 1],
      ownShareOfGapCc:
        DEFAULT_WEIGHTS.w[INV_BASE + inv - 1] * (c.features[INV_BASE + inv - 1] - v.features[INV_BASE + inv - 1]),
      fullCcViolating: v.fullCc,
      fullCcCorrect: c.fullCc,
      evalGapCc: c.fullCc - v.fullCc,
    });
  }

  // --- 2. which invariants ever fire for the side that has not just moved ---
  const firedWhite = new Set<number>();
  const firedBlack = new Set<number>();
  for (const r of readings) {
    for (const i of r.setWhite) firedWhite.add(i);
    for (const i of r.setBlack) firedBlack.add(i);
  }

  // --- 3. DrawPressure's sign proxy -----------------------------------------
  const signRows = readings.map(r => ({
    id: r.id,
    leadCc: r.leadCcWhite,
    partialCc: r.partialCcWhite,
    signLead: sign(r.leadCcWhite),
    signPartial: sign(r.partialCcWhite),
    agree: sign(r.leadCcWhite) === sign(r.partialCcWhite),
    clock: r.clock,
    drawPressure: r.drawPressure,
    drawPressureCc: DEFAULT_WEIGHTS.w[F.DrawPressure] * r.drawPressure,
  }));
  const disagreements = signRows.filter(r => !r.agree);

  // --- 4. home overlap ------------------------------------------------------
  const w = DEFAULT_WEIGHTS.w;
  const homeRows = readings
    .filter(r => r.homeInvaded !== 0 || r.homeThreat !== 0 || r.inv10 !== 0 || r.homeCountdown !== 0)
    .map(r => ({
      id: r.id,
      homeInvaded: r.homeInvaded,
      homeThreat: r.homeThreat,
      homeCountdown: r.homeCountdown,
      inv10: r.inv10,
      homeInvadedCc: w[F.HomeInvaded] * r.homeInvaded,
      homeThreatCc: w[F.HomeThreat] * r.homeThreat,
      homeCountdownCc: w[F.HomeCountdown] * r.homeCountdown,
      inv10Cc: w[F.Inv10HomeReachable] * r.inv10,
    }));

  // --- 5. invariant vs non-invariant pricing of the same fact --------------
  const violatingById = new Map(readings.filter(r => r.id.endsWith('-violating')).map(r => [r.id, r]));
  const overlapRows = OVERLAP.map(o => {
    const stem = positions.find(p => p.tags?.includes(`inv${o.inv}`) && p.id.endsWith('-violating'));
    const r = stem === undefined ? undefined : violatingById.get(stem.id);
    if (r === undefined) throw new Error(`inv-pairs: no violating reading for inv${o.inv}`);
    return {
      invariant: o.inv,
      id: r.id,
      invariantCc: w[o.own] * r.features[o.own],
      partners: o.partners.map(f => ({ feature: FEATURE_NAMES[f], value: r.features[f], cc: w[f] * r.features[f] })),
    };
  });
  console.log('\n# the same fact priced twice (violating member of each pair)\n');
  for (const o of overlapRows) {
    const parts = o.partners.map(pt => `${pt.feature} ${pt.cc} cc`).join('  ');
    console.log(`  inv${padStart(String(o.invariant), 2)} ${pad(o.id, 36)} invariant ${padStart(String(o.invariantCc), 6)} cc | ${parts}`);
  }

  // --- 6. are invariants 3 and 4's qualifiers ever the reason? -------------
  const retreatAll = readings.flatMap(r => r.retreatUnits.map(u => ({ id: r.id, ...u })));
  const retreatZero = retreatAll.filter(u => u.retreats === 0);
  const strandAll = readings.flatMap(r => r.strandUnits.map(u => ({ id: r.id, ...u })));
  const strandSaved = strandAll.filter(u => u.adjacentEnemyKillable);
  console.log(
    `\ninvariant 3 population: ${retreatAll.length} white RETREAT units of cost >= 4 over ${readings.length} positions; ` +
      `${retreatZero.length} have retreats === 0, which DESIGN 5.13 row 3 requires to be > 0`,
  );
  console.log(
    `invariant 4 population: ${strandAll.length} white STRAND units; ${strandSaved.length} sit next to an enemy the side can kill ` +
      `(the only way invariants.ts:284-286 suppresses the bit)`,
  );

  const demoBase = byId.get('inv8-no-pre-adjacency-violating');
  const demo = demoBase === undefined ? null : chipDemo(demoBase);

  // --- report ---------------------------------------------------------------
  console.log('# invariant pairs (white = the side whose turn just ended)\n');
  console.log(
    `${pad('inv', 4)}${pad('case', 26)}${padStart('viol', 5)}${padStart('corr', 5)}  ${pad('expected', 24)}${pad('verdict', 22)}${padStart('gap cc', 8)}${padStart('own cc', 9)}  extra bits on violating`,
  );
  for (const r of rows as Array<Record<string, never> & { [k: string]: unknown }>) {
    const extra = (r.allBitsViolating as number[]).filter(i => i !== r.invariant);
    console.log(
      `${pad(String(r.invariant), 4)}${pad(String(r.id), 26)}${padStart(String(r.bitOnViolating), 5)}${padStart(String(r.bitOnCorrect), 5)}  ${pad(String(r.expected), 24)}${pad(String(r.verdict), 22)}${padStart(String(r.evalGapCc), 8)}${padStart(String(r.ownShareOfGapCc), 9)}  ${extra.length === 0 ? '-' : extra.join(',')}`,
    );
  }
  console.log(
    `\nwhite bits seen anywhere: ${[...firedWhite].sort((a, b) => a - b).join(',') || 'none'}` +
      `\nblack bits seen anywhere: ${[...firedBlack].sort((a, b) => a - b).join(',') || 'none'}`,
  );
  console.log(
    `\nDrawPressure sign proxy: ${disagreements.length}/${signRows.length} positions where sign(leadCc) != sign(v0+v1 without DrawPressure)`,
  );
  for (const d of disagreements) {
    console.log(`  ${pad(d.id, 36)} leadCc ${padStart(String(d.leadCc), 7)}  partial ${padStart(String(d.partialCc), 8)}`);
  }
  console.log(`\nhome-family features non-zero on ${homeRows.length}/${readings.length} positions`);
  for (const h of homeRows) {
    console.log(
      `  ${pad(h.id, 36)} HomeInvaded ${padStart(String(h.homeInvadedCc), 6)} cc  HomeThreat ${padStart(String(h.homeThreatCc), 6)} cc  HomeCountdown ${padStart(String(h.homeCountdownCc), 6)} cc  Inv10 ${padStart(String(h.inv10Cc), 6)} cc`,
    );
  }
  if (demo !== null) {
    console.log(`\nbits 8 and 9 both set on the constructed chip node: ${demo.both} (bits ${demo.bits.join(',')}) — ${demo.note}`);
  }

  const out = outPath(process.argv.slice(2));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `${JSON.stringify(
      {
        schema: 'muju-inv-audit-v1',
        generatedAt: new Date().toISOString(),
        positions: path.relative(REPO_ROOT, POSITIONS),
        weights: { label: DEFAULT_WEIGHTS.label, version: DEFAULT_WEIGHTS.version },
        side: 'white',
        pairs: rows,
        firedWhite: [...firedWhite].sort((a, b) => a - b),
        firedBlack: [...firedBlack].sort((a, b) => a - b),
        drawPressure: { rows: signRows, disagreements: disagreements.length },
        homeOverlap: homeRows,
        featurePricing: overlapRows,
        readings,
        approachAudit: { retreatUnits: retreatAll, retreatsZero: retreatZero, strandUnits: strandAll },
        chipDemo: demo,
      },
      null,
      1,
    )}\n`,
  );
  console.log(`\nwrote ${path.relative(REPO_ROOT, out)}`);
}

main();
