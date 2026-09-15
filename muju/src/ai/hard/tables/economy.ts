/**
 * The economy DP (DESIGN §4.12, §5.8): a horizon-`ECON_HORIZON` projection of
 * a side's mining/rent stream, with an optional relocation rule for miners
 * whose cell has run dry.
 *
 * `economyStayInPlace` is the "relocation off" baseline — the oracle target
 * (M8): with real mining/rent applied turn by turn and no movement at all, it
 * reproduces a literal `H`-turn simulation through canonical `endTurn` to the
 * crystal (`lab/hard-ai/oracles/economy.ts`). `economyDP` adds the relocation
 * rule on top of the same core loop, so a position where no miner ever goes
 * dry has `economyDP(...).stream === economyStayInPlace(...).stream` exactly,
 * and in general `economyDP(...).stream >= economyStayInPlace(...).stream`
 * (relocating a dry miner can only add non-negative future income over
 * staying put on a permanently exhausted cell — see `bestRelocationTarget`'s
 * doc below for why).
 *
 * `economyDP`'s `t: NodeTables` reads exactly two fields (§5.8: the `dist`
 * cache for the relocation BFS, `strike[enemy]` for the contested discount);
 * `NodeTables` itself is `tables/context.ts`'s interface (DESIGN §4.8, M6).
 */
import { CC, DEAD, MAX_SLOTS, type Centi, type PackedState, type Side, type Square } from '../types';
import { activeCatalog } from '../core/catalog';
import { GAMMA_Q16, PST_MINE, RESERVE_VALUES, upkeepDue } from '../core/income';
import { bbHas, type BB, type Scratch } from '../core/bits';
import { moveCost } from '../core/movement';
import type { NodeTables } from './context';

/** DESIGN §4.12: mining/rent projection horizon, in the side's own turns. */
export const ECON_HORIZON = 6;
/** DESIGN §4.12: crystal cost per relocation action, in centi-crystals. */
export const ACTION_VALUE_CC = 60;
/** DESIGN §4.12: a relocation plan may cost at most this many actions. */
export const RELOCATION_MAX_ACTIONS = 8;

export interface EconResult {
  /** Σ discounted (income − upkeep) over the horizon, centi-crystals. */
  stream: Centi;
  /** `[ECON_HORIZON]` raw crystals mined each of the side's own turns 1..H. */
  income: Int16Array;
  /** `[ECON_HORIZON]` raw crystals of rent due each of the side's own turns 1..H. */
  upkeep: Int16Array;
  /** First turn 1..H at which the running crystal balance would go negative; `ECON_HORIZON + 1` if never. */
  turnsToInsolvency: number;
  /** Σ actionCost × ACTION_VALUE_CC over every relocation triggered, centi-crystals. */
  relocationDebt: Centi;
  /** Σ (mine − take) over every miner-turn: crystals of mining capacity left unused. */
  waste: number;
}

/** Allocates a fresh, zeroed `EconResult` (DESIGN §4.12 gives callers `out`, not an allocator — see `docs/hard-ai/design/DEVIATIONS.md` M4's "exports beyond the literal §4 lists" precedent, e.g. `core/spawn.ts`'s `newSpawnInfo`). */
export function newEconResult(): EconResult {
  return {
    stream: 0,
    income: new Int16Array(ECON_HORIZON),
    upkeep: new Int16Array(ECON_HORIZON),
    turnsToInsolvency: ECON_HORIZON + 1,
    relocationDebt: 0,
    waste: 0,
  };
}

/**
 * `economyDP`'s per-slot relocation scratch (DESIGN §5.8: `assign`, the
 * simulated current square per miner; travelling miners' remaining silent
 * turns; their pending arrival square), `MAX_SLOTS`-indexed. Module-level and
 * reused across calls rather than threaded through the caller's `Scratch`:
 * `Scratch.i8`/`i32` buffers are 100/256 entries respectively and DESIGN
 * gives `economyDP` no dedicated slot count of its own to claim from that
 * pool, so three fixed `MAX_SLOTS` (128) arrays owned by this module keep the
 * hot path allocation-free without inventing a `Scratch` layout convention
 * `tables/context.ts` (M6) has not defined yet. Not reentrant within one
 * `economyDP` call, exactly like `core/movement.ts`'s BFS scratch.
 */
const RELOC_ASSIGN = new Int32Array(MAX_SLOTS);
const RELOC_BUSY = new Int32Array(MAX_SLOTS);
const RELOC_TARGET = new Int32Array(MAX_SLOTS);

/** `economyStayInPlace`'s own reserve-copy scratch (no `Scratch` in its DESIGN signature at all). */
const STAY_RESERVE = new Uint8Array(100);
/** `economyDP`'s reserve-copy scratch. */
const DP_RESERVE = new Uint8Array(100);

interface RelocationTarget {
  /** -1 when no reachable candidate carries any projected value (see `bestRelocationTarget`'s doc). */
  square: number;
  actionCost: number;
}

/**
 * `argmax PST_MINE[def][reserve[c]] >> (actionCost/2)`, halved again when `c`
 * is inside `enemyStrike`, over every square reachable within
 * `RELOCATION_MAX_ACTIONS` actions; ties keep the lowest square (ascending
 * scan, strict `>`) — DESIGN §5.8.
 *
 * A dry miner with no positive-value candidate in range does not relocate at
 * all: DESIGN §5.8 does not say what to do when every reachable cell is
 * already empty too, and charging `relocationDebt` for a move that can only
 * ever mine 0 would cost `economyDP` on `relocationDebt` for zero gain on
 * `stream`, with no compensating benefit anywhere the design defines. This is
 * also *why* `economyDP.stream >= economyStayInPlace.stream` holds
 * structurally rather than merely empirically: every miner's contribution to
 * `stream` over the remainder of the horizon is `>= 0` whether it stays (a
 * dry cell mines 0 forever) or relocates (either it never finds a positive
 * candidate and behaves exactly like staying, or it does and only ever adds
 * non-negative income) — see `docs/hard-ai/design/DEVIATIONS.md` under M8.
 */
function bestRelocationTarget(
  p: PackedState,
  t: NodeTables,
  reserveCopy: Uint8Array,
  origin: Square,
  def: number,
  speed: number,
  enemyStrike: BB,
): RelocationTarget {
  const dist = t.dist.get(p, origin);
  const base = def * RESERVE_VALUES;
  let bestSquare = -1;
  let bestScore = 0;
  let bestActionCost = 0;
  for (let s = 0; s < 100; s++) {
    const actionCost = moveCost(dist, s, speed);
    if (actionCost < 1 || actionCost > RELOCATION_MAX_ACTIONS) continue;
    let score = PST_MINE[base + reserveCopy[s]] >> (actionCost >> 1);
    if (bbHas(enemyStrike, s)) score = score >> 1;
    if (score > bestScore) {
      bestScore = score;
      bestSquare = s;
      bestActionCost = actionCost;
    }
  }
  return { square: bestScore > 0 ? bestSquare : -1, actionCost: bestActionCost };
}

/**
 * Shared core of `economyDP`/`economyStayInPlace` (DESIGN §5.8). Walks
 * `ECON_HORIZON` of `side`'s own turns over `reserveCopy` (caller-owned, a
 * scratch copy of `p.reserve` the loop depletes in place), assigning each
 * living miner (`cat.mine[def] > 0`) in ascending slot order.
 *
 * When `relocate` is false the relocation branch never runs, so a dry miner
 * simply contributes 0 for the rest of the horizon — exactly what a
 * permanently exhausted cell does in a literal held simulation. That is
 * `economyStayInPlace`.
 *
 * When `relocate` is true and a miner goes dry (`take === 0` this turn), it
 * looks for the best reachable non-empty cell via `bestRelocationTarget`,
 * charges `relocationDebt`, and goes silent for `ceil(actionCost / 4)` turns
 * (DESIGN §5.8's `busy`) before mining resumes from the new square. Silent
 * turns are counted so the *triggering* turn (already recorded as 0 income
 * above) is turn one of the `busy` count: `RELOC_BUSY[slot]` is seeded to
 * `businessTurns - 1` (the turns still to come), and the very next turn's
 * `RELOC_BUSY[slot] > 0` check consumes those one at a time.
 */
function runEconomy(
  p: PackedState,
  side: Side,
  reserveCopy: Uint8Array,
  relocate: boolean,
  t: NodeTables | null,
  out: EconResult,
): EconResult {
  const cat = activeCatalog();
  const enemyStrike = t !== null ? t.strike[1 - side] : null;
  reserveCopy.set(p.reserve);

  if (relocate) {
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      RELOC_ASSIGN[slot] = p.sq[slot];
      RELOC_BUSY[slot] = 0;
      RELOC_TARGET[slot] = -1;
    }
  }

  const upkeepPerTurn = upkeepDue(p, side);
  let running = p.bank[side];
  let stream = 0;
  let waste = 0;
  let relocationDebt = 0;
  let turnsToInsolvency = ECON_HORIZON + 1;
  let insolvencyFound = false;

  for (let turnIdx = 0; turnIdx < ECON_HORIZON; turnIdx++) {
    let incomeT = 0;

    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD || p.owner[slot] !== side) continue;
      const def = p.defId[slot];
      const mine = cat.mine[def];
      if (mine === 0) continue; // not a miner: never mines, never relocates (DESIGN §5.8)

      if (relocate && RELOC_BUSY[slot] > 0) {
        RELOC_BUSY[slot]--;
        if (RELOC_BUSY[slot] === 0) RELOC_ASSIGN[slot] = RELOC_TARGET[slot];
        continue; // travelling this turn: contributes 0 income
      }

      const c = relocate ? RELOC_ASSIGN[slot] : s;
      const before = reserveCopy[c];
      const take = mine < before ? mine : before;
      reserveCopy[c] = before - take;
      incomeT += take;
      waste += mine - take;

      if (relocate && take === 0) {
        const found = bestRelocationTarget(p, t as NodeTables, reserveCopy, s, def, cat.spd[def], enemyStrike as BB);
        if (found.square >= 0) {
          const businessTurns = (found.actionCost + 3) >> 2; // ceil(actionCost / 4)
          relocationDebt += found.actionCost * ACTION_VALUE_CC;
          RELOC_TARGET[slot] = found.square;
          RELOC_BUSY[slot] = businessTurns - 1;
          if (RELOC_BUSY[slot] === 0) RELOC_ASSIGN[slot] = found.square;
        }
      }
    }

    out.income[turnIdx] = incomeT;
    out.upkeep[turnIdx] = upkeepPerTurn;
    // DESIGN §5.8: `stream += GAMMA_Q16[t+1] × (income_t − upkeep_t) × CC >> 16`, t = turnIdx + 1.
    stream += (GAMMA_Q16[turnIdx + 2] * (incomeT - upkeepPerTurn) * CC) >> 16;

    running += incomeT - upkeepPerTurn;
    if (!insolvencyFound && running < 0) {
      turnsToInsolvency = turnIdx + 1;
      insolvencyFound = true;
    }
  }

  out.stream = stream;
  out.turnsToInsolvency = turnsToInsolvency;
  out.relocationDebt = relocationDebt;
  out.waste = waste;
  return out;
}

/**
 * DESIGN §4.12: the economy DP with relocation. `t`/`sc`/`ply` are the node's
 * shared tables and per-ply scratch (DESIGN §4.8). `sc`/`ply` are accepted
 * per the normative signature but unused: `tables/context.ts`'s `buildTables`
 * (DESIGN §4.8) — which would assign each table module a slice of the
 * caller's `Scratch` pool — has its body land at M12, so no cross-module
 * `Scratch` slot-allocation convention exists yet; this module owns its
 * `MAX_SLOTS`-indexed relocation scratch directly (above) rather than guess
 * at indices another table module might also claim in the same pool.
 */
export function economyDP(p: PackedState, t: NodeTables, side: Side, _sc: Scratch, _ply: number, out: EconResult): EconResult {
  return runEconomy(p, side, DP_RESERVE, true, t, out);
}

/** DESIGN §4.12: the relocation-off baseline — the oracle target (M8). */
export function economyStayInPlace(p: PackedState, side: Side, out: EconResult): EconResult {
  return runEconomy(p, side, STAY_RESERVE, false, null, out);
}
