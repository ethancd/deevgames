/**
 * The root: the must-answer layer, the book probe, and the canonical replay
 * (DESIGN §4.16 `root.ts`, §5.10, §1 step 4).
 *
 * Before a single node of iterative deepening is spent, the root asks the four
 * questions a search that merely "scores well" can get wrong, in DESIGN
 * §5.10's order, and returns the moment one of them is PROVEN by the canonical
 * engine:
 *
 *   1 HOME RACE with purchases (F13) — the line SU addendum 20b found and
 *     SF's must-answer layer could not: buy a tier-1 body and walk it into the
 *     enemy corner this turn. `tables/home.ts homeRaceAvailable` enumerates the
 *     lines and `gen/generate.ts` injects each one FORCED, so they are already
 *     in the candidate list; the root only has to APPLY each and ask whether
 *     the replica's home gate declared a win, then confirm it canonically.
 *   2 ELIMINATION-IN-1 — a lethal attack on the last enemy body.
 *   3 HOME RESCUE — when the enemy stands on my corner, the prover's own
 *     witness line. `tactics/prover.ts homeWitness` supplies it and DESIGN §2's
 *     layering keeps `gen` from calling `tactics` directly, so the root wires
 *     it in through `TurnGenerator.setRescueWitness` (`installRescueWitness`
 *     below) and the ordering's `HOME_RESCUE +1,500,000` puts it first.
 *   4 HOME MATE-IN-1 — a corner entry by a body that already exists.
 *
 * 1, 2 and 4 all reduce to the same test — "does applying this candidate end
 * the game in the mover's favour, and does the CANONICAL engine agree?" — so
 * they are one scan in flag order rather than four separate enumerations.
 *
 * "Does the canonical engine agree" is TWO questions, and the second one is
 * easy to miss: `Kpos` carries the board, the banks, the side, the reserves and
 * the clock, but NOT `result`/`reason`. A replica that declared a home
 * checkmate the canonical prover does not would still match the `Kpos` of the
 * position it reached, and the root would return a "proven" win that is merely
 * a unit standing on a corner. Every proven terminal is therefore checked
 * against the canonical END STATE — `phase === 'victory'` with the mover as
 * `winner` — and a disagreement is counted as a replica divergence and the
 * candidate dropped.
 *
 * Nothing leaves here unverified: the chosen turn is decoded, replayed through
 * `applyAction` with `isLegalAction` before every action, and its end position
 * re-packed and compared (`verify/replay.ts`). A divergence truncates the line
 * at the first bad action and is counted in `stats.replicaDivergences`.
 *
 * LAYERING. DESIGN §4.16 types `searchRoot`'s first parameter `HardEngine`,
 * which lives one layer up (`engine.ts` imports `search`, not the other way
 * round). It is typed structurally as `RootEngine` here — the same arrangement
 * `tactics/prover.ts` uses for `ProverMeter` — and `HardEngine` satisfies it.
 * See DEVIATIONS under M14.
 */
import type { GameState } from '../../../game/types';
import { phaseEndAction } from '../../../game/legality';
import type { AIAction } from '../../types';
import { MATE_PLY_CC, Result, WIN_CC, type Centi, type PackedState, type Side } from '../types';
import { PackError } from '../core/state';
import { AKind, KEEP_SET_CAPACITY, paKind, paMake, type KeepSetTable } from '../core/action';
import { buildTables } from '../tables/context';
import { PROOF_NODES, WITNESS_KEEP, homeWitness } from '../tactics/prover';
import { TurnFlag, type Turn } from '../gen/turn';
import type { TurnGenerator } from '../gen/generate';
import { probeBook } from '../book/probe';
import { verifyTurn, type ReplayCheck } from '../verify/replay';
import type { HardConfig } from '../config';
import { WorkClass } from './time';
import {
  PROVER_FULL,
  copyTurn,
  generateAt,
  iterativeDeepening,
  makeTurn,
  unmakeTurn,
  type HardSearchStats,
  type SearchContext,
} from './pvs';

export type RootSource = 'search' | 'home-race' | 'mate' | 'rescue' | 'dfpn' | 'book' | 'fallback';

export interface RootOptions {
  work: number;
  config: HardConfig;
  canonical: GameState;
  onProgress?: (p: { depth: number; scoreCc: Centi; work: number; firstAction: AIAction | null }) => void;
}

export interface RootResult {
  actions: AIAction[];
  scoreCc: Centi;
  depth: number;
  work: number;
  stats: HardSearchStats;
  source: RootSource;
  endKey: string;
  fallback?: 'pack-error' | 'engine-error' | 'divergence';
}

/** The slice of `engine.ts`'s `HardEngine` the root needs (see the header). */
export interface RootEngine {
  readonly ctx: SearchContext;
  /** The engine's own root `PackedState` buffer. */
  readonly rootState: PackedState;
}

function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

/** Words per keep-set in `core/action.ts`'s layout (one 128-bit slot mask).
 * Derived rather than written down, so a change to `MAX_SLOTS` cannot make the
 * copy below read half a mask. */
const KEEP_WORDS = WITNESS_KEEP.masks.length / KEEP_SET_CAPACITY;

/**
 * Makes the node's keep-set table carry the prover's witness keep-set and
 * returns its index there, or -1 when the table is full.
 *
 * `tactics/prover.ts` writes the witness's keep-set into its own private
 * `WITNESS_KEEP` at index 0 and emits `PAY_UPKEEP 0` against it (DESIGN §4.14).
 * The generator replays the line against the NODE's table, where index 0 is
 * whatever `gen/upkeep.ts` ranked first — a different set of units, so the
 * witness would release the very bodies it is about to rescue with and the rest
 * of the line would not be legal. An identical set already in the table is
 * reused; otherwise the set is appended past the node's own, where the beam's
 * `PAY_UPKEEP` loop (which iterates the count `genKeepSets` returned, not
 * `keep.count`) will not walk into it.
 */
function adoptWitnessKeepSet(keep: KeepSetTable): number {
  const src = WITNESS_KEEP.masks;
  const dst = keep.masks;
  for (let i = 0; i < keep.count; i++) {
    let same = true;
    for (let w = 0; w < KEEP_WORDS; w++) {
      if (dst[i * KEEP_WORDS + w] !== src[w]) {
        same = false;
        break;
      }
    }
    if (same) return i;
  }
  if (keep.count >= KEEP_SET_CAPACITY) return -1;
  const index = keep.count;
  for (let w = 0; w < KEEP_WORDS; w++) dst[index * KEEP_WORDS + w] = src[w];
  keep.count = index + 1;
  return index;
}

/**
 * Wires DESIGN §5.6's injection 4 — the prover's rescue witness — into a
 * generator. `gen` may not import `tactics` (DESIGN §2), so the root owns the
 * connection; call it once per generator when the engine is built.
 *
 * The prover's line is written for the position at the DEFENDER'S UPKEEP, so it
 * always opens with `PAY_UPKEEP` (`tactics/prover.ts homeWitness`). Two
 * adjustments make it a line the generator's node can actually play, and
 * without them injection 4 is dead in every position:
 *
 *   - no upkeep pending: `PAY_UPKEEP` is illegal, and `injectLine` aborts a
 *     line on the first illegal action that is not a phase terminator — so the
 *     whole witness was being dropped. The opening action is removed instead.
 *   - upkeep pending: the action's keep-set index points into the prover's own
 *     table, so the set is adopted into the node's (`adoptWitnessKeepSet`) and
 *     the action re-indexed.
 *
 * See DEVIATIONS under M14.
 */
export function installRescueWitness(gen: TurnGenerator): void {
  gen.setRescueWitness((p, invader, out, keep) => {
    const n = homeWitness(p, invader, PROOF_NODES, out);
    if (n <= 0) return 0;
    if (p.upkeepPending !== 1) {
      // Drop the leading `PAY_UPKEEP` (and any other, though the witness emits
      // exactly one) rather than let it abort the line.
      let len = 0;
      for (let i = 0; i < n; i++) {
        if (paKind(out[i]) === AKind.PAY_UPKEEP) continue;
        out[len++] = out[i];
      }
      return len;
    }
    const index = adoptWitnessKeepSet(keep);
    if (index < 0) return 0;
    for (let i = 0; i < n; i++) {
      if (paKind(out[i]) === AKind.PAY_UPKEEP) out[i] = paMake(AKind.PAY_UPKEEP, index, 0, 0);
    }
    return n;
  });
}

/** The keep-set table the rescue witness's `PAY_UPKEEP` indexes into. */
export { WITNESS_KEEP };

/** The canonical engine's own verdict: the game is over and `mover` won. */
function canonicalWin(end: GameState, mover: Side): boolean {
  return end.phase === 'victory' && end.winner === (mover === 0 ? 'white' : 'black');
}

/** True when applying `t` left the game decided in `mover`'s favour. */
function decidedFor(p: PackedState, mover: Side): boolean {
  if (p.result === Result.ONGOING || p.result === Result.DRAW) return false;
  return (p.result === Result.WHITE_WIN) === (mover === 0);
}

interface ProvenTerminal {
  index: number;
  source: RootSource;
  check: ReplayCheck;
}

/**
 * DESIGN §5.10 items 1, 2 and 4. Scans the root candidates in the order the
 * must-answer layer prescribes and returns the first whose application decides
 * the game for the mover AND survives the canonical replay.
 */
function mustAnswer(
  s: SearchContext,
  p: PackedState,
  state: GameState,
  n: number,
): ProvenTerminal | null {
  const mover = p.side as Side;
  const turns = s.turns[0];
  const keep = s.keep[0];
  // Flag masks in §5.10's order: home race, then elimination (a kill that ends
  // the game), then a corner entry by an existing body. A candidate carrying
  // none of them can still be a terminal — the last enemy body dying to a
  // Cleave chain, say — so the final pass considers everything.
  const passes = [TurnFlag.HOME_RACE, TurnFlag.KILL, TurnFlag.HOME_ENTRY, 0];
  const seen = new Uint8Array(n);
  for (let pass = 0; pass < passes.length; pass++) {
    const mask = passes[pass];
    for (let i = 0; i < n; i++) {
      if (seen[i] === 1) continue;
      const turn = turns[i];
      if (mask !== 0 && (turn.flags & mask) === 0) continue;
      seen[i] = 1;
      p.proverMode = PROVER_FULL;
      const applied = makeTurn(s, p, turn, keep);
      const decided = applied === turn.count && decidedFor(p, mover);
      unmakeTurn(s, p, applied);
      if (!decided) continue;
      const check = verifyTurn(s.rep, state, p, turn, keep);
      if (!check.verified || !canonicalWin(check.endState, mover)) {
        s.stats.replicaDivergences++;
        continue;
      }
      const source: RootSource = (turn.flags & TurnFlag.HOME_RACE) !== 0 ? 'home-race' : 'mate';
      return { index: i, source, check };
    }
  }
  return null;
}

/**
 * DESIGN §4.16. One whole turn from `state`, as canonical `AIAction`s.
 *
 * `opts.work` is the meter's budget in work units; it is always set by
 * `engine.ts` (from `chooseWork`, or verbatim from a lab/CI caller), so nothing
 * below reads a clock.
 */
export function searchRoot(engine: RootEngine, state: GameState, opts: RootOptions): RootResult {
  const s = engine.ctx;
  const stats = s.stats;

  let p: PackedState;
  try {
    p = s.rep.pack(state, engine.rootState);
  } catch (err) {
    return {
      actions: [],
      scoreCc: 0,
      depth: 0,
      work: 0,
      stats,
      source: 'fallback',
      endKey: '',
      fallback: err instanceof PackError ? 'pack-error' : 'engine-error',
    };
  }

  if (p.result !== Result.ONGOING) {
    return { actions: [], scoreCc: 0, depth: 0, work: 0, stats, source: 'fallback', endKey: keyHex(p.kposHi, p.kposLo) };
  }

  // The full prover adjudicates a corner entry inside `make` at the root.
  p.proverMode = PROVER_FULL;
  s.root = p.side as Side;
  s.meter.reset(opts.work);
  const t = buildTables(p, s.sc, 0, 2, s.tables[0]);
  s.meter.spend(WorkClass.KILLTABLE);

  const n = generateAt(s, p, t, 0);
  if (n === 0) {
    // DESIGN F7 forbids an empty list; if it ever happens the turn still has
    // to end legally.
    return {
      actions: [phaseEndAction(state)],
      scoreCc: 0,
      depth: 0,
      work: s.meter.used,
      stats,
      source: 'fallback',
      endKey: keyHex(p.kposHi, p.kposLo),
    };
  }

  const proven = mustAnswer(s, p, state, n);
  if (proven !== null) {
    const turn = s.turns[0][proven.index];
    copyTurn(s.rootBest, turn);
    s.rootHasBest = true;
    stats.work = s.meter.used;
    stats.depth = 1;
    return {
      actions: proven.check.actions,
      scoreCc: WIN_CC - MATE_PLY_CC,
      depth: 1,
      work: s.meter.used,
      stats,
      source: proven.source,
      endKey: keyHex(turn.endHi, turn.endLo),
    };
  }

  const book = opts.config.book;
  if (book !== null && book.size > 0) {
    const hit = probeBook(book, p, s.turns[0], n);
    if (hit >= 0) {
      const turn = s.turns[0][hit];
      const check = verifyTurn(s.rep, state, p, turn, s.keep[0]);
      if (check.verified) {
        copyTurn(s.rootBest, turn);
        s.rootHasBest = true;
        stats.work = s.meter.used;
        return {
          actions: check.actions,
          scoreCc: turn.gainCc,
          depth: 0,
          work: s.meter.used,
          stats,
          source: 'book',
          endKey: keyHex(turn.endHi, turn.endLo),
        };
      }
      stats.replicaDivergences++;
    }
  }

  const onDepth =
    opts.onProgress === undefined
      ? undefined
      : (r: { depth: number; scoreCc: Centi; best: Turn | null }): void => {
          const progress = opts.onProgress;
          if (progress === undefined) return;
          let firstAction: AIAction | null = null;
          if (r.best !== null) {
            const check = verifyTurn(s.rep, state, p, r.best, s.keep[0]);
            firstAction = check.actions.length > 0 ? check.actions[0] : null;
          }
          progress({ depth: r.depth, scoreCc: r.scoreCc, work: s.meter.used, firstAction });
        };

  const result = iterativeDeepening(s, p, onDepth);
  stats.work = s.meter.used;

  if (result.best === null) {
    return {
      actions: [phaseEndAction(state)],
      scoreCc: result.scoreCc,
      depth: result.depth,
      work: s.meter.used,
      stats,
      source: 'fallback',
      endKey: keyHex(p.kposHi, p.kposLo),
    };
  }

  const check = verifyTurn(s.rep, state, p, result.best, s.keep[0]);
  const rescue = (result.best.flags & TurnFlag.HOME_RESCUE) !== 0 && t.home[s.root].occupied === 1;
  if (!check.verified) {
    stats.replicaDivergences++;
    const actions = check.actions.length > 0 ? check.actions : [phaseEndAction(state)];
    return {
      actions,
      scoreCc: result.scoreCc,
      depth: result.depth,
      work: s.meter.used,
      stats,
      source: check.actions.length > 0 ? 'search' : 'fallback',
      endKey: keyHex(result.best.endHi, result.best.endLo),
      fallback: 'divergence',
    };
  }

  return {
    actions: check.actions,
    scoreCc: result.scoreCc,
    depth: result.depth,
    work: s.meter.used,
    stats,
    source: rescue ? 'rescue' : 'search',
    endKey: keyHex(result.best.endHi, result.best.endLo),
  };
}
