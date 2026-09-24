/**
 * `node --import tsx lab/hard-ai/oracles/killeta.ts [--positions <n>] [--playouts <m>]
 *  [--seed <s>] [--exhaustive] [--out <path>]` (STRATEGOS W1.4; plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, B.2 row W1.4).
 *
 * The differential check on `src/ai/hard/strategy/killeta.ts`, and the
 * multi-turn sibling of `oracles/kill.ts`: that oracle checks the ONE-Act kill
 * DP against an exhaustive one-turn search; this one checks the MULTI-ply
 * lower bound against legal playouts and a multi-ply exhaustive search, on the
 * same replica (`kill.ts` has no playouts to extend, so none of its code is
 * shared beyond the replica itself). `killEta` claims a
 * LOWER BOUND: no attack by `side` removes a unit before ply `killEta(p,
 * side).plies`, in any legal continuation. A lower bound is falsified by a
 * single line that kills earlier, so this oracle plays lines and looks for one.
 * It never measures tightness as a pass criterion — a bound of 1 everywhere
 * would pass — so the tightness numbers it reports (`slack`, `tightHits`) are
 * there for a reader, and the tests pin tightness separately on authored pairs.
 *
 * ## 1. Playouts (`violations`)
 *
 * From every start position, `killEta` is computed once for each side, then
 * legal playouts run on the replica (`Replica.genActions` / `genPlace` /
 * `genKeepSets`, `make`) for up to `KILL_ETA_HORIZON + 1` plies, with the same
 * ply convention as the bound (ply 1 is the turn in progress; every `END_PLACE`
 * hand-off starts the next). Each side plays one of two policies:
 *
 *   - `random`: a uniformly random legal action at every decision;
 *   - `aggressive`: the fastest closing the plan asks the oracle to stress —
 *     a lethal ATTACK if one exists, else any ATTACK, else the MOVE that brings
 *     a unit nearest to any enemy unit (so the TARGET side walks INTO the
 *     attacker too), else `END_ACTION`; in Prepare, buy the fastest affordable
 *     tier-1 class on the legal spawn square nearest an enemy, promote whatever
 *     is affordable, then `END_PLACE`.
 *
 * The four policy pairs rotate across playouts. The first ply in which each
 * side's ATTACK removes a unit is recorded; a first kill EARLIER than that
 * side's bound is a violation, reported with the seed and the line.
 *
 * ## 2. Exhaustive search (`exhaustiveViolations`)
 *
 * On small authored positions (a few units, empty reserves, small banks) a
 * depth-first search over EVERY legal action — moves, attacks, `END_ACTION`,
 * every keep set, every purchase on every legal square, every promotion,
 * `END_PLACE` — explores the first `maxPly` plies, deduplicated on the
 * replica's order-blind `digest` per ply, and returns the earliest ply in which
 * `side` can kill. It must never be earlier than the bound. The authored set
 * includes positions where the two agree exactly, so the search is not
 * vacuous.
 *
 * ## Start positions
 *
 * The P1 dev book's openings (`lab/ai/gate1-openings.ts`, both handicaps),
 * positions reached from them by a seeded prefix of the same two policies
 * (mid-Act, Prepare and upkeep roots included), and sparse random boards with
 * money to spend (`sparseStarts`), so the corpus spans the opening, first
 * contact, far-apart armies and the purchase and promotion clauses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState, PendingSummon, PlayerId, Unit } from '../../../src/game/types';
import { createInitialGameState } from '../../../src/game/board';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../../../src/game/units';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { seededRandom } from '../../../src/ai/runtime';
import { powerIndex } from '../../../src/ai/hard/core/catalog';
import { AKind, newKeepSetTable, paA, paB, paMake, paKind, type KeepSetTable, type PA } from '../../../src/ai/hard/core/action';
import { Replica, allocState, copyState, newUndo, type Undo } from '../../../src/ai/hard/core/state';
import { MANHATTAN } from '../../../src/ai/hard/core/tables';
import { DEAD, MAX_SLOTS, NO_SLOT, Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import { KILL_ETA_HORIZON, killEta, newKillEtaScratch } from '../../../src/ai/hard/strategy/killeta';
import { gate1StartState, loadGate1Book } from '../../ai/gate1-openings';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/killeta.json');
/** CHOICE: mismatches kept verbatim in the artifact; the counts are exact
 * regardless (falsifier: a triage that needs more examples than this). */
const MAX_REPORTED = 20;
/** `genActions`/`genPlace` output capacity. DERIVED: the replica's own bound,
 * copied from `oracles/kill.ts` and `verify/perft.ts`. */
const GEN_CAPACITY = 4 + MAX_SLOTS * 104;
/** CHOICE: a runaway guard, not a limit — a 12-ply playout takes a few hundred
 * actions (falsifier: a legal playout that legitimately needs more). */
const PLAYOUT_ACTION_GUARD = 4000;
/** CHOICE: exhaustive-search node budget; the authored cases use under 10^5
 * (falsifier: `truncated > 0` on an authored case). */
const EXHAUSTIVE_NODE_LIMIT = 2_000_000;
/** DERIVED (`board.ts BOARD_SIZE`): a Manhattan distance on the 10×10 board
 * is at most 18, so 99 reads "no enemy unit at all". */
const NO_ENEMY = 99;
/** CHOICE: slack histogram buckets 0 … 11 and "12 or more" (falsifier: none —
 * reporting only). */
const SLACK_BUCKETS = 13;
/** CHOICE: prefixes of up to 60 actions reach turns 3 – 8 from the dev book,
 * where first contact happens (falsifier: a sample with no contact). */
const MAX_PREFIX_ACTIONS = 60;
/** CHOICE: sparse boards hold 1 … 3 bodies a side, banks up to 12 (4 when
 * poor), a uniform reserve up to 6 (0 when poor), a third of them poor
 * (falsifier: bound histograms with no bound above 4, i.e. nothing far). */
const SPARSE_MAX_BODIES = 3;
const SPARSE_MAX_BANK = 12;
const SPARSE_POOR_MAX_BANK = 3;
const SPARSE_MAX_RESERVE = 6;
const SPARSE_POOR_SHARE = 1 / 3;
/** CHOICE: half the sparse boards carry a paid commitment for the side not to
 * move, and either colour moves first with equal odds (falsifier: no
 * `'pending'`-decided bound in the corpus, which the unit test asserts). */
const SPARSE_PENDING_SHARE = 1 / 2;
const WHITE_TO_MOVE_SHARE = 1 / 2;
/** CHOICE: a prime multiplier that spreads per-playout seeds so consecutive
 * `--seed` values never share a stream (falsifier: two seeds with identical
 * playout lines). */
const PLAYOUT_SEED_STRIDE = 7919;
/** Playouts cover every ply the bound can speak about, plus one. DERIVED
 * (`KILL_ETA_HORIZON`): a first kill after the horizon cannot violate any bound. */
export const PLAYOUT_PLIES = KILL_ETA_HORIZON + 1;
/** CHOICE: the aggressive buyer stops after two purchases per Prepare — enough
 * to exercise multi-body arrivals without emptying the bank into walls
 * (falsifier: a violation that needs three same-turn buys, which the random
 * policy still explores). */
const AGGRESSIVE_MAX_BUYS = 2;

export type Policy = 'random' | 'aggressive';
export const POLICY_PAIRS: readonly (readonly [Policy, Policy])[] = [
  ['aggressive', 'aggressive'],
  ['aggressive', 'random'],
  ['random', 'aggressive'],
  ['random', 'random'],
];

export interface StartPosition {
  id: string;
  p: PackedState;
}

// ---------------------------------------------------------------------------
// a legal-move walker on the replica
// ---------------------------------------------------------------------------

/** Reusable buffers for one playout at a time (a walker is not reentrant). */
export interface Walker {
  rep: Replica;
  undo: Undo;
  keep: KeepSetTable;
  buf: Int32Array;
  /** `nearestField` output. */
  near: Int32Array;
}

export function newWalker(rep: Replica): Walker {
  return { rep, undo: newUndo(), keep: newKeepSetTable(), buf: new Int32Array(GEN_CAPACITY), near: new Int32Array(100) };
}

/** Every legal action at `p`, in the replica's order, written to `w.buf`. */
function legalActions(w: Walker, p: PackedState): number {
  if (p.result !== Result.ONGOING) return 0;
  if (p.upkeepPending === 1) {
    const n = w.rep.genKeepSets(p, w.keep);
    for (let i = 0; i < n; i++) w.buf[i] = paMake(AKind.PAY_UPKEEP, i);
    return n;
  }
  return p.phase === 1 ? w.rep.genActions(p, w.buf) : w.rep.genPlace(p, w.buf);
}

/**
 * `out[q]` = Manhattan distance from square `q` to the nearest unit of `side`
 * (`NO_ENEMY` when it has none), one pass per decision rather than one per candidate
 * move.
 */
function nearestField(p: PackedState, side: Side, out: Int32Array): Int32Array {
  out.fill(NO_ENEMY);
  for (let slot = 0; slot < p.slotCount; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    const row = p.sq[slot] * 100;
    for (let q = 0; q < 100; q++) {
      const d = MANHATTAN[row + q];
      if (d < out[q]) out[q] = d;
    }
  }
  return out;
}

/** Would this ATTACK remove its target? (`combat.ts resolveCombat`.) */
function lethal(rep: Replica, p: PackedState, a: PA): boolean {
  const slot = paA(a);
  const victim = p.pieceAt[paB(a)];
  const cat = rep.cat;
  const power = cat.power[powerIndex(p.owner[slot] as Side, p.defId[slot], p.defId[victim])];
  return power >= Math.max(0, cat.def[p.defId[victim]] - p.damage[victim]);
}

/** The aggressive policy's choice among `w.buf[0 … n)`; see the module comment. */
function aggressiveChoice(w: Walker, p: PackedState, n: number, rng: () => number, buysThisTurn: number): PA {
  const side = p.side;
  const enemy = (1 - side) as Side;
  const buf = w.buf;
  const pick = (list: PA[]): PA => list[Math.floor(rng() * list.length)];
  if (p.upkeepPending === 1) return buf[0];
  const near = nearestField(p, enemy, w.near);
  if (p.phase === 1) {
    const kills: PA[] = [];
    const hits: PA[] = [];
    let bestMove: PA[] = [];
    let bestScore = Infinity;
    let end: PA = buf[n - 1];
    for (let i = 0; i < n; i++) {
      const a = buf[i];
      const kind = paKind(a);
      if (kind === AKind.ATTACK) {
        if (lethal(w.rep, p, a)) kills.push(a);
        else hits.push(a);
      } else if (kind === AKind.MOVE) {
        const slot = paA(a);
        const before = near[p.sq[slot]];
        const after = near[paB(a)];
        if (after >= before) continue;
        if (after < bestScore) {
          bestScore = after;
          bestMove = [a];
        } else if (after === bestScore) {
          bestMove.push(a);
        }
      } else if (kind === AKind.END_ACTION) {
        end = a;
      }
    }
    if (kills.length > 0) return pick(kills);
    if (hits.length > 0) return pick(hits);
    if (bestMove.length > 0) return pick(bestMove);
    return end;
  }
  // Prepare: fastest affordable buy nearest the enemy, then promotions, then END_PLACE.
  const cat = w.rep.cat;
  let bestBuy: PA[] = [];
  let bestKey = -Infinity;
  const promos: PA[] = [];
  let endPlace: PA = paMake(AKind.END_PLACE, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const a = buf[i];
    const kind = paKind(a);
    if (kind === AKind.BUY && buysThisTurn < AGGRESSIVE_MAX_BUYS) {
      const def = paA(a);
      // Lexicographic: speed, then attack, then nearness (each term < 100).
      const key = (cat.spd[def] * 100 + cat.atk[def]) * 100 - near[paB(a)];
      if (key > bestKey) {
        bestKey = key;
        bestBuy = [a];
      } else if (key === bestKey) {
        bestBuy.push(a);
      }
    } else if (kind === AKind.PROMOTE) {
      promos.push(a);
    } else if (kind === AKind.END_PLACE) {
      endPlace = a;
    }
  }
  if (bestBuy.length > 0) return pick(bestBuy);
  if (promos.length > 0) return pick(promos);
  return endPlace;
}

export interface PlayoutResult {
  /** First ply in which each side's ATTACK removed a unit; `Infinity` if none. */
  firstKill: [number, number];
  plies: number;
  /** The line, as encoded actions, for a reproducer. */
  line: number[];
}

/**
 * One legal playout from `root` (untouched) for up to `maxPlies` plies.
 * Ply 1 is the turn in progress at the root; every `END_PLACE` that leaves the
 * game running starts the next ply.
 */
export function playout(
  rep: Replica,
  root: PackedState,
  policies: readonly [Policy, Policy],
  rng: () => number,
  maxPlies: number = PLAYOUT_PLIES,
  work: PackedState = allocState(),
  w: Walker = newWalker(rep),
): PlayoutResult {
  const p = work;
  copyState(p, root);
  const firstKill: [number, number] = [Infinity, Infinity];
  const line: number[] = [];
  let ply = 1;
  let buysThisTurn = 0;
  let guard = 0;
  while (p.result === Result.ONGOING && ply <= maxPlies) {
    if (++guard > PLAYOUT_ACTION_GUARD) throw new Error('oracles/killeta: playout did not terminate');
    const n = legalActions(w, p);
    if (n === 0) break;
    const policy = policies[p.side];
    const a = policy === 'random' ? w.buf[Math.floor(rng() * n)] : aggressiveChoice(w, p, n, rng, buysThisTurn);
    const kind = paKind(a);
    const mover = p.side;
    let victim = NO_SLOT;
    if (kind === AKind.ATTACK) victim = p.pieceAt[paB(a)];
    w.undo.top = 0;
    rep.make(p, a, w.undo, w.keep);
    line.push(a);
    if (kind === AKind.ATTACK && victim !== NO_SLOT && p.sq[victim] === DEAD && firstKill[mover] === Infinity) {
      firstKill[mover] = ply;
    }
    if (kind === AKind.BUY) buysThisTurn++;
    if (kind === AKind.END_PLACE) {
      buysThisTurn = 0;
      if (p.result === Result.ONGOING) ply++;
    }
  }
  return { firstKill, plies: ply, line };
}

// ---------------------------------------------------------------------------
// start positions
// ---------------------------------------------------------------------------

/** The P1 dev book's start positions at the given handicaps. */
export function openingStarts(handicaps: readonly number[] = [0, 3]): StartPosition[] {
  const rep = new Replica();
  const book = loadGate1Book();
  const out: StartPosition[] = [];
  for (const h of handicaps) {
    for (const opening of book.openings) out.push({ id: `${opening.id}@h${h}`, p: rep.pack(gate1StartState(opening, h)) });
  }
  return out;
}

/**
 * `count` positions reached from `bases` by a seeded prefix of 1 … `maxPrefix`
 * actions under a rotating policy pair, stopped at a random point — so a
 * sample holds mid-Act, Prepare and upkeep roots, not only turn starts.
 */
export function sampledStarts(bases: readonly StartPosition[], count: number, seed: number, maxPrefix = MAX_PREFIX_ACTIONS): StartPosition[] {
  const rep = new Replica();
  const w = newWalker(rep);
  const rng = seededRandom(seed);
  const out: StartPosition[] = [];
  let i = 0;
  let attempts = 0;
  while (out.length < count && attempts < count * 4) {
    attempts++;
    const base = bases[i++ % bases.length];
    const p = allocState();
    copyState(p, base.p);
    const policies = POLICY_PAIRS[attempts % POLICY_PAIRS.length];
    const steps = 1 + Math.floor(rng() * maxPrefix);
    let buys = 0;
    for (let s = 0; s < steps && p.result === Result.ONGOING; s++) {
      const n = legalActions(w, p);
      if (n === 0) break;
      const a = policies[p.side] === 'random' ? w.buf[Math.floor(rng() * n)] : aggressiveChoice(w, p, n, rng, buys);
      if (paKind(a) === AKind.BUY) buys++;
      if (paKind(a) === AKind.END_PLACE) buys = 0;
      w.undo.top = 0;
      rep.make(p, a, w.undo, w.keep);
    }
    if (p.result !== Result.ONGOING) continue;
    out.push({ id: `${base.id}+${attempts}:${steps}`, p });
  }
  return out;
}

/**
 * `count` SPARSE positions: one to three bodies a side, of any definition, on
 * random squares, random banks (0 … 12), a random uniform reserve (0 … 6) — or,
 * for a third of them, banks of 0 … 3 and no reserve at all — and,
 * half the time, a paid commitment for the side NOT to move on a legal spawn
 * square. Openings put the armies two or three plies apart; these put them
 * anywhere from adjacent to across the board, with money to buy and promote,
 * so the purchase, promotion and both-sides-close clauses of the bound are the
 * ones under test.
 */
export function sparseStarts(count: number, seed: number): StartPosition[] {
  const rep = new Replica();
  const rng = seededRandom(seed);
  const defs = UNIT_DEFINITIONS.map(d => d.id);
  const out: StartPosition[] = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 4) {
    attempts++;
    const taken = new Set<number>();
    const units: AuthoredUnit[] = [];
    for (const owner of ['white', 'black'] as const) {
      const n = 1 + Math.floor(rng() * SPARSE_MAX_BODIES);
      for (let i = 0; i < n; i++) {
        let s = Math.floor(rng() * 100);
        while (taken.has(s)) s = (s + 7) % 100;
        taken.add(s);
        units.push({ def: defs[Math.floor(rng() * defs.length)], owner, x: s % 10, y: Math.floor(s / 10) });
      }
    }
    const current: PlayerId = rng() < WHITE_TO_MOVE_SHARE ? 'white' : 'black';
    // A third of the boards are POOR (banks 0 … 3, no reserve anywhere): the
    // bodies on the board are then nearly all there is, and bounds run long.
    const poor = rng() < SPARSE_POOR_SHARE;
    const bank = poor ? SPARSE_POOR_MAX_BANK : SPARSE_MAX_BANK;
    const spec: AuthoredSpec = {
      units,
      white: Math.floor(rng() * (bank + 1)),
      black: Math.floor(rng() * (bank + 1)),
      reserve: poor ? 0 : Math.floor(rng() * (SPARSE_MAX_RESERVE + 1)),
      current,
    };
    let state = authoredState(spec);
    if (rng() < SPARSE_PENDING_SHARE) {
      const other: PlayerId = current === 'white' ? 'black' : 'white';
      const squares = getAllSpawnPositions(other, state.board);
      if (squares.length > 0) {
        const q = squares[Math.floor(rng() * squares.length)];
        const tier1 = UNIT_DEFINITIONS.filter(d => d.tier === 1);
        const def = tier1[Math.floor(rng() * tier1.length)].id;
        state = authoredState({ ...spec, pending: [{ def, owner: other, x: q.x, y: q.y }] });
      }
    }
    let p: PackedState;
    try {
      p = rep.pack(state);
    } catch {
      continue;
    }
    if (p.result !== Result.ONGOING) continue;
    out.push({ id: `sparse-${seed}-${attempts}`, p });
  }
  return out;
}

// ---------------------------------------------------------------------------
// check 1: playouts
// ---------------------------------------------------------------------------

export interface Violation {
  kind: 'playout' | 'exhaustive';
  id: string;
  side: Side;
  bound: number;
  firstKill: number;
  detail: string;
}

export interface PlayoutMetrics {
  positions: number;
  playouts: number;
  /** Sides that made at least one kill inside the playout horizon. */
  kills: number;
  violations: number;
  /** First kills that landed exactly on the bound. */
  tightHits: number;
  /** Histogram of `firstKill − bound` over observed first kills (last bucket: that many or more). */
  slack: number[];
  /** Histogram of bounds computed at the start positions (index = plies, capped). */
  bounds: number[];
  mismatches: Violation[];
}

/** The bound under test: `killEta` unless a test injects a deliberately
 * wrong one to prove the oracle can catch it. */
export type BoundFn = (p: PackedState, side: Side) => number;

export function checkPlayouts(starts: readonly StartPosition[], playoutsPer: number, seed: number, boundFn?: BoundFn): PlayoutMetrics {
  const rep = new Replica();
  const ws = newKillEtaScratch();
  const bound0: BoundFn = boundFn ?? ((p, side) => killEta(p, side, {}, ws).plies);
  const work = allocState();
  const walker = newWalker(rep);
  const m: PlayoutMetrics = {
    positions: 0, playouts: 0, kills: 0, violations: 0, tightHits: 0,
    slack: new Array<number>(SLACK_BUCKETS).fill(0), bounds: new Array<number>(KILL_ETA_HORIZON + 2).fill(0), mismatches: [],
  };
  let s = 0;
  for (const start of starts) {
    if (start.p.result !== Result.ONGOING) continue;
    m.positions++;
    const bound: [number, number] = [bound0(start.p, 0), bound0(start.p, 1)];
    m.bounds[Math.min(bound[0], m.bounds.length - 1)]++;
    m.bounds[Math.min(bound[1], m.bounds.length - 1)]++;
    for (let k = 0; k < playoutsPer; k++) {
      const rng = seededRandom((seed * PLAYOUT_SEED_STRIDE + s++) >>> 0);
      const policies = POLICY_PAIRS[k % POLICY_PAIRS.length];
      const r = playout(rep, start.p, policies, rng, PLAYOUT_PLIES, work, walker);
      m.playouts++;
      for (const side of [0, 1] as const) {
        const first = r.firstKill[side];
        if (first === Infinity) continue;
        m.kills++;
        const slack = first - bound[side];
        if (slack === 0) m.tightHits++;
        if (slack >= 0) m.slack[Math.min(SLACK_BUCKETS - 1, slack)]++;
        if (first < bound[side]) {
          m.violations++;
          if (m.mismatches.length < MAX_REPORTED) {
            m.mismatches.push({
              kind: 'playout', id: start.id, side, bound: bound[side], firstKill: first,
              detail: `policies ${policies.join('/')} seed ${(seed * PLAYOUT_SEED_STRIDE + s - 1) >>> 0} line ${JSON.stringify(r.line)}`,
            });
          }
        }
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// check 2: exhaustive search on small positions
// ---------------------------------------------------------------------------

export interface ExhaustiveResult {
  /** Earliest ply ≤ maxPly in which `side` can kill, or `maxPly + 1`. */
  ply: number;
  nodes: number;
  truncated: boolean;
}

/**
 * Every legal line of the first `maxPly` plies from `root`: the earliest ply
 * in which an ATTACK by `side` removes a unit. Deduplicated on
 * `Replica.digest` (order-blind, exact) per ply; lines at or beyond the best
 * ply found so far are not explored. `truncated` when `nodeLimit` was hit —
 * the result is then not evidence.
 */
export function exhaustiveFirstKill(root: PackedState, side: Side, maxPly: number, nodeLimit = EXHAUSTIVE_NODE_LIMIT): ExhaustiveResult {
  const rep = new Replica();
  const p = allocState();
  copyState(p, root);
  const undo = newUndo();
  const keeps: KeepSetTable[] = [];
  const bufs: Int32Array[] = [];
  const seen = new Set<string>();
  let best = maxPly + 1;
  let nodes = 0;
  let truncated = false;

  const visit = (depth: number, ply: number): void => {
    if (truncated || ply >= best || p.result !== Result.ONGOING) return;
    if (++nodes > nodeLimit) {
      truncated = true;
      return;
    }
    const key = `${ply}|${rep.digest(p)}`;
    if (seen.has(key)) return;
    seen.add(key);
    while (bufs.length <= depth) {
      bufs.push(new Int32Array(GEN_CAPACITY));
      keeps.push(newKeepSetTable());
    }
    const buf = bufs[depth];
    const keep = keeps[depth];
    let n: number;
    if (p.upkeepPending === 1) {
      n = rep.genKeepSets(p, keep);
      for (let i = 0; i < n; i++) buf[i] = paMake(AKind.PAY_UPKEEP, i);
    } else {
      n = p.phase === 1 ? rep.genActions(p, buf) : rep.genPlace(p, buf);
    }
    for (let i = 0; i < n && !truncated; i++) {
      const a = buf[i];
      const kind = paKind(a);
      const mover = p.side;
      const victim = kind === AKind.ATTACK ? p.pieceAt[paB(a)] : NO_SLOT;
      rep.make(p, a, undo, keep);
      if (kind === AKind.ATTACK && mover === side && victim !== NO_SLOT && p.sq[victim] === DEAD) {
        if (ply < best) best = ply;
      } else if (kind === AKind.END_PLACE) {
        visit(depth + 1, ply + 1);
      } else {
        visit(depth + 1, ply);
      }
      rep.unmake(p, undo);
      if (ply >= best) break;
    }
  };
  visit(0, 1);
  return { ply: best, nodes, truncated };
}

export interface AuthoredCase {
  id: string;
  state: GameState;
  side: Side;
  /** Plies the exhaustive search covers. */
  maxPly: number;
  /** The exhaustive answer the case was authored to produce (`maxPly + 1` = none). */
  expectExhaustive: number;
  /** The bound the case was authored to produce. */
  expectBound: number;
}

export interface AuthoredUnit {
  def: string;
  owner: PlayerId;
  x: number;
  y: number;
  damage?: number;
}

export interface AuthoredSpec {
  units: AuthoredUnit[];
  pending?: { def: string; owner: PlayerId; x: number; y: number }[];
  white?: number;
  black?: number;
  /** `inactivityPlies`. */
  clock?: number;
  current?: PlayerId;
  /** One reserve value for every square (default 0: no income anywhere). */
  reserve?: number;
}

/**
 * A Phasing position with exactly the given bodies, banks and clock, the side
 * to move at the start of its Act. Deterministic ids, so replays and digests
 * are stable. Built on `createInitialGameState` so every rules field carries
 * its live default.
 */
export function authoredState(spec: AuthoredSpec): GameState {
  const layout = new Array<number>(100).fill(spec.reserve ?? 0);
  const base = createInitialGameState(layout, 4, 0, 'phasing');
  const units: Unit[] = spec.units.map((u, i) => ({
    id: `k${i}`,
    definitionId: u.def,
    owner: u.owner,
    position: { x: u.x, y: u.y },
    hasMoved: false,
    hasAttacked: false,
    attackedThisTurn: [],
    lastAttackKilled: false,
    canActThisTurn: true,
    damageTaken: u.damage ?? 0,
    placedThisTurn: false,
    promotedThisPlacement: false,
  }));
  const pendingSummons: PendingSummon[] = (spec.pending ?? []).map((q, i) => ({
    id: `kq${i}`,
    owner: q.owner,
    definitionId: q.def,
    position: { x: q.x, y: q.y },
    cost: getUnitDefinition(q.def).cost,
  }));
  return {
    ...base,
    board: { ...base.board, units },
    pendingSummons,
    inactivityPlies: spec.clock ?? 0,
    players: {
      white: { ...base.players.white, resources: spec.white ?? 0 },
      black: { ...base.players.black, resources: spec.black ?? 0 },
    },
    turn: { ...base.turn, currentPlayer: spec.current ?? 'white' },
  };
}

/**
 * Small positions whose exhaustive first kill is known by hand, each chosen to
 * exercise one clause of the bound: the mover's exact first window, the
 * defender walking into the attack, a one-square-short approach, a 0-power
 * attacker, and a kill only a PURCHASE can make. Reserves are empty so no
 * income muddies the purchase cases; the searches stay within seconds.
 */
export function killEtaExhaustiveCases(): AuthoredCase[] {
  const W: Side = 0;
  const B: Side = 1;
  return [
    {
      // fire_1 → plant_1 is 2 + 1 = 3 ≥ DEF 3: one adjacent hit.
      id: 'adjacent-hit', side: W, maxPly: 1, expectBound: 1, expectExhaustive: 1,
      state: authoredState({ units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
      ] }),
    },
    {
      // The reply kills: Black's fire_1 is three squares from a lane of White's
      // plant_1 — two moves and the hit. White's plant_1 (ATK 0, disadvantaged
      // against fire) can never kill anything, and has no crystals.
      id: 'reply-closes', side: B, maxPly: 2, expectBound: 2, expectExhaustive: 2,
      state: authoredState({ units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'fire_1', owner: 'black', x: 4, y: 8 },
      ] }),
    },
    {
      id: 'reply-closes/mover-never', side: W, maxPly: 2, expectBound: KILL_ETA_HORIZON + 1, expectExhaustive: 3,
      state: authoredState({ units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'fire_1', owner: 'black', x: 4, y: 8 },
      ] }),
    },
    {
      // water_1 (speed 1) five squares from a fire_1: four steps reach the lane
      // and leave no action for the hit, so ply 1 is out; ply 3 is not.
      id: 'one-square-short', side: W, maxPly: 3, expectBound: 3, expectExhaustive: 3,
      state: authoredState({ units: [
        { def: 'water_1', owner: 'white', x: 2, y: 2 },
        { def: 'fire_1', owner: 'black', x: 2, y: 7 },
      ] }),
    },
    {
      // plant_1 against metal_1 is 0 + 0 = 0 power: adjacent, yet never a kill;
      // with no crystals there is no promotion or purchase to change that.
      id: 'zero-power-adjacent', side: W, maxPly: 3, expectBound: KILL_ETA_HORIZON + 1, expectExhaustive: 4,
      state: authoredState({ units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'black', x: 5, y: 4 },
      ] }),
    },
    {
      // White's only body is a speed-0 metal_1 whose hit on plant_1 is
      // 1 < DEF 3, so no live body can ever kill. Three crystals buy a fire_1
      // (2 + 1 = 3 against plant) in Prepare 1; it arrives in White's
      // rectangle at ply 3 and reaches the plant_1 the reply walked toward it.
      id: 'purchase-kills', side: W, maxPly: 3, expectBound: 3, expectExhaustive: 3,
      state: authoredState({ white: 3, units: [
        { def: 'metal_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ] }),
    },
    {
      id: 'purchase-kills/broke', side: W, maxPly: 3, expectBound: KILL_ETA_HORIZON + 1, expectExhaustive: 4,
      state: authoredState({ white: 0, units: [
        { def: 'metal_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ] }),
    },
  ];
}

export interface ExhaustiveMetrics {
  cases: number;
  violations: number;
  truncated: number;
  /** Cases where the exhaustive first kill equals the bound. */
  tight: number;
  rows: { id: string; side: Side; bound: number; exhaustive: number; nodes: number; truncated: boolean }[];
  mismatches: Violation[];
}

export function checkExhaustive(cases: readonly AuthoredCase[], boundFn?: BoundFn): ExhaustiveMetrics {
  const rep = new Replica();
  const bound0: BoundFn = boundFn ?? ((p, side) => killEta(p, side).plies);
  const m: ExhaustiveMetrics = { cases: 0, violations: 0, truncated: 0, tight: 0, rows: [], mismatches: [] };
  for (const c of cases) {
    const p = rep.pack(c.state);
    const bound = bound0(p, c.side);
    const ex = exhaustiveFirstKill(p, c.side, c.maxPly);
    m.cases++;
    m.rows.push({ id: c.id, side: c.side, bound, exhaustive: ex.ply, nodes: ex.nodes, truncated: ex.truncated });
    if (ex.truncated) {
      m.truncated++;
      continue;
    }
    // Only plies the search covered can falsify the bound.
    if (ex.ply <= c.maxPly && ex.ply < bound) {
      m.violations++;
      if (m.mismatches.length < MAX_REPORTED) {
        m.mismatches.push({ kind: 'exhaustive', id: c.id, side: c.side, bound, firstKill: ex.ply, detail: `nodes ${ex.nodes}` });
      }
    }
    if (ex.ply === bound) m.tight++;
  }
  return m;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

interface Args {
  positions: number;
  playouts: number;
  seed: number;
  exhaustive: boolean;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { positions: 400, playouts: 16, seed: 1, exhaustive: false, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--playouts') args.playouts = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--exhaustive') args.exhaustive = true;
    else if (a === '--out') args.out = path.resolve(argv[++i]);
    else throw new Error(`oracles/killeta: unrecognised argument "${a}"`);
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = process.hrtime.bigint();
  // A third of the budget each: the dev-book openings (always all of them),
  // prefixes played out of them, and sparse random boards.
  const openings = openingStarts();
  const rest = Math.max(0, args.positions - openings.length);
  const sampled = sampledStarts(openings, Math.ceil(rest / 2), args.seed);
  const sparse = sparseStarts(Math.floor(rest / 2), args.seed);
  const starts = [...openings, ...sampled, ...sparse];
  const playouts = checkPlayouts(starts, args.playouts, args.seed);
  const exhaustive = args.exhaustive ? checkExhaustive(killEtaExhaustiveCases()) : null;
  const metrics = {
    positions: playouts.positions,
    playouts: playouts.playouts,
    kills: playouts.kills,
    violations: playouts.violations,
    tightHits: playouts.tightHits,
    slack: playouts.slack,
    bounds: playouts.bounds,
    exhaustive,
    mismatches: [...playouts.mismatches, ...(exhaustive?.mismatches ?? [])].slice(0, MAX_REPORTED),
    elapsedMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
    seed: args.seed,
    node: process.version,
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`oracles/killeta: wrote ${args.out}`);
  console.log(JSON.stringify({
    positions: metrics.positions, playouts: metrics.playouts, kills: metrics.kills,
    violations: metrics.violations, tightHits: metrics.tightHits,
    exhaustiveViolations: exhaustive?.violations ?? null, exhaustiveTruncated: exhaustive?.truncated ?? null,
    elapsedMs: metrics.elapsedMs,
  }));
  if (metrics.violations > 0 || (exhaustive !== null && (exhaustive.violations > 0 || exhaustive.truncated > 0))) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
