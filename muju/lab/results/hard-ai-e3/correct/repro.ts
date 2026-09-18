/**
 * `node --import tsx lab/results/hard-ai-e3/correct/repro.ts [--out <dir>]`
 *
 * The reproduction record of the E3.2 correctness arm: each of B1–B5
 * (`docs/hard-ai/e3/E3.1-SYNTHESIS.md` §5) on its canonical case, measured with
 * its `HardConfig.evalFix` flag OFF and ON, plus the corpus-wide frequency each
 * bug fires at. Writes `repro.json` next to this file; the numbers in
 * `docs/hard-ai/e3/E3.2-CORRECTNESS-ARM.md` are read off that artifact.
 *
 * WHY IT LIVES UNDER `lab/results`. Lane 12's owned paths are the five
 * `src/ai/hard` files, `lab/hard-ai/oracles/economy.ts`,
 * `lab/hard-ai/ablate/arms.ts`, the tests, the doc and
 * `lab/results/hard-ai-e3/correct/**`; a new instrument under
 * `lab/hard-ai/audit/` would be a file the lane does not own. It is proposed
 * for `lab/hard-ai/audit/correct-repro.ts` in
 * `docs/hard-ai/e3/amendments/lane12.md`. One consequence to know about: the
 * `lab/hard-ai/tsconfig.json` include list does not cover `lab/results`, so
 * `npm run hard:types` does NOT typecheck this file — the assertions that must
 * hold live in `tests/ai/hard/eval-correct.test.ts`, which is typechecked and
 * run; this script is the measurement that produces the artifact.
 *
 * NO ENGINE IS CONSTRUCTED HERE. Every number is a STATIC evaluation
 * (`Evaluator.full`) or a table call, so E0's I2 lesson applies as the
 * `DEFAULT_WEIGHTS.version !== 0` assertion below rather than through
 * `hardEnginePatch`; nothing here searches, and nothing here takes a heavy slot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GameState, PlayerId, Unit } from '../../../../src/game/types';
import { Replica } from '../../../../src/ai/hard/core/state';
import { Scratch } from '../../../../src/ai/hard/core/bits';
import { Evaluator } from '../../../../src/ai/hard/eval/evaluate';
import { DEFAULT_WEIGHTS } from '../../../../src/ai/hard/eval/weights';
import { F, FEATURE_COUNT, FEATURE_NAMES } from '../../../../src/ai/hard/eval/features';
import { invariantBits } from '../../../../src/ai/hard/eval/invariants';
import { allocTables, buildTables } from '../../../../src/ai/hard/tables/context';
import { activeCatalog, DEF_ID, DEF_INDEX } from '../../../../src/ai/hard/core/catalog';
import type { EvalFix } from '../../../../src/ai/hard/config';
import type { Side } from '../../../../src/ai/hard/types';
import { mirror180, readPositions } from '../../../hard-ai/positions/corpus';
import { CASES_DIR, installExamRules, loadCaseState, loadStratum, restoreShippedRules } from '../../../hard-ai/exam/format';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const POSITIONS = path.join(REPO_ROOT, 'lab/hard-ai/positions');
const DEFAULT_OUT = path.resolve(import.meta.dirname, 'repro.json');

/** `invariantBits` packs invariant `i` at bit `i - 1` (`invariants.ts bit()`). */
const INV3_BIT = 1 << 2;

const FIX: Record<string, EvalFix> = {
  b1: { relocationCompare: true },
  b2: { rot180TieOrder: true },
  b3: { infiltrationPerAnchor: true },
  b4: { inv3RetreatConjunct: true },
  b5: { rentOnce: true },
  all: {
    relocationCompare: true,
    rot180TieOrder: true,
    infiltrationPerAnchor: true,
    inv3RetreatConjunct: true,
    rentOnce: true,
  },
};

const rep = new Replica();
const sc = new Scratch(4, 8, 8, 8);
const evaluators = new Map<string, Evaluator>();

function ev(key: 'off' | keyof typeof FIX): Evaluator {
  const got = evaluators.get(key);
  if (got !== undefined) return got;
  const made = new Evaluator(rep, DEFAULT_WEIGHTS, key === 'off' ? null : FIX[key]);
  evaluators.set(key, made);
  return made;
}

interface Snapshot {
  score: number;
  f: number[];
  stream: number;
  income: number[];
  upkeep: number[];
  turnsToInsolvency: number;
  relocationDebt: number;
  waste: number;
}

function snap(e: Evaluator, state: GameState, side?: Side): Snapshot {
  const p = rep.pack(state);
  const root = side ?? ((state.turn.currentPlayer === 'white' ? 0 : 1) as Side);
  const f = new Int32Array(FEATURE_COUNT);
  const score = e.full(p, root, sc, 0, f);
  const econ = e.lastTables.econ[root];
  return {
    score,
    f: [...f],
    stream: econ.stream,
    income: [...econ.income],
    upkeep: [...econ.upkeep],
    turnsToInsolvency: econ.turnsToInsolvency,
    relocationDebt: econ.relocationDebt,
    waste: econ.waste,
  };
}

interface FeatureDelta {
  name: string;
  df: number;
  ccDelta: number;
}

function featureDeltas(a: Snapshot, b: Snapshot): FeatureDelta[] {
  const out: FeatureDelta[] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const df = b.f[i] - a.f[i];
    if (df === 0) continue;
    out.push({ name: FEATURE_NAMES[i], df, ccDelta: DEFAULT_WEIGHTS.w[i] * df });
  }
  return out;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      cells: state.board.cells.map(row => row.map(c => ({ ...c }))),
      units: state.board.units.map(u => ({ ...u })),
    },
    players: { white: { ...state.players.white }, black: { ...state.players.black } },
  };
}

function withDefinition(state: GameState, unitId: string, defId: string): GameState {
  const next = cloneState(state);
  next.board.units = next.board.units.map(u => (u.id === unitId ? { ...u, definitionId: defId } : u));
  return next;
}

function withReserve(state: GameState, x: number, y: number, delta: number): GameState {
  const next = cloneState(state);
  const cell = next.board.cells[y][x];
  next.board.cells[y][x] = { ...cell, resourceLayers: cell.resourceLayers + delta };
  return next;
}

/** The first own unit whose next tier costs exactly +1 crystal of upkeep at an
 * unchanged mining rate — lane 3's isolation of "one crystal per turn of rent". */
function upkeepSwapTarget(state: GameState, player: PlayerId): { unit: Unit; to: string } | null {
  const cat = activeCatalog();
  for (const u of state.board.units) {
    if (u.owner !== player) continue;
    const def = DEF_INDEX.get(u.definitionId);
    if (def === undefined) continue;
    const next = cat.nextDef[def];
    if (next < 0) continue;
    if (cat.upkeep[next] - cat.upkeep[def] !== 1) continue;
    if (cat.mine[next] !== cat.mine[def]) continue;
    return { unit: u, to: DEF_ID[next] };
  }
  return null;
}

function fuzz(): ReturnType<typeof readPositions> {
  return readPositions(path.join(POSITIONS, 'fuzz-1000.jsonl'));
}

// --- B3: Infiltration ---------------------------------------------------------

function b3Record(): unknown {
  const all = fuzz();
  const id = 'fuzz-5150-4-377';
  const sp = all.find(s => s.id === id);
  if (sp === undefined) throw new Error(`repro: ${id} not found`);
  const rows: unknown[] = [];
  for (const side of [0, 1] as Side[]) {
    const mirrorSide = (1 - side) as Side;
    rows.push({
      side,
      off: snap(ev('off'), sp.state, side).f[F.Infiltration],
      on: snap(ev('b3'), sp.state, side).f[F.Infiltration],
      mirrorOff: snap(ev('off'), mirror180(sp.state), mirrorSide).f[F.Infiltration],
      mirrorOn: snap(ev('b3'), mirror180(sp.state), mirrorSide).f[F.Infiltration],
      scoreOff: snap(ev('off'), sp.state, side).score,
      scoreOn: snap(ev('b3'), sp.state, side).score,
    });
  }

  let nonZeroOff = 0;
  let nonZeroOn = 0;
  let checked = 0;
  const cc: number[] = [];
  for (const item of all) {
    let p;
    try {
      p = rep.pack(item.state);
    } catch {
      continue;
    }
    checked++;
    const fOff = new Int32Array(FEATURE_COUNT);
    ev('off').full(p, 0, sc, 0, fOff);
    const fOn = new Int32Array(FEATURE_COUNT);
    ev('b3').full(p, 0, sc, 0, fOn);
    if (fOff[F.Infiltration] !== 0) nonZeroOff++;
    if (fOn[F.Infiltration] !== 0) {
      nonZeroOn++;
      cc.push(Math.abs(fOn[F.Infiltration]) * DEFAULT_WEIGHTS.w[F.Infiltration]);
    }
  }
  cc.sort((a, b) => a - b);
  return {
    canonicalCase: id,
    rows,
    fuzz1000: {
      checked,
      nonZeroOff,
      nonZeroOn,
      medianCcWhenNonZero: cc.length === 0 ? 0 : cc[Math.floor(cc.length / 2)],
      maxCc: cc.length === 0 ? 0 : cc[cc.length - 1],
    },
  };
}

// --- B4: Inv3RetreatSquare ----------------------------------------------------

function b4Record(): unknown {
  const all = fuzz();
  const ids = ['fuzz-5150-1651-27', 'fuzz-5150-531-27', 'fuzz-5150-1044-37'];
  const tOff = allocTables();
  const tOn = allocTables();
  tOn.evalFix = FIX.b4;
  const rows: unknown[] = [];
  for (const id of ids) {
    const sp = all.find(s => s.id === id);
    if (sp === undefined) throw new Error(`repro: ${id} not found`);
    const p = rep.pack(sp.state);
    buildTables(p, sc, 0, 2, tOff);
    buildTables(p, sc, 0, 2, tOn);
    const bits: unknown[] = [];
    for (const side of [0, 1] as Side[]) {
      bits.push({
        side,
        bitOff: (invariantBits(p, tOff, side, sc, 0) & INV3_BIT) !== 0 ? 1 : 0,
        bitOn: (invariantBits(p, tOn, side, sc, 0) & INV3_BIT) !== 0 ? 1 : 0,
      });
    }
    rows.push({
      id,
      bits,
      featureOff: snap(ev('off'), sp.state, 0).f[F.Inv3RetreatSquare],
      featureOn: snap(ev('b4'), sp.state, 0).f[F.Inv3RetreatSquare],
      scoreOff: snap(ev('off'), sp.state, 0).score,
      scoreOn: snap(ev('b4'), sp.state, 0).score,
    });
  }

  let firedOff = 0;
  let firedOn = 0;
  let sides = 0;
  for (const item of all) {
    let p;
    try {
      p = rep.pack(item.state);
    } catch {
      continue;
    }
    buildTables(p, sc, 0, 2, tOff);
    buildTables(p, sc, 0, 2, tOn);
    for (const side of [0, 1] as Side[]) {
      sides++;
      if ((invariantBits(p, tOff, side, sc, 0) & INV3_BIT) !== 0) firedOff++;
      if ((invariantBits(p, tOn, side, sc, 0) & INV3_BIT) !== 0) firedOn++;
    }
  }
  return { canonicalCases: ids, rows, fuzz1000: { sidePositions: sides, firedOff, firedOn, excluded: firedOff - firedOn } };
}

// --- B2: rot180 ---------------------------------------------------------------

function rot180Scan(key: 'off' | keyof typeof FIX): unknown {
  const all = fuzz();
  const e = ev(key);
  const byFeature = new Map<number, number>();
  let bad = 0;
  let checked = 0;
  let sumAbs = 0;
  let maxAbs = 0;
  for (const item of all) {
    let p;
    let q;
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
    let any = false;
    let delta = 0;
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (fa[i] === fb[i]) continue;
      any = true;
      byFeature.set(i, (byFeature.get(i) ?? 0) + 1);
      delta += DEFAULT_WEIGHTS.w[i] * (fb[i] - fa[i]);
    }
    if (any) {
      bad++;
      sumAbs += Math.abs(delta);
      if (Math.abs(delta) > maxAbs) maxAbs = Math.abs(delta);
    }
  }
  return {
    arm: key,
    checked,
    violations: bad,
    meanAbsScoreDeltaCc: bad === 0 ? 0 : Math.round((sumAbs / bad) * 10) / 10,
    maxAbsScoreDeltaCc: maxAbs,
    byFeature: [...byFeature.entries()].map(([i, n]) => ({ name: FEATURE_NAMES[i], positions: n })),
  };
}

function b2Record(): unknown {
  const all = fuzz();
  const named = ['fuzz-5150-1097-11', 'fuzz-5150-1651-27', 'fuzz-5150-1044-37'];
  const rows: unknown[] = [];
  for (const id of named) {
    const sp = all.find(s => s.id === id);
    if (sp === undefined) throw new Error(`repro: ${id} not found`);
    const row: Record<string, unknown> = { id };
    for (const key of ['off', 'b2'] as const) {
      const a = snap(ev(key), sp.state, 0);
      const b = snap(ev(key), mirror180(sp.state), 1);
      row[key] = {
        econDelta: [a.f[F.EconDelta], b.f[F.EconDelta]],
        depletionWaste: [a.f[F.DepletionWaste], b.f[F.DepletionWaste]],
        relocationDebt: [a.f[F.RelocationDebt], b.f[F.RelocationDebt]],
        score: [a.score, b.score],
      };
    }
    rows.push(row);
  }
  return {
    rows,
    scans: (['off', 'b1', 'b2', 'b3', 'b4', 'b5', 'all'] as const).map(k => rot180Scan(k)),
  };
}

// --- B5 and B1 on the ledger loss root ---------------------------------------

function lossRootRecord(): unknown {
  const cases = loadStratum('dev', CASES_DIR);
  const id = 'loss-g2-s5_0_2-A-white-t4';
  const lossCase = cases.find(c => c.id === id);
  if (lossCase === undefined) throw new Error(`repro: ${id} not found in the dev stratum`);
  installExamRules(lossCase);
  try {
    const state = loadCaseState(lossCase);
    const player = state.turn.currentPlayer;
    const swap = upkeepSwapTarget(state, player);
    if (swap === null) throw new Error('repro: no +1-upkeep promotion at the loss root');
    const promoted = withDefinition(state, swap.unit.id, swap.to);
    const b5 = (key: 'off' | 'b5'): unknown => {
      const a = snap(ev(key), state);
      const b = snap(ev(key), promoted);
      return {
        scoreDelta: b.score - a.score,
        featureDeltas: featureDeltas(a, b),
        rentCharge: featureDeltas(a, b)
          .filter(d => d.name === 'Rent' || d.name === 'EconDelta')
          .reduce((s, d) => s + d.ccDelta, 0),
        base: { stream: a.stream, turnsToInsolvency: a.turnsToInsolvency, income: a.income },
        after: { stream: b.stream, turnsToInsolvency: b.turnsToInsolvency, income: b.income },
      };
    };

    const minerX = 1;
    const minerY = 1;
    const richer = withReserve(state, minerX, minerY, 1);
    const b1 = (key: 'off' | 'b1'): unknown => {
      const a = snap(ev(key), state);
      const b = snap(ev(key), richer);
      return {
        scoreDelta: b.score - a.score,
        featureDeltas: featureDeltas(a, b),
        base: { stream: a.stream, income: a.income, relocationDebt: a.relocationDebt, waste: a.waste },
        after: { stream: b.stream, income: b.income, relocationDebt: b.relocationDebt, waste: b.waste },
      };
    };

    return {
      caseId: id,
      sideToMove: player,
      b5: {
        perturbation: `${swap.unit.definitionId} -> ${swap.to} at (${swap.unit.position.x},${swap.unit.position.y}), +1 crystal per turn of upkeep at an unchanged mining rate`,
        off: b5('off'),
        on: b5('b5'),
      },
      b1: {
        perturbation: `+1 resource layer at (${minerX},${minerY}), under White's water_1`,
        off: b1('off'),
        on: b1('b1'),
      },
    };
  } finally {
    restoreShippedRules();
  }
}

// --- B5: the three balance readings, off vs on --------------------------------

function insolvencyRecord(): unknown {
  const all = fuzz();
  const rows = { changedTurnsToInsolvency: 0, changedInsolvency: 0, changedRunwayCliff: 0, sidePositions: 0 };
  for (const item of all) {
    let p;
    try {
      p = rep.pack(item.state);
    } catch {
      continue;
    }
    for (const side of [0, 1] as Side[]) {
      rows.sidePositions++;
      const fOff = new Int32Array(FEATURE_COUNT);
      ev('off').full(p, side, sc, 0, fOff);
      const ttiOff = ev('off').lastTables.econ[side].turnsToInsolvency;
      const fOn = new Int32Array(FEATURE_COUNT);
      ev('b5').full(p, side, sc, 0, fOn);
      const ttiOn = ev('b5').lastTables.econ[side].turnsToInsolvency;
      if (ttiOff !== ttiOn) rows.changedTurnsToInsolvency++;
      if (fOff[F.Insolvency] !== fOn[F.Insolvency]) rows.changedInsolvency++;
      if (fOff[F.RunwayCliff] !== fOn[F.RunwayCliff]) rows.changedRunwayCliff++;
    }
  }
  return rows;
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = path.resolve(REPO_ROOT, argv[++i]);
    else throw new Error(`repro: unrecognised argument "${argv[i]}"`);
  }
  if (DEFAULT_WEIGHTS.version === 0) {
    throw new Error('repro: DEFAULT_WEIGHTS carries the placeholder version 0 (E0 I2)');
  }

  const record = {
    what: 'E3.2 correctness arm: B1-B5 reproduced on their canonical cases, flag off vs on',
    git: gitRevision(),
    weights: { label: DEFAULT_WEIGHTS.label, version: DEFAULT_WEIGHTS.version },
    b3: b3Record(),
    b4: b4Record(),
    b2: b2Record(),
    lossRoot: lossRootRecord(),
    b5Balance: insolvencyRecord(),
    at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
  console.log(`repro: wrote ${out}`);
}

main();
