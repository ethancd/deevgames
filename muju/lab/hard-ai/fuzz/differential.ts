/**
 * The three-surface differential fuzzer (DESIGN §7.3). M5 builds the first two
 * surfaces; the `prover` surface lands with `tactics/prover.ts` at M10.
 *
 * | surface | A (canonical) | B (replica) | compared |
 * |---|---|---|---|
 * | transition | `applyAction` (simulate.ts:25) | `Replica.make` | the 24-field digest, `Kpos`, `Kturn`, `occHash` and the incremental sums after EVERY action, plus the `unmake(make(a))` identity |
 * | legality | `generateAllActions` + the `getMovementRange` multi-action expansion | `genActions`/`genPlace`/`genKeepSets` | the legal-action set as a sorted multiset of canonical `AIAction`s |
 *
 * Games are seeded (`seededRandom`, `src/ai/runtime.ts:3`) and randomise
 * `victoryRule`, `inactivityRule`, `reviewUpkeep` per player and
 * `blackCrystalHandicap ∈ {0, 3}`; some games clear `canActThisTurn` on a
 * random unit mid-game (DESIGN F2). The harness invariants
 * (`lab/harness/invariants.ts:21-75`) run after every action, and every 64th
 * node re-derives `Kpos`/`Kturn`/`occHash` from scratch and runs
 * `Replica.check`.
 *
 * Actions are drawn from the REPLICA's generator and decoded to canonical
 * `AIAction`s, so every applied action exercises `genActions`/`genPlace`/
 * `genKeepSets` even on plies where the (much more expensive) full legality
 * comparison does not run. An action the canonical engine would reject is
 * therefore caught twice: by the explicit `isLegalAction` assertion below and
 * by the digest comparison, since `applyAction` returns its input unchanged on
 * a rejected action.
 *
 * KEEP-SET COMPLETENESS. `upkeepActions` (upkeep.ts:34-55) enumerates every
 * affordable subset of up to twelve rent-bearing units, which can exceed the
 * 64-entry `KeepSetTable` DESIGN §3.2/§5.10 caps the replica at. The legality
 * surface therefore requires (a) soundness always — every keep-set the replica
 * emits is accepted by `isUpkeepSelectionLegal` — and (b) set equality only
 * when the replica did not truncate (`count < KEEP_SET_CAPACITY`), which is
 * the only case in which equality is defined. Truncated nodes are counted in
 * `legalityKeepSetTruncations`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId, Unit } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { createInitialGameState } from '../../../src/game/board';
import { getMovementRange } from '../../../src/game/movement';
import { getUnitDefinition } from '../../../src/game/units';
import { isLegalAction } from '../../../src/game/legality';
import { upkeepActions } from '../../../src/game/upkeep';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { seededRandom } from '../../../src/ai/runtime';
import { MAX_SLOTS, Result, type PackedState } from '../../../src/ai/hard/types';
import {
  AKind,
  KEEP_SET_CAPACITY,
  newKeepSetTable,
  paKind,
  paMake,
  toAIAction,
  type KeepSetTable,
  type PA,
} from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { recomputeKpos, recomputeKturn, recomputeOccHash } from '../../../src/ai/hard/core/zobrist';
import { checkInvariants } from '../../harness/invariants';
import { DEFAULT_RULES, type RulesBlock, type StoredPosition } from '../positions/corpus';

export type Surface = 'transition' | 'legality';

export interface FuzzOptions {
  seed: number;
  /** Total actions to apply across all games. */
  actions: number;
  surfaces: ReadonlySet<Surface>;
  /** Run the (expensive) legality comparison once every N actions. */
  legalityEvery: number;
  /** Plies per game before the game is abandoned (DESIGN §7.3: 500). */
  plies: number;
  /** Directory for self-contained reproducers, or null to skip writing them. */
  reproDir: string | null;
  /** Macro-node positions to sample for `positions/fuzz-<n>.jsonl`. */
  sample: number;
}

export interface FuzzMetrics {
  seed: number;
  surfaces: Surface[];
  legalityEvery: number;
  games: number;
  plies: number;
  actions: number;
  divergences: number;
  legalityChecks: number;
  legalitySetMismatches: number;
  legalityKeepSetTruncations: number;
  unmakeMismatches: number;
  rehashMismatches: number;
  invariantViolations: number;
  canActClearedGames: number;
  reviewUpkeepGames: number;
  eliminationRuleGames: number;
  drawRuleOffGames: number;
  handicapGames: number;
  terminals: Record<string, number>;
  sampled: number;
  elapsedMs: number;
}

export interface FuzzResult {
  metrics: FuzzMetrics;
  samples: StoredPosition[];
}

/** Per-action buffer: 4 attacks + 100 destinations per slot, plus the phase-ender. */
const GEN_CAPACITY = 4 + MAX_SLOTS * 104;

interface Divergence {
  kind: 'transition' | 'unmake' | 'rehash' | 'legality' | 'invariant';
  seed: number;
  game: number;
  ply: number;
  field: string;
  action: AIAction | null;
  prefix: AIAction[];
  rules: RulesBlock;
  replica?: string;
  canonical?: string;
  state: GameState;
}

function normalize(a: AIAction): string {
  switch (a.type) {
    case 'MOVE':
      return `M:${a.unitId}:${a.to.y * 10 + a.to.x}`;
    case 'ATTACK':
      return `A:${a.unitId}:${a.targetPosition.y * 10 + a.targetPosition.x}`;
    case 'BUY_UNIT':
      return `B:${a.definitionId}:${a.position.y * 10 + a.position.x}`;
    case 'PROMOTE_UNIT':
      return `P:${a.unitId}`;
    case 'PAY_UPKEEP':
      return `U:${[...a.keepUnitIds].sort().join(',')}`;
    case 'END_PLACE_PHASE':
      return 'EP';
    case 'END_ACTION_PHASE':
      return 'EA';
    case 'RESIGN':
      return 'R';
    default:
      return `?:${JSON.stringify(a)}`;
  }
}

/**
 * The canonical legal-action set, with MOVEs expanded to every multi-action
 * destination `legality.ts:43-44` accepts (DESIGN §4.4).
 */
function canonicalLegalSet(state: GameState): string[] {
  const player: PlayerId = state.turn.currentPlayer;
  const out: string[] = [];
  for (const a of generateAllActions(state, player)) {
    if (a.type === 'MOVE') continue;
    out.push(normalize(a));
  }
  if (!state.upkeepPending && state.turn.phase === 'action' && state.turn.actionsRemaining > 0) {
    const budget = state.turn.actionsRemaining;
    for (const u of state.board.units) {
      if (u.owner !== player || !u.canActThisTurn) continue;
      const speed = getUnitDefinition(u.definitionId).speed;
      for (const r of getMovementRange(u.position, speed, budget, state.board)) {
        const cost = budget - r.actionsRemaining;
        if (cost < 1 || cost > budget) continue;
        out.push(`M:${u.id}:${r.position.y * 10 + r.position.x}`);
      }
    }
  }
  return out.sort();
}

/** Compares two packed states field by field; returns the first difference or null. */
function firstDifference(a: PackedState, b: PackedState): string | null {
  for (let s = 0; s < 100; s++) {
    const sa = a.pieceAt[s];
    const sb = b.pieceAt[s];
    const emptyA = sa === 255;
    const emptyB = sb === 255;
    if (emptyA !== emptyB) return `occupancy@${s}`;
    if (emptyA) continue;
    if (a.owner[sa] !== b.owner[sb]) return `owner@${s}`;
    if (a.defId[sa] !== b.defId[sb]) return `defId@${s}`;
    if (a.damage[sa] !== b.damage[sb]) return `damage@${s}`;
    if (a.atkCount[sa] !== b.atkCount[sb]) return `atkCount@${s}`;
    if ((a.uflags[sa] & 15) !== (b.uflags[sb] & 15)) return `uflags@${s}`;
  }
  for (let s = 0; s < 100; s++) if (a.reserve[s] !== b.reserve[s]) return `reserve@${s}`;
  const scalars: [string, number, number][] = [
    ['kposLo', a.kposLo, b.kposLo],
    ['kposHi', a.kposHi, b.kposHi],
    ['kturnLo', a.kturnLo, b.kturnLo],
    ['kturnHi', a.kturnHi, b.kturnHi],
    ['occHash', a.occHash, b.occHash],
    ['bank0', a.bank[0], b.bank[0]],
    ['bank1', a.bank[1], b.bank[1]],
    ['gained0', a.gained[0], b.gained[0]],
    ['gained1', a.gained[1], b.gained[1]],
    ['side', a.side, b.side],
    ['phase', a.phase, b.phase],
    ['actions', a.actions, b.actions],
    ['turnNumber', a.turnNumber, b.turnNumber],
    ['upkeepPending', a.upkeepPending, b.upkeepPending],
    ['clock', a.clock, b.clock],
    ['progress', a.progress, b.progress],
    ['handicap', a.handicap, b.handicap],
    ['victoryHome', a.victoryHome, b.victoryHome],
    ['drawRuleOn', a.drawRuleOn, b.drawRuleOn],
    ['reviewUpkeep0', a.reviewUpkeep[0], b.reviewUpkeep[0]],
    ['reviewUpkeep1', a.reviewUpkeep[1], b.reviewUpkeep[1]],
    ['result', a.result, b.result],
    ['reason', a.reason, b.reason],
    ['materialCc0', a.materialCc[0], b.materialCc[0]],
    ['materialCc1', a.materialCc[1], b.materialCc[1]],
    ['pstSumCc0', a.pstSumCc[0], b.pstSumCc[0]],
    ['pstSumCc1', a.pstSumCc[1], b.pstSumCc[1]],
  ];
  for (const [name, x, y] of scalars) if (x !== y) return name;
  return null;
}

function terminalName(state: GameState): string {
  if (state.phase !== 'victory') return 'unfinished';
  return `${state.victoryReason ?? 'unknown'}:${state.winner ?? 'draw'}`;
}

export function runFuzz(options: FuzzOptions): FuzzResult {
  const started = Date.now();
  const replica = new Replica();
  const undo = newUndo();
  const keep = newKeepSetTable();
  const canonicalPacked = allocState();
  const genBuffer = new Int32Array(GEN_CAPACITY);

  const metrics: FuzzMetrics = {
    seed: options.seed,
    surfaces: [...options.surfaces].sort(),
    legalityEvery: options.legalityEvery,
    games: 0,
    plies: 0,
    actions: 0,
    divergences: 0,
    legalityChecks: 0,
    legalitySetMismatches: 0,
    legalityKeepSetTruncations: 0,
    unmakeMismatches: 0,
    rehashMismatches: 0,
    invariantViolations: 0,
    canActClearedGames: 0,
    reviewUpkeepGames: 0,
    eliminationRuleGames: 0,
    drawRuleOffGames: 0,
    handicapGames: 0,
    terminals: {},
    sampled: 0,
    elapsedMs: 0,
  };

  const divergences: Divergence[] = [];
  const buckets = new Map<number, StoredPosition[]>();

  const record = (d: Divergence): void => {
    if (divergences.length < 32) divergences.push(d);
    if (d.kind === 'transition') metrics.divergences++;
    else if (d.kind === 'unmake') metrics.unmakeMismatches++;
    else if (d.kind === 'rehash') metrics.rehashMismatches++;
    else if (d.kind === 'legality') metrics.legalitySetMismatches++;
    else metrics.invariantViolations++;
  };

  let game = 0;
  while (metrics.actions < options.actions) {
    const rng = seededRandom((options.seed + game * 7919) >>> 0);
    const rules: RulesBlock = {
      ...DEFAULT_RULES,
      handicap: rng() < 0.5 ? 3 : 0,
      victoryRule: rng() < 0.35 ? 'elimination' : 'home-or-elimination',
      inactivityRule: rng() < 0.35 ? 'off' : 'on',
    };
    const reviewWhite = rng() < 0.35;
    const reviewBlack = rng() < 0.35;
    if (rules.handicap !== 0) metrics.handicapGames++;
    if (rules.victoryRule === 'elimination') metrics.eliminationRuleGames++;
    if (rules.inactivityRule === 'off') metrics.drawRuleOffGames++;
    if (reviewWhite || reviewBlack) metrics.reviewUpkeepGames++;

    let state: GameState = {
      ...createInitialGameState(undefined, 4, rules.handicap),
      victoryRule: rules.victoryRule,
      inactivityRule: rules.inactivityRule,
      reviewUpkeep: { white: reviewWhite, black: reviewBlack },
    };
    let p = replica.pack(state);

    const clearsCanAct = rng() < 0.3;
    const clearAtPly = clearsCanAct ? Math.floor(rng() * 40) : -1;
    let clearedThisGame = false;
    const prefix: AIAction[] = [];

    for (let ply = 0; ply < options.plies && metrics.actions < options.actions; ply++) {
      if (state.phase !== 'playing') break;

      if (ply === clearAtPly && state.board.units.length > 0) {
        const index = Math.floor(rng() * state.board.units.length);
        const units: Unit[] = state.board.units.map((u, i) => (i === index ? { ...u, canActThisTurn: false } : u));
        state = { ...state, board: { ...state.board, units } };
        p = replica.pack(state);
        clearedThisGame = true;
      }

      // Generate on the replica; decode to the canonical vocabulary.
      let count: number;
      if (p.upkeepPending === 1) {
        count = replica.genKeepSets(p, keep);
        for (let i = 0; i < count; i++) genBuffer[i] = paMake(AKind.PAY_UPKEEP, i);
      } else if (p.phase === 0) {
        count = replica.genPlace(p, genBuffer);
      } else {
        count = replica.genActions(p, genBuffer);
      }
      if (count === 0) break;

      if (options.surfaces.has('legality') && metrics.actions % options.legalityEvery === 0) {
        metrics.legalityChecks++;
        checkLegalitySurface(p, state, keep, count, genBuffer, metrics, d =>
          record({ ...d, seed: options.seed, game, ply, prefix: [...prefix], rules, state }),
        );
      }

      const chosen = pickAction(rng, genBuffer, count);
      const action = toAIAction(p, chosen, keep);
      if (!isLegalAction(state, action)) {
        record({
          kind: 'legality',
          seed: options.seed,
          game,
          ply,
          field: 'replica-emitted-illegal-action',
          action,
          prefix: [...prefix],
          rules,
          state,
        });
        break;
      }

      const next = applyAction(state, action);
      const digestBefore = replica.digest(p);
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, chosen, undo, keep);

      // unmake identity
      replica.unmake(p, undo);
      if (replica.digest(p) !== digestBefore) {
        record({
          kind: 'unmake',
          seed: options.seed,
          game,
          ply,
          field: 'digest',
          action,
          prefix: [...prefix],
          rules,
          replica: replica.digest(p),
          canonical: digestBefore,
          state,
        });
        break;
      }
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, chosen, undo, keep);

      // A BUY reuses the lowest dead slot; carry the canonical id across so the
      // decoder keeps naming units exactly as `simulate.ts:14-20` does.
      if (action.type === 'BUY_UNIT') {
        const known = new Set(state.board.units.map(x => x.id));
        const fresh = next.board.units.find(x => !known.has(x.id));
        if (fresh) p.originIds[p.pieceAt[fresh.position.y * 10 + fresh.position.x]] = fresh.id;
      }

      if (options.surfaces.has('transition')) {
        replica.pack(next, canonicalPacked);
        const field = firstDifference(p, canonicalPacked);
        if (field !== null) {
          record({
            kind: 'transition',
            seed: options.seed,
            game,
            ply,
            field,
            action,
            prefix: [...prefix],
            rules,
            replica: replica.digest(p),
            canonical: replica.digest(canonicalPacked),
            state: next,
          });
          break;
        }
      }

      metrics.actions++;
      metrics.plies++;
      prefix.push(action);
      if (prefix.length > 600) prefix.shift();

      if (metrics.actions % 64 === 0) {
        const kpos = recomputeKpos(p);
        const kturn = recomputeKturn(p);
        const occHash = recomputeOccHash(p);
        if (kpos.lo !== p.kposLo || kpos.hi !== p.kposHi || kturn.lo !== p.kturnLo || kturn.hi !== p.kturnHi || occHash !== p.occHash) {
          record({ kind: 'rehash', seed: options.seed, game, ply, field: 'keys', action, prefix: [...prefix], rules, state: next });
        }
        try {
          replica.check(p);
        } catch (err) {
          record({
            kind: 'rehash',
            seed: options.seed,
            game,
            ply,
            field: `check: ${(err as Error).message}`,
            action,
            prefix: [...prefix],
            rules,
            state: next,
          });
        }
      }

      try {
        checkInvariants(next, `fuzz g${game} ply${ply}`);
      } catch (err) {
        record({
          kind: 'invariant',
          seed: options.seed,
          game,
          ply,
          field: (err as Error).message,
          action,
          prefix: [...prefix],
          rules,
          state: next,
        });
        break;
      }

      // A macro node is the state `startTurn` returns: the side to move changed.
      if (options.sample > 0 && next.phase === 'playing' && next.turn.currentPlayer !== state.turn.currentPlayer) {
        const turn = next.turn.turnNumber;
        let bucket = buckets.get(turn);
        if (bucket === undefined) {
          bucket = [];
          buckets.set(turn, bucket);
        }
        if (bucket.length < 64 || rng() < 0.05) {
          // `lastIncome`/`lastUpkeep` are per-turn telemetry no rule reads; they
          // would triple the stored line for nothing.
          const { lastIncome: _income, lastUpkeep: _upkeep, ...trimmed } = next;
          const stored: StoredPosition = {
            schema: 'muju-position-v1',
            id: `fuzz-${options.seed}-${game}-${ply}`,
            tags: ['fuzz', `turn-${turn}`],
            rationale: `Macro node sampled by the M5 differential fuzzer (seed ${options.seed}, game ${game}, ply ${ply}).`,
            depth: 2,
            rules: { ...rules, handicap: rules.handicap },
            state: trimmed,
          };
          if (bucket.length < 64) bucket.push(stored);
          else bucket[Math.floor(rng() * bucket.length)] = stored;
        }
      }

      state = next;
    }

    if (clearedThisGame) metrics.canActClearedGames++;
    const terminal = terminalName(state);
    metrics.terminals[terminal] = (metrics.terminals[terminal] ?? 0) + 1;
    metrics.games++;
    game++;
  }

  const samples = options.sample > 0 ? stratify(buckets, options.sample) : [];
  metrics.sampled = samples.length;
  metrics.elapsedMs = Date.now() - started;

  if (options.reproDir !== null && divergences.length > 0) {
    fs.mkdirSync(options.reproDir, { recursive: true });
    divergences.forEach((d, i) => {
      fs.writeFileSync(path.join(options.reproDir as string, `divergence-${i}.json`), JSON.stringify(d, null, 2) + '\n');
    });
  }

  return { metrics, samples };
}

/** Round-robin across turn-number buckets so the sample is stratified by turn. */
function stratify(buckets: Map<number, StoredPosition[]>, want: number): StoredPosition[] {
  const turns = [...buckets.keys()].sort((a, b) => a - b);
  const out: StoredPosition[] = [];
  for (let round = 0; out.length < want; round++) {
    let progressed = false;
    for (const turn of turns) {
      const bucket = buckets.get(turn) as StoredPosition[];
      if (round >= bucket.length) continue;
      out.push(bucket[round]);
      progressed = true;
      if (out.length === want) break;
    }
    if (!progressed) break;
  }
  return out;
}

/**
 * Kind-weighted choice. Uniform sampling over the raw action list is dominated
 * by MOVEs and by the phase-enders, which leaves kills, purchases, promotions,
 * upkeep pressure and therefore the three non-draw terminals almost untested.
 * Bucketing by kind first and weighting ATTACK/BUY/PROMOTE up produces games
 * that actually finish: see `metrics.terminals`.
 */
const KIND_WEIGHT = new Int32Array(8);
KIND_WEIGHT[AKind.END_PLACE] = 2;
KIND_WEIGHT[AKind.MOVE] = 6;
KIND_WEIGHT[AKind.ATTACK] = 24;
KIND_WEIGHT[AKind.BUY] = 10;
KIND_WEIGHT[AKind.PROMOTE] = 10;
KIND_WEIGHT[AKind.END_ACTION] = 3;
KIND_WEIGHT[AKind.PAY_UPKEEP] = 1;
KIND_WEIGHT[AKind.RESIGN] = 0;

const KIND_COUNT = new Int32Array(8);

function pickAction(rng: () => number, buffer: Int32Array, count: number): PA {
  KIND_COUNT.fill(0);
  for (let i = 0; i < count; i++) KIND_COUNT[paKind(buffer[i])]++;
  let total = 0;
  for (let k = 0; k < 8; k++) if (KIND_COUNT[k] > 0) total += KIND_WEIGHT[k];
  if (total === 0) return buffer[Math.floor(rng() * count)];
  let roll = rng() * total;
  let picked = -1;
  for (let k = 0; k < 8; k++) {
    if (KIND_COUNT[k] === 0) continue;
    roll -= KIND_WEIGHT[k];
    if (roll < 0) {
      picked = k;
      break;
    }
  }
  if (picked < 0) return buffer[Math.floor(rng() * count)];
  let nth = Math.floor(rng() * KIND_COUNT[picked]);
  for (let i = 0; i < count; i++) {
    if (paKind(buffer[i]) !== picked) continue;
    if (nth === 0) return buffer[i];
    nth--;
  }
  return buffer[count - 1];
}

function checkLegalitySurface(
  p: PackedState,
  state: GameState,
  keep: KeepSetTable,
  count: number,
  buffer: Int32Array,
  metrics: FuzzMetrics,
  report: (d: Omit<Divergence, 'seed' | 'game' | 'ply' | 'prefix' | 'rules' | 'state'>) => void,
): void {
  if (p.result !== Result.ONGOING) return;
  const mine: string[] = new Array<string>(count);
  for (let i = 0; i < count; i++) mine[i] = normalize(toAIAction(p, buffer[i], keep));
  mine.sort();

  if (state.upkeepPending) {
    // Soundness: every emitted keep-set must be canonically legal.
    for (let i = 0; i < count; i++) {
      const action = toAIAction(p, buffer[i], keep);
      if (!isLegalAction(state, action)) {
        report({ kind: 'legality', field: `illegal-keep-set[${i}]`, action, replica: mine.join(' '), canonical: '' });
        return;
      }
    }
    if (count >= KEEP_SET_CAPACITY) {
      metrics.legalityKeepSetTruncations++;
      return;
    }
    const theirs = upkeepActions(state)
      .filter(a => isLegalAction(state, a))
      .map(normalize)
      .sort();
    if (theirs.length !== mine.length || theirs.some((x, i) => x !== mine[i])) {
      report({ kind: 'legality', field: 'keep-set-multiset', action: null, replica: mine.join(' '), canonical: theirs.join(' ') });
    }
    return;
  }

  const theirs = canonicalLegalSet(state);
  if (theirs.length !== mine.length || theirs.some((x, i) => x !== mine[i])) {
    report({ kind: 'legality', field: 'action-multiset', action: null, replica: mine.join(' '), canonical: theirs.join(' ') });
  }
}
