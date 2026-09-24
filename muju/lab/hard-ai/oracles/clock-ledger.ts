/**
 * `strategy/ledger.ts`'s soundness oracle (plan W1.3): "random (and
 * greedy-mining) legal playouts that stop at the first kill never end the
 * clock window with a mined total above U." Follows
 * `lab/hard-ai/oracles/phasing-economy.ts`'s pattern — a small set of plain,
 * well-documented, directly-importable functions, no CLI report machinery —
 * because the acceptance path (`tests/lab/clock-ledger-oracle.test.ts`) calls
 * this module in-process with a small trial count, the way
 * `tests/ai/hard/phasing-economy.test.ts` calls `canonicalPhasingEconomy`
 * directly rather than shelling out to a report-writing script.
 *
 * WHAT IS CHECKED, PRECISELY. `U` (`strategy/ledger.ts`) claims a sound upper
 * bound on a side's mined total "at the clock's end along any kill-free
 * continuation" — a conditional claim, not "for every continuation
 * whatsoever": once a unit dies the clock resets (`core/state.ts:1370-1373`)
 * and the ORIGINAL root's `U` is no longer about anything. So this oracle:
 *
 *   1. samples a ROOT `GameState` (seeded random legal play from a P1 dev
 *      opening, matching `tests/ai/hard/strategy-ledger.test.ts`'s corpus
 *      construction so the two files exercise the same kind of position);
 *   2. reads `U` for both sides off the packed root, once;
 *   3. replays forward from that SAME root under one policy (`'random'`:
 *      uniformly among legal actions, attacks included; `'greedy'`: the
 *      mining-maximising heuristic below, which never attacks — see
 *      `scoreAction`'s doc for why that is a deliberate, documented choice
 *      and not an oversight);
 *   4. STOPS the trial the instant a kill happens (`board.units.length`
 *      drops) — that playout is DISCARDED, not scored, because the window
 *      `U` describes has already ended (`playoutsDiscardedByKill`);
 *   5. if the replay instead runs all the way to `state.phase === 'victory'`
 *      with `victoryReason === 'kill-clock'` and no kill occurred, THIS is a
 *      genuine "kill-free continuation to the clock's end": `minedTotal`
 *      (`src/game/inactivity.ts`, the same function `gained[]` mirrors) is
 *      compared against `U` for both sides, and a violation is recorded if
 *      it exceeds it. Any other terminal (home occupation, elimination,
 *      upkeep elimination, or no legal action) also discards the trial
 *      (`playoutsDiscardedOtherTerminal`): a different ending pre-empted the
 *      clock, so this root's `U` was never actually tested. Exceeding the
 *      safety cap (`playoutsDiscardedByCap`) is its own bucket because it
 *      would signal a bug (`r` implies far fewer actions than the default
 *      cap allows), not an expected outcome.
 */
import path from 'node:path';
import { applyAction } from '../../../src/ai/simulate';
import { generateAllActions } from '../../../src/ai/moves';
import { getNextTierDefinition, getUnitDefinition } from '../../../src/game/units';
import { minedTotal } from '../../../src/game/inactivity';
import { seededRandom, type RNG } from '../../../src/ai/runtime';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { clockLedger } from '../../../src/ai/hard/strategy/ledger';
import type { GameState, PlayerId, Position } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { loadOpenings, type OpeningSpec } from '../ladder/openings';
import { applyOpening } from '../ladder/openings/phasing';

const replica = new Replica();

export type PlayoutMode = 'random' | 'greedy';

export interface ClockLedgerViolation {
  rootLabel: string;
  mode: PlayoutMode;
  side: 0 | 1;
  u: number;
  achieved: number;
}

export interface ClockLedgerOracleReport {
  rootsSampled: number;
  playoutsRun: number;
  playoutsCompletedKillFree: number;
  playoutsDiscardedByKill: number;
  playoutsDiscardedOtherTerminal: number;
  /** Should stay 0 with the default `maxActionsPerPlayout`; a nonzero count
   * signals the safety cap was too tight for `r`, not a genuine playout. */
  playoutsDiscardedByCap: number;
  playoutsDiscardedNoWindow: number;
  violations: ClockLedgerViolation[];
}

/** `playOne`'s outcome, discriminated so the caller can tally precisely why
 * a trial was discarded instead of folding every non-"complete" case into
 * one bucket. */
type PlayoutOutcome =
  | { kind: 'complete'; state: GameState }
  | { kind: 'kill' }
  | { kind: 'other-terminal' }
  | { kind: 'cap-exceeded' };

export interface ClockLedgerOracleOptions {
  /** How many ROOT positions to sample. */
  trials: number;
  /** Base RNG seed; every root and every playout gets its own derived stream. */
  seed: number;
  /** Which policies to replay from each sampled root. */
  modes: readonly PlayoutMode[];
  /** Openings file to sample roots from; defaults to the P1 dev book, the
   * same corpus `tests/ai/hard/strategy-ledger.test.ts` uses. */
  openingsPath?: string;
  /** Safety cap on total actions applied per playout, so a bug that never
   * reaches a terminal cannot hang the process. */
  maxActionsPerPlayout?: number;
}

/** CHOICE: `r <= INACTIVITY_LIMIT + 1 = 11` plies, each at most 4 actions
 * plus END_ACTION/PAY_UPKEEP/buys/promotes/END_PLACE — comfortably under 50
 * actions per ply even on a generous turn, so 500 is generous headroom, not
 * a tuned figure; a real hit would show up as `playoutsDiscardedByCap > 0`. */
const DEFAULT_MAX_ACTIONS_PER_PLAYOUT = 500;

function livingCount(state: GameState): number {
  return state.board.units.length;
}

/**
 * `'greedy'` mode's action scorer: prefer moves/buys that increase a unit's
 * mining, prefer promotions that increase mining, and NEVER attack. CHOICE:
 * excluding ATTACK entirely (rather than merely de-prioritising it) is
 * deliberate — an attack that happens to kill would end the very window this
 * oracle is trying to stress, discarding the trial before `U` is exercised at
 * all, so a policy that reliably avoids kills reaches many more genuine
 * "mining-maximising, kill-free" endpoints per sampled root. `'random'` mode
 * (below) still attacks, so realistic kill-bearing play is not left
 * unexercised by the oracle as a whole.
 */
function scoreAction(state: GameState, action: AIAction): number {
  const cash = state.players[state.turn.currentPlayer].resources;
  const reserveAt = (pos: Position): number => state.board.cells[pos.y][pos.x].resourceLayers;
  switch (action.type) {
    case 'ATTACK':
      return Number.NEGATIVE_INFINITY;
    case 'MOVE': {
      const unit = state.board.units.find(u => u.id === action.unitId);
      const from = unit ? reserveAt(unit.position) : 0;
      return reserveAt(action.to) - from;
    }
    case 'BUY_UNIT':
      // CHOICE: the "+1" only breaks a tie with a MOVE onto an equally-good
      // empty cell (buying strictly adds a miner; moving does not), so ties
      // resolve toward growing the roster.
      return 1 + reserveAt(action.position) + getUnitDefinition(action.definitionId).mining;
    case 'PROMOTE_UNIT': {
      const unit = state.board.units.find(u => u.id === action.unitId);
      if (!unit) return -1;
      const next = getNextTierDefinition(unit.definitionId);
      if (!next) return -1;
      // CHOICE: weight the mining delta above a MOVE's plain reserve delta so
      // a real mining-rate upgrade always outranks reshuffling; the exact
      // factor is arbitrary (any value that keeps promotions ranked above
      // ordinary reserve-seeking moves works for the oracle's purpose).
      return (next.mining - getUnitDefinition(unit.definitionId).mining) * 10;
    }
    case 'PAY_UPKEEP': {
      // Prefer the keep set that retains the most mining capacity; `cash` is
      // read only so a rich side's keep-everything option still sorts first.
      void cash;
      return action.keepUnitIds
        .map(id => state.board.units.find(u => u.id === id))
        .filter((u): u is NonNullable<typeof u> => u !== undefined)
        .reduce((sum, u) => sum + getUnitDefinition(u.definitionId).mining, 0);
    }
    default:
      return -1; // END_ACTION_PHASE / END_PLACE_PHASE: last resort
  }
}

function pickAction(state: GameState, actions: readonly AIAction[], mode: PlayoutMode, rng: RNG): AIAction {
  if (mode === 'random') return actions[Math.floor(rng() * actions.length)];
  let best = actions[0], bestScore = scoreAction(state, best);
  for (let i = 1; i < actions.length; i++) {
    const score = scoreAction(state, actions[i]);
    if (score > bestScore) { best = actions[i]; bestScore = score; }
  }
  return best;
}

/** One kill-free-or-discarded playout from `root` under `mode`. */
function playOne(root: GameState, mode: PlayoutMode, rng: RNG, maxActions: number): PlayoutOutcome {
  let state = root;
  for (let i = 0; i < maxActions; i++) {
    if (state.phase !== 'playing') break;
    const before = livingCount(state);
    const player = state.turn.currentPlayer;
    const actions = generateAllActions(state, player);
    if (actions.length === 0) return { kind: 'other-terminal' }; // stuck with no legal action, not a real completion
    const action = pickAction(state, actions, mode, rng);
    const next = applyAction(state, action);
    if (next === state) return { kind: 'other-terminal' };
    if (livingCount(next) < before) return { kind: 'kill' }; // the window this root's U describes is over
    state = next;
  }
  if (state.phase === 'playing') return { kind: 'cap-exceeded' };
  if (state.victoryReason !== 'kill-clock') return { kind: 'other-terminal' };
  return { kind: 'complete', state };
}

function randomLegalWalk(start: GameState, rng: RNG, steps: number): GameState {
  let state = start;
  for (let i = 0; i < steps && state.phase === 'playing'; i++) {
    const actions = generateAllActions(state, state.turn.currentPlayer);
    if (actions.length === 0) break;
    const next = applyAction(state, actions[Math.floor(rng() * actions.length)]);
    if (next === state) break;
    state = next;
  }
  return state;
}

function loadSampleOpenings(openingsPath?: string): OpeningSpec[] {
  if (openingsPath) return loadOpenings(openingsPath).openings;
  const dir = new URL('../ladder/openings/p1-dev.jsonl', import.meta.url);
  return loadOpenings(dir.pathname).openings;
}

export function runClockLedgerOracle(options: ClockLedgerOracleOptions): ClockLedgerOracleReport {
  const openings = loadSampleOpenings(options.openingsPath);
  const maxActionsPerPlayout = options.maxActionsPerPlayout ?? DEFAULT_MAX_ACTIONS_PER_PLAYOUT;
  const report: ClockLedgerOracleReport = {
    rootsSampled: 0, playoutsRun: 0, playoutsCompletedKillFree: 0,
    playoutsDiscardedByKill: 0, playoutsDiscardedOtherTerminal: 0, playoutsDiscardedByCap: 0,
    playoutsDiscardedNoWindow: 0, violations: [],
  };
  if (openings.length === 0) return report;
  for (let trial = 0; trial < options.trials; trial++) {
    // CHOICE: distinct large-prime multipliers per stream (root walk vs. each
    // mode's playout) so two streams derived from the same base seed never
    // collide on `seededRandom`'s congruential state; any distinct primes
    // larger than `trials` would do equally well.
    const rootRng = seededRandom(options.seed + trial * 7919);
    const opening = openings[trial % openings.length];
    // CHOICE: 4..43 steps — matches `tests/ai/hard/strategy-ledger.test.ts`'s
    // own corpus range, long enough to reach pending summons and mid-range
    // clocks (measured: clocks spread 1..9) without spending most trials on
    // long walks that only shrink `r`.
    const walkSteps = 4 + Math.floor(rootRng() * 40);
    const rootState = randomLegalWalk(applyOpening(opening), rootRng, walkSteps);
    if (rootState.phase !== 'playing') continue;
    report.rootsSampled++;
    const rootLabel = `${opening.id}+walk(${walkSteps})#${trial}`;
    const p = replica.pack(rootState, allocState());
    const ledger = clockLedger(p);
    if (ledger.r <= 0) { report.playoutsDiscardedNoWindow += options.modes.length; continue; }
    for (const mode of options.modes) {
      report.playoutsRun++;
      const playoutRng = seededRandom(options.seed + trial * 104729 + (mode === 'random' ? 1 : 2));
      const outcome = playOne(rootState, mode, playoutRng, maxActionsPerPlayout);
      if (outcome.kind === 'kill') { report.playoutsDiscardedByKill++; continue; }
      if (outcome.kind === 'other-terminal') { report.playoutsDiscardedOtherTerminal++; continue; }
      if (outcome.kind === 'cap-exceeded') { report.playoutsDiscardedByCap++; continue; }
      report.playoutsCompletedKillFree++;
      for (const side of [0, 1] as const) {
        const player: PlayerId = side === 0 ? 'white' : 'black';
        const achieved = minedTotal(outcome.state, player);
        const u = ledger.sides[side].U.value;
        if (achieved > u) report.violations.push({ rootLabel, mode, side, u, achieved });
      }
    }
  }
  return report;
}

// `lab/hard-ai/analyze/run.ts`'s idiom (DESIGN's convention across `lab/`):
// true only when this file is the process's own entry point, so importing
// this module from a test never triggers the CLI tail below.
const invokedDirectly = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const trials = Number(process.argv.find(a => a.startsWith('--trials='))?.slice('--trials='.length) ?? 300);
  const seed = Number(process.argv.find(a => a.startsWith('--seed='))?.slice('--seed='.length) ?? 1);
  const report = runClockLedgerOracle({ trials, seed, modes: ['random', 'greedy'] });
  console.log(JSON.stringify(report, null, 2));
  if (report.violations.length > 0) process.exitCode = 1;
}
