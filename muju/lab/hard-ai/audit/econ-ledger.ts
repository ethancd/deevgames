/**
 * `node --import tsx lab/hard-ai/audit/econ-ledger.ts [--out <path>]`
 * — E3.1 lane 3's "one crystal ledger" instrument (E3-PLAN slice E3.1 economy).
 *
 * WHAT IT MEASURES. For two real positions it runs `Evaluator.full` with
 * `outFeatures`, so every number below is the champion evaluator's own output
 * rather than a re-derivation:
 *
 *   - the whole 58-feature vector, its weights, and `w[i] · f[i]` per feature;
 *   - the raw economy inputs the features are built from (`bank`,
 *     `projectedIncome`, `upkeepDue`, `pstSumCc`, `materialCc`, and the
 *     level-2 `EconResult` of both sides);
 *   - a set of MARGINAL perturbations — one bank crystal, one resource layer
 *     under a miner, one crystal/turn of upkeep — each re-evaluated from a
 *     freshly packed state, reported as a score delta and a per-feature delta.
 *
 * It also prints the two pure discount coefficients the ledger's hand
 * arithmetic uses, computed from `GAMMA_Q16` itself rather than typed in:
 * `pstCoeff[t]` (what one crystal mined on own-turn `t` is worth to
 * `PST_MINE`) and `streamCoeff[t]` (what it is worth to `EconResult.stream`).
 *
 * WEIGHTS. This script constructs no engine; it evaluates with
 * `DEFAULT_WEIGHTS`, which is what the ladder's `hardEnginePatch` substitutes
 * for the champion (`lab/hard-ai/bots/hard.ts`), and asserts
 * `version !== 0` so E0's I2 placeholder-weights trap cannot bite here.
 *
 * NO STATE IS REPAIRED. Perturbations build a NEW `GameState` from the stored
 * one; the fixtures on disk are never rewritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId, Unit } from '../../../src/game/types';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import { FEATURE_COUNT, FEATURE_NAMES, STAGE_OF } from '../../../src/ai/hard/eval/features';
import { DEF_ID, DEF_INDEX, activeCatalog } from '../../../src/ai/hard/core/catalog';
import {
  GAMMA_Q16,
  PST_HORIZON,
  RENT_PV,
  projectedIncome,
  pstMine,
  upkeepDue,
} from '../../../src/ai/hard/core/income';
import { ECON_HORIZON } from '../../../src/ai/hard/tables/economy';
import { CC, type PackedState, type Side } from '../../../src/ai/hard/types';
import { readPositions, type RulesBlock } from '../positions/corpus';
import { CASES_DIR, installExamRules, loadCaseState, loadStratum, restoreShippedRules } from '../exam/format';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-e3/econ-audit/ledger.json');

/** The economy fixture this ledger works: one Muju on a 16-cell, bank 7. */
const ECON_POSITION_ID = 'promote-plant_1-16-0';
/** The loss root this ledger works: `demand: recurring-upkeep`, White to move on turn 4. */
const LOSS_CASE_ID = 'loss-g2-s5_0_2-A-white-t4';

const SIDE_PLAYER: readonly PlayerId[] = ['white', 'black'];

interface FeatureRow {
  index: number;
  name: string;
  stage: number;
  f: number;
  w: number;
  cc: number;
}

interface EconBlock {
  bank: number;
  projectedIncome: number;
  upkeepDue: number;
  pstSumCc: number;
  materialCc: number;
  stream: number;
  income: number[];
  upkeep: number[];
  turnsToInsolvency: number;
  relocationDebt: number;
  waste: number;
}

interface Snapshot {
  score: number;
  features: number[];
  rows: FeatureRow[];
  econ: { me: EconBlock; them: EconBlock };
}

interface Perturbation {
  id: string;
  what: string;
  /** The sign of the change actually applied (+1 added, −1 removed). */
  delta: number;
  scoreDelta: number;
  /** `scoreDelta / delta` — cc the evaluator pays for ONE more of the thing. */
  ccPerUnit: number;
  featureDeltas: Array<{ name: string; df: number; w: number; ccDelta: number }>;
  /** The perturbed position's own economy block, so a stream change that came
   * from the DP re-planning a relocation is visible rather than inferred. */
  econAfter: { me: EconBlock; them: EconBlock };
}

interface SweepPoint {
  x: number;
  score: number;
  stepCc: number;
}

interface Sweep {
  id: string;
  what: string;
  points: SweepPoint[];
}

interface LedgerEntry {
  id: string;
  file: string;
  sideToMove: PlayerId;
  root: Side;
  turnNumber: number | null;
  phase: string;
  base: Snapshot;
  perturbations: Perturbation[];
}

function nonzeroRows(features: Int32Array): FeatureRow[] {
  const rows: FeatureRow[] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const f = features[i];
    const w = DEFAULT_WEIGHTS.w[i];
    if (f === 0) continue;
    rows.push({ index: i, name: FEATURE_NAMES[i], stage: STAGE_OF[i], f, w, cc: w * f });
  }
  return rows;
}

function econBlock(p: PackedState, side: Side, ev: Evaluator): EconBlock {
  const e = ev.lastTables.econ[side];
  return {
    bank: p.bank[side],
    projectedIncome: projectedIncome(p, side),
    upkeepDue: upkeepDue(p, side),
    pstSumCc: p.pstSumCc[side],
    materialCc: p.materialCc[side],
    stream: e.stream,
    income: [...e.income],
    upkeep: [...e.upkeep],
    turnsToInsolvency: e.turnsToInsolvency,
    relocationDebt: e.relocationDebt,
    waste: e.waste,
  };
}

function evaluate(state: GameState, replica: Replica, ev: Evaluator, sc: Scratch): Snapshot {
  const p = replica.pack(state);
  const root: Side = state.turn.currentPlayer === 'white' ? 0 : 1;
  const out = new Int32Array(FEATURE_COUNT);
  const score = ev.full(p, root, sc, 0, out);
  return {
    score,
    features: [...out],
    rows: nonzeroRows(out),
    econ: {
      me: econBlock(p, root, ev),
      them: econBlock(p, (1 - root) as Side, ev),
    },
  };
}

function diff(base: Snapshot, after: Snapshot, id: string, what: string, delta = 1): Perturbation {
  const featureDeltas: Perturbation['featureDeltas'] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const df = after.features[i] - base.features[i];
    if (df === 0) continue;
    featureDeltas.push({ name: FEATURE_NAMES[i], df, w: DEFAULT_WEIGHTS.w[i], ccDelta: DEFAULT_WEIGHTS.w[i] * df });
  }
  const scoreDelta = after.score - base.score;
  return { id, what, delta, scoreDelta, ccPerUnit: scoreDelta / delta, featureDeltas, econAfter: after.econ };
}

/** A deep-enough copy: `cells` rows and `units` entries are replaced, never mutated in place. */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      cells: state.board.cells.map(row => row.map(c => ({ ...c }))),
      units: state.board.units.map(u => ({ ...u })),
    },
    players: {
      white: { ...state.players.white },
      black: { ...state.players.black },
    },
  };
}

function withBank(state: GameState, player: PlayerId, delta: number): GameState {
  const next = cloneState(state);
  next.players[player] = { ...next.players[player], resources: next.players[player].resources + delta };
  return next;
}

function withReserve(state: GameState, x: number, y: number, delta: number): GameState {
  const next = cloneState(state);
  const cell = next.board.cells[y][x];
  next.board.cells[y][x] = { ...cell, resourceLayers: cell.resourceLayers + delta };
  return next;
}

/** Swaps one unit's definition (used to add exactly one crystal/turn of upkeep). */
function withDefinition(state: GameState, unitId: string, defId: string): GameState {
  const next = cloneState(state);
  next.board.units = next.board.units.map(u => (u.id === unitId ? { ...u, definitionId: defId } : u));
  return next;
}

/** The first living miner of `player`, in board order. */
function firstMiner(state: GameState, player: PlayerId): Unit | null {
  const cat = activeCatalog();
  for (const u of state.board.units) {
    if (u.owner !== player) continue;
    const def = DEF_INDEX.get(u.definitionId);
    if (def === undefined) continue;
    if (cat.mine[def] > 0) return u;
  }
  return null;
}

/**
 * The first living unit of `player` whose tier-2 form costs exactly one more
 * crystal of upkeep per turn and mines at the same rate, so the swap moves
 * `Rent` (and `EconDelta`'s upkeep leg) and leaves the income leg alone.
 */
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

function discountCoefficients(): { pstCoeffCc: number[]; streamCoeffCc: number[]; rentPvCheckCc: number } {
  const pstCoeffCc: number[] = [];
  const streamCoeffCc: number[] = [];
  for (let t = 1; t <= PST_HORIZON; t++) pstCoeffCc.push((GAMMA_Q16[t] * CC) / 65536);
  for (let t = 1; t <= ECON_HORIZON; t++) streamCoeffCc.push((GAMMA_Q16[t + 1] * CC) / 65536);
  let rent = 0;
  for (let t = 1; t <= ECON_HORIZON; t++) rent += (GAMMA_Q16[t] * CC) / 65536;
  return { pstCoeffCc, streamCoeffCc, rentPvCheckCc: rent };
}

/** Removes one unit and refunds its catalogue cost to the bank. */
function withoutUnit(state: GameState, unitId: string, refund: number, player: PlayerId): GameState {
  const next = cloneState(state);
  next.board.units = next.board.units.filter(u => u.id !== unitId);
  next.players[player] = { ...next.players[player], resources: next.players[player].resources + refund };
  return next;
}

function ledgerFor(
  id: string,
  file: string,
  state: GameState,
  turnNumber: number | null,
  replica: Replica,
  ev: Evaluator,
  sc: Scratch,
): LedgerEntry {
  const player = state.turn.currentPlayer;
  const root: Side = player === 'white' ? 0 : 1;
  const base = evaluate(state, replica, ev, sc);
  const perturbations: Perturbation[] = [];

  perturbations.push(
    diff(base, evaluate(withBank(state, player, 1), replica, ev, sc), 'bank+1', `${player} bank +1 crystal`),
  );

  const miner = firstMiner(state, player);
  if (miner !== null) {
    const { x, y } = miner.position;
    const cell = state.board.cells[y][x];
    const cat = activeCatalog();
    const def = DEF_INDEX.get(miner.definitionId) as number;
    // `MAX_RESOURCE_RESERVE` is 16, so a full cell is perturbed DOWNWARDS and
    // the per-crystal number is the negated delta (`ccPerUnit`).
    const step = cell.resourceLayers >= 16 ? -1 : 1;
    const to = cell.resourceLayers + step;
    perturbations.push(
      diff(
        base,
        evaluate(withReserve(state, x, y, step), replica, ev, sc),
        step > 0 ? 'reserve+1' : 'reserve-1',
        `one resource layer ${step > 0 ? 'added' : 'removed'} under ${miner.definitionId} at (${x},${y}); reserve ${cell.resourceLayers} → ${to}, mine ${cat.mine[def]}/turn, PST_MINE ${pstMine(def, cell.resourceLayers)} → ${pstMine(def, to)} cc`,
        step,
      ),
    );
  }

  const swap = upkeepSwapTarget(state, player);
  if (swap !== null) {
    perturbations.push(
      diff(
        base,
        evaluate(withDefinition(state, swap.unit.id, swap.to), replica, ev, sc),
        'upkeep+1',
        `${swap.unit.definitionId} → ${swap.to} (upkeep +1/turn at the same mining rate; Material and the tier features move too and are listed)`,
      ),
    );
  }

  // The two whole-decision perturbations SU §1.7 and §1.6 name, run only on
  // the single-unit economy fixture where nothing else can move the score.
  if (id === ECON_POSITION_ID && miner !== null) {
    const cat = activeCatalog();
    const def = DEF_INDEX.get(miner.definitionId) as number;
    const next = cat.nextDef[def];
    if (next >= 0) {
      const promoted = withBank(withDefinition(state, miner.id, DEF_ID[next]), player, -cat.promoCost[def]);
      perturbations.push(
        diff(
          base,
          evaluate(promoted, replica, ev, sc),
          'promote-t1-t2',
          `SU §1.7's plant line, first step: ${miner.definitionId} → ${DEF_ID[next]} on the same cell, ${cat.promoCost[def]} crystals paid from the bank (mine ${cat.mine[def]} → ${cat.mine[next]}/turn, upkeep ${cat.upkeep[def]} → ${cat.upkeep[next]}/turn)`,
        ),
      );
    }
    const unbought = withoutUnit(state, miner.id, cat.cost[def], player);
    perturbations.push(
      diff(
        base,
        evaluate(unbought, replica, ev, sc),
        'unbuy-miner',
        `the purchase decision, reversed: ${miner.definitionId} removed from the board and its ${cat.cost[def]}-crystal cost refunded to the bank; the negated delta is what the evaluator pays to own the miner instead of the cash`,
        -1,
      ),
    );
  }

  return {
    id,
    file,
    sideToMove: player,
    root,
    turnNumber,
    phase: state.turn.phase,
    base,
    perturbations,
  };
}

function installRules(rules: RulesBlock): void {
  installExamRules({ rules });
}

function main(): void {
  const argv = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = path.resolve(REPO_ROOT, argv[++i]);
    else throw new Error(`econ-ledger: unrecognised argument "${argv[i]}"`);
  }

  if (DEFAULT_WEIGHTS.version === 0) {
    throw new Error('econ-ledger: DEFAULT_WEIGHTS carries the placeholder version 0 (E0 I2)');
  }

  const replica = new Replica();
  const sc = new Scratch(4, 8, 8, 8);
  const ev = new Evaluator(replica, DEFAULT_WEIGHTS);
  const entries: LedgerEntry[] = [];

  const econFile = path.join(POSITIONS_DIR, 'economy.jsonl');
  const stored = readPositions(econFile).find(sp => sp.id === ECON_POSITION_ID);
  if (stored === undefined) throw new Error(`econ-ledger: ${ECON_POSITION_ID} not found in ${econFile}`);
  installRules(stored.rules);
  try {
    entries.push(
      ledgerFor(stored.id, path.relative(REPO_ROOT, econFile), stored.state, null, replica, ev, sc),
    );
  } finally {
    restoreShippedRules();
  }

  const cases = loadStratum('dev', CASES_DIR);
  const lossCase = cases.find(c => c.id === LOSS_CASE_ID);
  if (lossCase === undefined) throw new Error(`econ-ledger: ${LOSS_CASE_ID} not found in the dev stratum`);
  installExamRules(lossCase);
  try {
    const state = loadCaseState(lossCase);
    const turnNumber = lossCase.source.kind === 'loss' ? lossCase.source.turnNumber : null;
    entries.push(
      ledgerFor(
        lossCase.id,
        path.relative(REPO_ROOT, path.join(CASES_DIR, 'dev.jsonl')),
        state,
        turnNumber,
        replica,
        ev,
        sc,
      ),
    );
  } finally {
    restoreShippedRules();
  }

  // --- sweeps on the economy fixture ---------------------------------------
  // Both are CONSTRUCTED variants of `promote-plant_1-16-0`: the fixture on
  // disk is never rewritten, and the variant is named in `what`.
  installRules(stored.rules);
  const sweeps: Sweep[] = [];
  try {
    const bankPoints: SweepPoint[] = [];
    let prev = 0;
    for (let bank = 0; bank <= 14; bank++) {
      const s2 = cloneState(stored.state);
      s2.players.white = { ...s2.players.white, resources: bank };
      const score = evaluate(s2, replica, ev, sc).score;
      bankPoints.push({ x: bank, score, stepCc: bank === 0 ? 0 : score - prev });
      prev = score;
    }
    sweeps.push({
      id: 'bank-sweep',
      what: `${ECON_POSITION_ID} with White's bank set to 0..14 (one plant_1 on a 16-cell, nothing else on the board)`,
      points: bankPoints,
    });

    const reservePoints: SweepPoint[] = [];
    const slow = stored.state.board.units[0];
    prev = 0;
    for (let r = 0; r <= 16; r++) {
      let s2 = withDefinition(stored.state, slow.id, 'fire_1');
      s2 = withReserve(s2, slow.position.x, slow.position.y, r - 16);
      const score = evaluate(s2, replica, ev, sc).score;
      reservePoints.push({ x: r, score, stepCc: r === 0 ? 0 : score - prev });
      prev = score;
    }
    sweeps.push({
      id: 'reserve-sweep-mine1',
      what: `${ECON_POSITION_ID} with its plant_1 replaced by a fire_1 (mine 1/turn, upkeep 0) and the reserve under it set to 0..16; step r is the cc the evaluator pays for the crystal mined on own-turn r`,
      points: reservePoints,
    });
  } finally {
    restoreShippedRules();
  }

  const report = {
    tool: 'lab/hard-ai/audit/econ-ledger.ts',
    generatedBy: 'Hard AI E3 lane 3 (E3.1 economy audit)',
    weights: { label: DEFAULT_WEIGHTS.label, version: DEFAULT_WEIGHTS.version },
    constants: {
      ECON_HORIZON,
      PST_HORIZON,
      RENT_PV,
      wPstMine: DEFAULT_WEIGHTS.w[5],
      wEconDelta: DEFAULT_WEIGHTS.w[23],
      wRent: DEFAULT_WEIGHTS.w[1],
      ...discountCoefficients(),
    },
    sidePlayers: SIDE_PLAYER,
    entries,
    sweeps,
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`econ-ledger: wrote ${path.relative(REPO_ROOT, out)}\n`);
  for (const e of entries) {
    process.stdout.write(`  ${e.id}: score ${e.base.score} cc (root ${e.sideToMove}, phase ${e.phase})\n`);
    for (const pert of e.perturbations) {
      process.stdout.write(`    ${pert.id}: ${pert.scoreDelta >= 0 ? '+' : ''}${pert.scoreDelta} cc\n`);
    }
  }
}

main();
