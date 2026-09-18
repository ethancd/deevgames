/**
 * `node --import tsx lab/hard-ai/oracles/kill.ts --positions <n> --max-own-units <k>
 *  [--shards <s>] [--out <path>]` (DESIGN §5.7, F23, MILESTONES.md M7).
 *
 * Three independent differential checks on `src/ai/hard/tables/kill.ts`,
 * matching the M7 gate criterion field for field.
 *
 * ## 1. `suboptimal` — the DP against an exhaustive replica turn search
 *
 * For every sampled position, every enemy slot and all four
 * `(allowBuys, allowPromotes)` combinations, `minActionsToKill` is compared
 * against `bruteForceKill` below: a depth-first search over the REPLICA's own
 * legal actions (`Replica.genActions` / `genPlace`, `make` / `unmake`) that
 * actually removes the target from the board inside one turn. The search is
 * iterative-deepening on the action count, so the first line it finds is a
 * minimum-action line; among those it keeps the cheapest in crystals.
 *
 * `suboptimal` counts the disagreements the M7 criterion names: the DP's
 * `minActions` differing from the search's, or — at equal actions — the DP's
 * `minCrystals` being higher. `optimistic` splits out the direction that
 * matters for search safety (the DP claiming FEWER actions than any real line
 * needs) and is reported separately; it is a subset of `suboptimal`, never a
 * separate population.
 *
 * The search explores a restricted but kill-complete action set, documented at
 * `relevantAction` below: an action that neither hits the target, nor clears
 * or vacates one of its lanes, nor walks an attacker onto a lane, nor buys or
 * promotes an attacker, cannot shorten a minimum-action kill of that one
 * target. Purchases are enumerated at every legal spawn square that is a
 * per-lane BFS minimum (a strictly richer set than the single cheapest square
 * §5.7 charges the DP), so a purchase plan the DP mis-prices is still found.
 * See `docs/hard-ai/design/DEVIATIONS.md` under M7.
 *
 * ## 2. `cornerMismatch` — the corner case against `enoughPossibleDamage`
 *
 * `homeCheckmate.ts:27-49 enoughPossibleDamage` is module-private, so it is
 * transcribed verbatim below (`enoughPossibleDamage`) and pinned line for line
 * by `tests/ai/hard/kill.test.ts`'s corner cases. It is compared on all 28
 * `lab/ai/fixtures.ts` cases in its `preparing = false` framing — the framing
 * §5.7 generalises, evaluated at a live mid-turn node with no upkeep stage —
 * against `minActionsToKill` with `maxLanes: 2`, the corner's lane count.
 *
 * `cornerPreparingMismatch` adds the `preparing = true` framing (promotions
 * on, evaluated on the defender's `ready` reply position the way
 * `searchHomeDefense` builds it) on the subset of fixtures where that
 * framing's rent filter (`rent > cash -> skip`) is a no-op, because rent is
 * the home prover's concern (M10) and not a §5.7 quantity.
 *
 * ## 3. `cleaveProbeOk` — the LH §4.1 Cleave probe
 *
 * One Kagari against three stationary Muju: clustered, 3 kills in 3 actions;
 * spaced on C1/E1/G1, 2 kills in 4 actions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import type { GameState, PlayerId, Unit } from '../../../src/game/types';
import { createUnit } from '../../../src/game/board';
import { manhattanDistance, resetUnitActions } from '../../../src/game/board';
import { calculateAttackPower, calculateDefense, canAttack as canonicalCanAttack } from '../../../src/game/combat';
import { getNextTierDefinition, getUnitDefinition } from '../../../src/game/units';
import { getActionsPerTurn } from '../../../src/game/rules';
import { unitUpkeep } from '../../../src/game/upkeep';
import { getHomeOccupier, getOpponent } from '../../../src/game/victory';
import { Scratch, bbNext, bbNew, bbZero, bbSet, type BB } from '../../../src/ai/hard/core/bits';
import { AKind, paA, paB, paC, paKind, type PA } from '../../../src/ai/hard/core/action';
import { ACTIONS_PER_TURN, Replica, allocState, newUndo, type Undo } from '../../../src/ai/hard/core/state';
import { DEF_INDEX, activeCatalog } from '../../../src/ai/hard/core/catalog';
import { newSpawnInfo, spawnInfo, type SpawnInfo } from '../../../src/ai/hard/core/spawn';
import { ADJ_LIST } from '../../../src/ai/hard/core/tables';
import { DEAD, MAX_SLOTS, NO_SLOT, type PackedState, type Side, type Slot, type Square } from '../../../src/ai/hard/types';
import {
  KILL_IMPOSSIBLE,
  KILL_NO_ATTACKER,
  cleavePlan,
  minActionsToKill,
  newCleavePlan,
  newKillPlan,
  type KillContext,
  type KillOpts,
} from '../../../src/ai/hard/tables/kill';
import { tacticalFixtures } from '../../ai/fixtures';
import { mirror180, readPositions, type StoredPosition } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const SELF_PATH = path.resolve(import.meta.dirname, 'kill.ts');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/M7.json');
const MAX_REPORTED_MISMATCHES = 20;

/** `genActions`/`genPlace` output capacity (`verify/perft.ts` uses the same). */
const GEN_CAPACITY = 4 + MAX_SLOTS * 104;
/** A minimum-action kill of one target never needs more distinct purchases
 * than it has actions to spend them with, and never more than the ≤ 4 lanes. */
const MAX_BRUTE_BUYS = 2;
/** Likewise for promotions: each promoted attacker still has to spend an action. */
const MAX_BRUTE_PROMOS = 2;
/** Per-lane BFS minima kept as purchase squares, plus the global minimum. */
const MAX_BUY_SQUARES = 5;

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

interface Args {
  positions: number;
  maxOwnUnits: number;
  shards: number;
  out: string;
  seed: number;
  shardIndex: number;
  shardCount: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { positions: 2000, maxOwnUnits: 8, shards: 1, out: DEFAULT_OUT, seed: 1, shardIndex: -1, shardCount: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--max-own-units') args.maxOwnUnits = Number(argv[++i]);
    else if (a === '--shards') args.shards = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--shard-index') args.shardIndex = Number(argv[++i]);
    else if (a === '--shard-count') args.shardCount = Number(argv[++i]);
    else throw new Error(`oracles/kill: unrecognised argument "${a}"`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// corpus
// ---------------------------------------------------------------------------

/** `authored.jsonl ++ openings.jsonl ++ fuzz-1000.jsonl`, in that order. */
function loadCorpus(): StoredPosition[] {
  const files = ['authored.jsonl', 'openings.jsonl', 'fuzz-1000.jsonl'];
  const out: StoredPosition[] = [];
  for (const f of files) {
    const p = path.join(POSITIONS_DIR, f);
    if (fs.existsSync(p)) out.push(...readPositions(p));
  }
  return out;
}

/** `n` positions drawn from `corpus`, `mirror180`-ed on every second pass once
 * the corpus itself is exhausted (same rule as `oracles/economy.ts`). */
function samplePositions(corpus: readonly StoredPosition[], n: number): StoredPosition[] {
  if (corpus.length === 0) throw new Error('oracles/kill: empty position corpus');
  const out: StoredPosition[] = [];
  let round = 0;
  while (out.length < n) {
    for (const sp of corpus) {
      if (out.length >= n) break;
      out.push(round % 2 === 0 ? sp : { ...sp, id: `${sp.id}#m${round}`, state: mirror180(sp.state) });
    }
    round++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// the brute-force replica search
// ---------------------------------------------------------------------------

interface BruteResult {
  /** `KILL_IMPOSSIBLE` when no line inside the budget removes the target. */
  actions: number;
  crystals: number;
}

/**
 * The lanes of `targetSq` — its orthogonal neighbours — in ascending order.
 * Unlike `kill.ts collectLanes` this keeps lanes held by the target's own side
 * too: clearing such a lane is a legal (if expensive) way to open it, and the
 * search must be free to try it.
 */
function laneSquares(targetSq: Square): number[] {
  const out: number[] = [];
  const base = targetSq * 4;
  for (let k = 0; k < 4; k++) {
    const q = ADJ_LIST[base + k];
    if (q >= 0) out.push(q);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Legal spawn squares worth buying on when the goal is to kill the unit on
 * `targetSq`: for each lane, the legal spawn square at minimum BFS distance
 * from it (ties to the lowest square), plus the minimum over all lanes at
 * once. Every other spawn square is dominated — it is at least as far from
 * every lane, so any plan through it costs at least as many actions.
 */
function buyableSquares(p: PackedState, rep: Replica, spawn: SpawnInfo, lanes: readonly number[]): number[] {
  if (spawn.area === 0) return [];
  const picked: number[] = [];
  const add = (q: number): void => {
    if (q >= 0 && !picked.includes(q) && picked.length < MAX_BUY_SQUARES) picked.push(q);
  };
  const all: BB = bbZero(bbNew());
  let anyLane = false;
  for (const lane of lanes) {
    if (p.pieceAt[lane] !== NO_SLOT) continue;
    anyLane = true;
    bbSet(all, lane);
    const dist = rep.dist.get(p, lane);
    let bestD = -1;
    let bestQ = -1;
    for (let q = bbNext(spawn.legal, -1); q >= 0; q = bbNext(spawn.legal, q)) {
      const d = dist[q];
      if (d < 0) continue;
      if (bestD < 0 || d < bestD) {
        bestD = d;
        bestQ = q;
      }
    }
    add(bestQ);
  }
  if (!anyLane) return [];
  const multi = new Int8Array(100);
  rep.dist.multi(p, all, multi);
  let bestD = -1;
  let bestQ = -1;
  for (let q = bbNext(spawn.legal, -1); q >= 0; q = bbNext(spawn.legal, q)) {
    const d = multi[q];
    if (d < 0) continue;
    if (bestD < 0 || d < bestD) {
      bestD = d;
      bestQ = q;
    }
  }
  add(bestQ);
  picked.sort((a, b) => a - b);
  return picked;
}

interface BruteContext {
  rep: Replica;
  p: PackedState;
  undo: Undo;
  attacker: Side;
  target: Slot;
  targetSq: Square;
  lanes: readonly number[];
  buySquares: readonly number[];
  opts: KillOpts;
  bankAtRoot: number;
  buffers: Int32Array[];
  /** Best (actions, crystals) found at the current iterative-deepening limit. */
  bestCrystals: number;
  nodes: number;
  limit: number;
}

/** Guards a pathological position from stalling the whole gate run. */
const BRUTE_NODE_LIMIT = 400_000;

class BruteBudgetExceeded extends Error {}

/**
 * The kill-relevant action filter. For the single goal "remove the unit in
 * `ctx.target` from the board, in as few actions as possible", an action is
 * worth exploring only when it is one of:
 *
 *   - `ATTACK` on the target itself (the only way damage lands on it);
 *   - `ATTACK` on a unit standing on one of the target's lanes (the only way
 *     to open a lane an enemy body is plugging);
 *   - `MOVE` onto one of the target's lanes (the approach — the replica emits
 *     multi-action moves as single entries, and `ceil(d1/s) + ceil(d2/s) >=
 *     ceil((d1+d2)/s)`, so an approach never gains from stopping short);
 *   - `MOVE` of a unit that currently stands on a lane (vacating it for a
 *     stronger attacker; the destination is unrestricted because a vacating
 *     unit may have to route around its own army);
 *   - `BUY` of an affordable definition on one of `ctx.buySquares`;
 *   - `PROMOTE` of an own unit;
 *   - `END_PLACE` (the phase boundary; free).
 *
 * `END_ACTION` ends the turn and can never kill, so it is never explored.
 */
function relevantAction(ctx: BruteContext, a: PA, buysUsed: number, promosUsed: number, lastBuy: number, lastPromo: number): boolean {
  const kind = paKind(a);
  switch (kind) {
    case AKind.END_PLACE:
      return true;
    case AKind.ATTACK: {
      const at = paB(a);
      if (at === ctx.targetSq) return true;
      return ctx.lanes.includes(at);
    }
    case AKind.MOVE: {
      const to = paB(a);
      if (ctx.lanes.includes(to)) return true;
      return ctx.lanes.includes(ctx.p.sq[paA(a)]);
    }
    case AKind.BUY: {
      if (!ctx.opts.allowBuys) return false;
      if (buysUsed >= MAX_BRUTE_BUYS) return false;
      if (!ctx.buySquares.includes(paB(a))) return false;
      // Canonical order (defId, square) ascending: buys commute, so exploring
      // one order of each multiset is exhaustive over multisets.
      const key = paA(a) * 100 + paB(a);
      return key >= lastBuy;
    }
    case AKind.PROMOTE: {
      if (!ctx.opts.allowPromotes) return false;
      if (promosUsed >= MAX_BRUTE_PROMOS) return false;
      // Promotions commute with each other and with buys; ascending slot order.
      return paA(a) > lastPromo;
    }
    case AKind.END_ACTION:
    case AKind.PAY_UPKEEP:
    case AKind.RESIGN:
      return false;
    default:
      return false;
  }
}

/** Crystals the attacker has spent since the root. */
function spent(ctx: BruteContext): number {
  return ctx.bankAtRoot - ctx.p.bank[ctx.attacker];
}

function bruteVisit(ctx: BruteContext, depth: number, used: number, buysUsed: number, promosUsed: number, lastBuy: number, lastPromo: number): void {
  if (++ctx.nodes > BRUTE_NODE_LIMIT) throw new BruteBudgetExceeded('brute-force node limit');
  while (ctx.buffers.length <= depth) ctx.buffers.push(new Int32Array(GEN_CAPACITY));
  const out = ctx.buffers[depth];
  const p = ctx.p;
  const n = p.phase === 0 ? ctx.rep.genPlace(p, out) : ctx.rep.genActions(p, out);

  for (let i = 0; i < n; i++) {
    const a = out[i];
    if (!relevantAction(ctx, a, buysUsed, promosUsed, lastBuy, lastPromo)) continue;
    const kind = paKind(a);
    const cost = kind === AKind.MOVE ? paC(a) : kind === AKind.ATTACK ? 1 : 0;
    if (used + cost > ctx.limit) continue;

    ctx.rep.make(p, a, ctx.undo);
    const crystals = spent(ctx);
    if (crystals <= ctx.opts.crystalBudget) {
      if (p.sq[ctx.target] === DEAD) {
        if (crystals < ctx.bestCrystals) ctx.bestCrystals = crystals;
      } else if (used + cost < ctx.limit || (cost === 0 && used < ctx.limit)) {
        // A zero-cost place action still has to be followed by real actions;
        // only recurse while some action budget is left to spend.
        bruteVisit(
          ctx,
          depth + 1,
          used + cost,
          kind === AKind.BUY ? buysUsed + 1 : buysUsed,
          kind === AKind.PROMOTE ? promosUsed + 1 : promosUsed,
          kind === AKind.BUY ? paA(a) * 100 + paB(a) : lastBuy,
          kind === AKind.PROMOTE ? paA(a) : lastPromo,
        );
      }
    }
    ctx.rep.unmake(p, ctx.undo);
  }
}

/**
 * Fewest actions — then fewest crystals — in which `attacker` can actually
 * remove `target` from the board this turn, found by replaying real replica
 * actions. Iterative deepening on the action count makes the first depth that
 * succeeds the minimum; within that depth every line is explored so the
 * crystal figure is a true minimum too.
 *
 * Returns `null` when the search hit `BRUTE_NODE_LIMIT` (the position is
 * excluded from the comparison rather than scored on a truncated search).
 */
function bruteForceKill(
  rep: Replica,
  p: PackedState,
  attacker: Side,
  target: Slot,
  opts: KillOpts,
  spawn: SpawnInfo,
): BruteResult | null {
  if (p.side !== attacker || p.upkeepPending === 1) return null;
  if (p.sq[target] === DEAD || p.owner[target] === attacker) return { actions: KILL_IMPOSSIBLE, crystals: 0 };
  const targetSq = p.sq[target];
  const lanes = laneSquares(targetSq);
  const budget = Math.min(opts.actionBudget, ACTIONS_PER_TURN);
  const ctx: BruteContext = {
    rep,
    p,
    undo: newUndo(),
    attacker,
    target,
    targetSq,
    lanes,
    buySquares: opts.allowBuys ? buyableSquares(p, rep, spawn, lanes) : [],
    opts,
    bankAtRoot: p.bank[attacker],
    buffers: [],
    bestCrystals: Number.MAX_SAFE_INTEGER,
    nodes: 0,
    limit: 0,
  };
  for (let limit = 1; limit <= budget; limit++) {
    ctx.limit = limit;
    ctx.bestCrystals = Number.MAX_SAFE_INTEGER;
    try {
      bruteVisit(ctx, 0, 0, 0, 0, -1, -1);
    } catch (err) {
      if (err instanceof BruteBudgetExceeded) return null;
      throw err;
    }
    if (ctx.bestCrystals !== Number.MAX_SAFE_INTEGER) return { actions: limit, crystals: ctx.bestCrystals };
  }
  return { actions: KILL_IMPOSSIBLE, crystals: 0 };
}

// ---------------------------------------------------------------------------
// `enoughPossibleDamage` — verbatim transcription of homeCheckmate.ts:27-49
// ---------------------------------------------------------------------------

/**
 * `src/game/homeCheckmate.ts:27-49`, transcribed because the canonical
 * function is module-private. Any edit to the canonical body must be mirrored
 * here; `cornerMismatch` is only meaningful while the two agree.
 */
function enoughPossibleDamage(state: GameState, target: Unit, preparing: boolean): boolean {
  const actions = state.turn.actionsRemaining;
  const cash = state.players[state.turn.currentPlayer].resources;
  let power = Array.from({ length: 3 }, () => Array<number>(actions + 1).fill(-Infinity));
  power[0][0] = 0;
  for (const unit of state.board.units) {
    if (
      unit.owner !== state.turn.currentPlayer ||
      (!preparing && (!canonicalCanAttack(unit) || unit.attackedThisTurn?.includes(target.id)))
    ) {
      continue;
    }
    const rent = preparing ? unitUpkeep(unit) : 0;
    if (rent > cash) continue;
    const choices = [unit];
    const next = getNextTierDefinition(unit.definitionId);
    if (preparing && next && rent + next.cost - getUnitDefinition(unit.definitionId).cost <= cash) {
      choices.push({ ...unit, definitionId: next.id });
    }
    const updated = power.map(row => [...row]);
    for (const attacker of choices) {
      const distance = Math.max(0, manhattanDistance(attacker.position, target.position) - 1);
      const cost = Math.ceil(distance / getUnitDefinition(attacker.definitionId).speed) + 1;
      for (let hits = 1; hits <= 2; hits++) {
        for (let usedActions = cost; usedActions <= actions; usedActions++) {
          updated[hits][usedActions] = Math.max(
            updated[hits][usedActions],
            power[hits - 1][usedActions - cost] + calculateAttackPower(attacker, target),
          );
        }
      }
    }
    power = updated;
  }
  return power.slice(1).some(row => row.some(damage => damage >= calculateDefense(target)));
}

// ---------------------------------------------------------------------------
// shared plumbing
// ---------------------------------------------------------------------------

interface Mismatch {
  kind: string;
  id: string;
  detail: string;
}

function pushMismatch(list: Mismatch[], kind: string, id: string, detail: string): void {
  if (list.length < MAX_REPORTED_MISMATCHES) list.push({ kind, id, detail });
}

const OPT_COMBOS: ReadonlyArray<{ allowBuys: boolean; allowPromotes: boolean }> = [
  { allowBuys: false, allowPromotes: false },
  { allowBuys: false, allowPromotes: true },
  { allowBuys: true, allowPromotes: false },
  { allowBuys: true, allowPromotes: true },
];

interface Context {
  rep: Replica;
  sc: Scratch;
  t: KillContext;
  white: SpawnInfo;
  black: SpawnInfo;
}

function makeContext(): Context {
  const rep = new Replica();
  const white = newSpawnInfo();
  const black = newSpawnInfo();
  return { rep, sc: new Scratch(1, 2, 2, 2), t: { dist: rep.dist, spawn: [white, black] }, white, black };
}

function refreshSpawn(ctx: Context, p: PackedState): void {
  spawnInfo(p, 0, ctx.white);
  spawnInfo(p, 1, ctx.black);
}

function ownUnits(p: PackedState, side: Side): number {
  let n = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] !== DEAD && p.owner[slot] === side) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// check 1: DP vs brute force
// ---------------------------------------------------------------------------

interface SubShardResult {
  positionsUsed: number;
  placePhasePositions: number;
  comparisons: number;
  /** Comparisons per `(allowBuys, allowPromotes)` combination, in `OPT_COMBOS` order. */
  comparisonsByCombo: number[];
  /** Comparisons where a kill existed at all — the population that can disagree. */
  killsFound: number;
  /** Winning DP plans that actually spent a purchase / a promotion. */
  buyPlans: number;
  promoPlans: number;
  suboptimal: number;
  optimistic: number;
  truncated: number;
  mismatches: Mismatch[];
}

function newSubShardResult(): SubShardResult {
  return {
    positionsUsed: 0,
    placePhasePositions: 0,
    comparisons: 0,
    comparisonsByCombo: OPT_COMBOS.map(() => 0),
    killsFound: 0,
    buyPlans: 0,
    promoPlans: 0,
    suboptimal: 0,
    optimistic: 0,
    truncated: 0,
    mismatches: [],
  };
}

function checkSubOptimality(sampled: readonly StoredPosition[], maxOwnUnits: number): SubShardResult {
  const ctx = makeContext();
  const plan = newKillPlan();
  const p = allocState();
  const result = newSubShardResult();

  for (const stored of sampled) {
    try {
      ctx.rep.pack(stored.state, p);
    } catch {
      continue; // e.g. phase 'setup' has no packed representation
    }
    if (p.upkeepPending === 1) continue;
    const attacker = p.side;
    if (ownUnits(p, attacker) > maxOwnUnits) continue;
    refreshSpawn(ctx, p);
    const spawn = attacker === 0 ? ctx.white : ctx.black;
    result.positionsUsed++;
    // A purchase or a promotion is only a legal move while the Place phase is
    // still open (`legality.ts:22-23`); on an action-phase node the DP's
    // `allowBuys`/`allowPromotes` describe a hypothesis the position itself
    // cannot realise, so there is nothing for the replica search to match.
    const placeOpen = p.phase === 0;
    if (placeOpen) result.placePhasePositions++;

    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD || p.owner[slot] === attacker) continue;
      for (let ci = 0; ci < OPT_COMBOS.length; ci++) {
        const combo = OPT_COMBOS[ci];
        if (!placeOpen && (combo.allowBuys || combo.allowPromotes)) continue;
        const opts: KillOpts = {
          actionBudget: p.actions,
          crystalBudget: p.bank[attacker],
          allowBuys: combo.allowBuys,
          allowPromotes: combo.allowPromotes,
          maxLanes: 4,
        };
        const brute = bruteForceKill(ctx.rep, p, attacker, slot, opts, spawn);
        if (brute === null) {
          result.truncated++;
          continue;
        }
        const ok = minActionsToKill(p, ctx.t, attacker, slot, opts, ctx.sc, 0, plan);
        const dpActions = ok ? plan.actions : KILL_IMPOSSIBLE;
        const dpCrystals = ok ? plan.crystals : 0;
        result.comparisons++;
        result.comparisonsByCombo[ci]++;
        if (ok) {
          result.killsFound++;
          if (plan.needsPromo === 1) result.promoPlans++;
          for (let k = 0; k < plan.attackers.length; k++) {
            if (plan.attackers[k] !== KILL_NO_ATTACKER && plan.attackers[k] < 0) {
              result.buyPlans++;
              break;
            }
          }
        }
        if (dpActions === brute.actions && (dpActions === KILL_IMPOSSIBLE || dpCrystals <= brute.crystals)) continue;
        result.suboptimal++;
        if (dpActions < brute.actions) result.optimistic++;
        pushMismatch(
          result.mismatches,
          'suboptimal',
          stored.id,
          `slot ${slot} sq ${p.sq[slot]} buys=${combo.allowBuys ? 1 : 0} promos=${combo.allowPromotes ? 1 : 0}: ` +
            `dp (${dpActions}, ${dpCrystals}) vs brute (${brute.actions}, ${brute.crystals})`,
        );
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// check 2: the corner case vs `enoughPossibleDamage`
// ---------------------------------------------------------------------------

interface CornerResult {
  cornerChecked: number;
  cornerMismatch: number;
  cornerPreparingChecked: number;
  cornerPreparingMismatch: number;
  mismatches: Mismatch[];
}

interface CornerCase {
  name: string;
  state: GameState;
  target: Unit;
  defender: PlayerId;
}

function cornerCases(): CornerCase[] {
  const out: CornerCase[] = [];
  for (const fixture of tacticalFixtures()) {
    const state = fixture.state;
    let invader: PlayerId | null = null;
    for (const side of ['white', 'black'] as PlayerId[]) {
      if (getHomeOccupier(state.board, side)) invader = side;
    }
    if (invader === null) continue;
    const target = getHomeOccupier(state.board, invader);
    if (!target) continue;
    out.push({ name: fixture.name, state, target, defender: getOpponent(invader) });
  }
  return out;
}

function checkCorner(): CornerResult {
  const ctx = makeContext();
  const plan = newKillPlan();
  const p = allocState();
  const result: CornerResult = {
    cornerChecked: 0,
    cornerMismatch: 0,
    cornerPreparingChecked: 0,
    cornerPreparingMismatch: 0,
    mismatches: [],
  };

  for (const c of cornerCases()) {
    const defenderSide: Side = c.defender === 'white' ? 0 : 1;

    // (a) the `preparing = false` framing, on the fixture exactly as authored:
    // a live mid-turn node, no upkeep stage, no promotions.
    ctx.rep.pack(c.state, p);
    refreshSpawn(ctx, p);
    const slot = p.pieceAt[c.target.position.y * 10 + c.target.position.x];
    const canon = enoughPossibleDamage(c.state, c.target, false);
    const replica = minActionsToKill(
      p,
      ctx.t,
      defenderSide,
      slot,
      { actionBudget: c.state.turn.actionsRemaining, crystalBudget: 0, allowBuys: false, allowPromotes: false, maxLanes: 2 },
      ctx.sc,
      0,
      plan,
    );
    result.cornerChecked++;
    if (canon !== replica) {
      result.cornerMismatch++;
      pushMismatch(result.mismatches, 'corner', c.name, `enoughPossibleDamage ${canon} vs minActionsToKill ${replica} (actions ${plan.actions})`);
    }

    // (b) the `preparing = true` framing on the defender's reply position, on
    // the subset where the canonical rent filter cannot fire — rent belongs to
    // the home prover (M10), not to §5.7.
    const actions = getActionsPerTurn(c.state);
    const ready: GameState = {
      ...c.state,
      board: resetUnitActions(c.state.board, c.defender),
      upkeepPending: false,
      turn: { ...c.state.turn, currentPlayer: c.defender, phase: 'action', actionsRemaining: actions },
    };
    const cash = ready.players[c.defender].resources;
    const rentBinds = ready.board.units.some(u => u.owner === c.defender && unitUpkeep(u) > cash);
    if (rentBinds) continue;
    ctx.rep.pack(ready, p);
    refreshSpawn(ctx, p);
    const readySlot = p.pieceAt[c.target.position.y * 10 + c.target.position.x];
    const canonPrep = enoughPossibleDamage(ready, c.target, true);
    const replicaPrep = minActionsToKill(
      p,
      ctx.t,
      defenderSide,
      readySlot,
      { actionBudget: actions, crystalBudget: cash, allowBuys: false, allowPromotes: true, maxLanes: 2 },
      ctx.sc,
      0,
      plan,
    );
    result.cornerPreparingChecked++;
    if (canonPrep !== replicaPrep) {
      result.cornerPreparingMismatch++;
      pushMismatch(
        result.mismatches,
        'corner-preparing',
        c.name,
        `enoughPossibleDamage(preparing) ${canonPrep} vs minActionsToKill ${replicaPrep} (actions ${plan.actions})`,
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// check 3: the LH §4.1 Cleave probe
// ---------------------------------------------------------------------------

interface CleaveProbe {
  name: string;
  victims: ReadonlyArray<readonly [number, number]>;
  kagari: readonly [number, number];
  kills: number;
  actions: number;
}

/** LH §4.1: one Kagari (`fire_3`) against three stationary Muju (`plant_1`). */
const CLEAVE_PROBES: readonly CleaveProbe[] = [
  { name: 'clustered', kagari: [4, 4], victims: [[5, 4], [4, 5], [3, 4]], kills: 3, actions: 3 },
  { name: 'spaced C1/E1/G1', kagari: [0, 0], victims: [[2, 0], [4, 0], [6, 0]], kills: 2, actions: 4 },
];

function cleaveProbeState(probe: CleaveProbe, base: GameState): GameState {
  const units: Unit[] = [
    createUnit('fire_3', 'white', { x: probe.kagari[0], y: probe.kagari[1] }),
    ...probe.victims.map(([x, y]) => createUnit('plant_1', 'black', { x, y })),
  ];
  units.forEach((u, i) => {
    u.id = `probe-${i}`;
    u.placedThisTurn = false;
  });
  return { ...base, board: { ...base.board, units } };
}

function checkCleaveProbes(base: GameState): { cleaveProbeOk: boolean; mismatches: Mismatch[] } {
  const ctx = makeContext();
  const cat = activeCatalog();
  const muju = DEF_INDEX.get('plant_1');
  if (muju === undefined) throw new Error('oracles/kill: catalogue has no plant_1');
  const mujuCc = cat.cost[muju] * 100;
  const out = newCleavePlan();
  const mismatches: Mismatch[] = [];
  let ok = true;
  for (const probe of CLEAVE_PROBES) {
    const p = ctx.rep.pack(cleaveProbeState(probe, base));
    refreshSpawn(ctx, p);
    const slot = p.pieceAt[probe.kagari[1] * 10 + probe.kagari[0]];
    cleavePlan(p, ctx.t, slot, ctx.sc, 0, out);
    if (out.kills !== probe.kills || out.actions !== probe.actions || out.valueCc !== probe.kills * mujuCc) {
      ok = false;
      pushMismatch(
        mismatches,
        'cleave-probe',
        probe.name,
        `kills ${out.kills} (want ${probe.kills}), actions ${out.actions} (want ${probe.actions}), value ${out.valueCc} (want ${probe.kills * mujuCc})`,
      );
    }
  }
  return { cleaveProbeOk: ok, mismatches };
}

// ---------------------------------------------------------------------------
// shard plumbing
// ---------------------------------------------------------------------------

type ShardMetrics = SubShardResult;

function shardSlice<T>(all: readonly T[], index: number, count: number): T[] {
  const out: T[] = [];
  for (let i = index; i < all.length; i += count) out.push(all[i]);
  return out;
}

function shardOutPath(out: string, index: number): string {
  return `${out}.shard-${index}.json`;
}

function runShard(args: Args, sampled: readonly StoredPosition[]): void {
  const slice = shardSlice(sampled, args.shardIndex, args.shardCount);
  const metrics: ShardMetrics = checkSubOptimality(slice, args.maxOwnUnits);
  const outPath = shardOutPath(args.out, args.shardIndex);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(metrics) + '\n');
}

function spawnShard(args: Args, index: number, count: number): Promise<void> {
  const cliArgs = [
    '--import', 'tsx', SELF_PATH,
    '--positions', String(args.positions),
    '--max-own-units', String(args.maxOwnUnits),
    '--seed', String(args.seed),
    '--out', args.out,
    '--shard-index', String(index),
    '--shard-count', String(count),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += String(d); });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`oracles/kill shard ${index}/${count} exited ${String(code)}:\n${stderr.slice(-4000)}`));
    });
  });
}

async function runShardedSubOptimality(args: Args, sampled: readonly StoredPosition[]): Promise<ShardMetrics> {
  const count = Math.max(1, Math.min(args.shards, sampled.length));
  await Promise.all(Array.from({ length: count }, (_, i) => spawnShard(args, i, count)));
  const merged = newSubShardResult();
  for (let i = 0; i < count; i++) {
    const p = shardOutPath(args.out, i);
    const m = JSON.parse(fs.readFileSync(p, 'utf8')) as ShardMetrics;
    merged.positionsUsed += m.positionsUsed;
    merged.placePhasePositions += m.placePhasePositions;
    merged.comparisons += m.comparisons;
    for (let c = 0; c < merged.comparisonsByCombo.length; c++) merged.comparisonsByCombo[c] += m.comparisonsByCombo[c];
    merged.killsFound += m.killsFound;
    merged.buyPlans += m.buyPlans;
    merged.promoPlans += m.promoPlans;
    merged.suboptimal += m.suboptimal;
    merged.optimistic += m.optimistic;
    merged.truncated += m.truncated;
    for (const x of m.mismatches) pushMismatch(merged.mismatches, x.kind, x.id, x.detail);
    fs.rmSync(p, { force: true });
  }
  return merged;
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const corpus = loadCorpus();
  const sampled = samplePositions(corpus, args.positions);

  if (args.shardCount > 0) {
    runShard(args, sampled);
    return;
  }

  const start = Date.now();
  const sub =
    args.shards > 1
      ? await runShardedSubOptimality(args, sampled)
      : checkSubOptimality(sampled, args.maxOwnUnits);

  const corner = checkCorner();
  const cleave = checkCleaveProbes(corpus[0].state);

  const mismatches: Mismatch[] = [];
  for (const m of [...sub.mismatches, ...corner.mismatches, ...cleave.mismatches]) {
    pushMismatch(mismatches, m.kind, m.id, m.detail);
  }

  const metrics = {
    positionsRequested: args.positions,
    positionsSampled: sampled.length,
    maxOwnUnits: args.maxOwnUnits,
    shards: args.shards,
    corpusSize: corpus.length,
    positionsUsed: sub.positionsUsed,
    placePhasePositions: sub.placePhasePositions,
    comparisons: sub.comparisons,
    comparisonsByCombo: sub.comparisonsByCombo,
    minComparisonsPerCombo: Math.min(...sub.comparisonsByCombo),
    killsFound: sub.killsFound,
    buyPlans: sub.buyPlans,
    promoPlans: sub.promoPlans,
    suboptimal: sub.suboptimal,
    optimistic: sub.optimistic,
    truncated: sub.truncated,
    cornerChecked: corner.cornerChecked,
    cornerMismatch: corner.cornerMismatch,
    cornerPreparingChecked: corner.cornerPreparingChecked,
    cornerPreparingMismatch: corner.cornerPreparingMismatch,
    cleaveProbeOk: cleave.cleaveProbeOk,
    mismatches,
    elapsedMs: Date.now() - start,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`oracles/kill: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      suboptimal: metrics.suboptimal,
      optimistic: metrics.optimistic,
      cornerMismatch: metrics.cornerMismatch,
      cornerPreparingMismatch: metrics.cornerPreparingMismatch,
      cleaveProbeOk: metrics.cleaveProbeOk,
      comparisons: metrics.comparisons,
      comparisonsByCombo: metrics.comparisonsByCombo,
      killsFound: metrics.killsFound,
      buyPlans: metrics.buyPlans,
      promoPlans: metrics.promoPlans,
      positionsUsed: metrics.positionsUsed,
      truncated: metrics.truncated,
    }),
  );

  if (
    metrics.suboptimal > 0 ||
    metrics.cornerMismatch > 0 ||
    metrics.cornerPreparingMismatch > 0 ||
    !metrics.cleaveProbeOk
  ) {
    process.exitCode = 1;
  }
}

void main();
