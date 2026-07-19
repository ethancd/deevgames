// Seeded series runner: drives many games of a GameDef through a fixed roster
// of bots, seat-rotated at the series level, and aggregates results.
//
// Legality modes (documented in full in README.md):
//   - 'as-shipped' (default): a RawBot's illegal action is applied anyway —
//     "measure the engine as it ships" (mirrors muju runner.ts's D1/D2
//     as-shipped default). Counted, never silently fixed up.
//   - 'strict': an illegal action increments illegalActions, then the bot is
//     re-asked ONCE for the same seat/state; if the retry is also illegal (or
//     null), the game is adjudicated with reason 'illegal-action' (each
//     illegal emission observed — first attempt and retry — increments
//     illegalActions; that is this package's specific choice, see README).
// A RawBot returning null is never a pass: it always counts alongside
// illegalActions and always ends the game immediately with reason
// 'engine-emitted-nothing', in both legality modes.

import {
  type GameDef,
  type Result,
  type Seat,
  type Rng,
  mulberry32,
  stableStringify,
  engineHash as coreEngineHash,
  configHash as coreConfigHash,
} from '@deev/core';
import { type Bot, isRawBot } from './bots.ts';

export type Legality = 'as-shipped' | 'strict';

export interface GameRecord {
  schema: 'deev-lab-game-v1';
  gameIndex: number;
  seed: number;
  /** seat -> bot name, for this game (after seat rotation). */
  seatAssignment: Record<Seat, string>;
  result: Result;
  plies: number;
  illegalActions: number;
  engineHash: string;
  configHash: string;
}

export interface RunSeriesHooks {
  onGameEnd?(record: GameRecord): void;
}

export interface RunSeriesOptions<S, A, C, O> {
  game: GameDef<S, A, C, O>;
  config: C;
  /** Mapped to def.seats(config) order. Length 1 = single-player sweep mode. */
  bots: Array<Bot<S, A, O>>;
  games: number;
  seedStart: number;
  /** Rotate bots across seats at the series level. Default true. */
  seatRotation?: boolean;
  maxPlies?: number;
  adjudicate?: (state: S) => Result;
  /** Each throws on violation; a throw aborts only that one game. */
  invariants?: Array<(state: S) => void>;
  legality?: Legality;
  hooks?: RunSeriesHooks;
}

export interface BotTally {
  wins: number;
  losses: number;
  draws: number;
}

export interface SeriesResult {
  schema: 'deev-lab-series-v1';
  engineHash: string;
  configHash: string;
  seedStart: number;
  games: number;
  records: GameRecord[];
  byBot: Record<string, BotTally>;
  illegalActions: number;
  invariantViolations: number;
}

function isLegalAction<A>(action: A, legal: A[]): boolean {
  const key = stableStringify(action);
  return legal.some((candidate) => stableStringify(candidate) === key);
}

interface PlayResult {
  result: Result;
  plies: number;
  illegalActions: number;
  invariantViolation: boolean;
}

async function playOneGame<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  config: C,
  seed: number,
  seatToBot: Map<Seat, Bot<S, A, O>>,
  maxPlies: number,
  adjudicate: ((state: S) => Result) | undefined,
  invariants: Array<(state: S) => void>,
  legality: Legality,
): Promise<PlayResult> {
  const engineRng = mulberry32(seed);
  const policyRngs = new Map<Seat, Rng>();
  for (const seat of def.seats(config)) {
    policyRngs.set(seat, mulberry32(seed).fork(`policy:${seat}`));
  }

  let state = def.init(config, engineRng);
  let illegalActions = 0;
  let plies = 0;

  for (const [seat, bot] of seatToBot) {
    bot.onGameStart?.(seat, seed);
  }

  const checkInvariants = (): boolean => {
    try {
      for (const inv of invariants) inv(state);
      return true;
    } catch {
      return false;
    }
  };

  if (!checkInvariants()) {
    return { result: { winner: null, reason: 'invariant-violation' }, plies, illegalActions, invariantViolation: true };
  }

  let result: Result | null = def.terminal(state);

  while (result === null) {
    if (plies >= maxPlies) {
      result = adjudicate ? adjudicate(state) : { winner: null, reason: 'adjudicated:max-plies' };
      break;
    }

    const acting = def.toAct(state);
    if (acting.length === 0) {
      throw new Error(`${def.id}: toAct() returned no seats at a non-terminal state`);
    }

    const chosen: Array<{ seat: Seat; action: A }> = [];
    let earlyResult: Result | null = null;

    for (const seat of acting) {
      const legal = def.legal(state, seat);
      if (legal.length === 0) {
        throw new Error(
          `${def.id}: legal() empty for acting seat '${seat}' at a non-terminal state — ` +
            `games must reify pass/end-turn as an explicit action`,
        );
      }
      const bot = seatToBot.get(seat);
      if (!bot) throw new Error(`runSeries: no bot assigned to seat '${seat}'`);

      if (isRawBot(bot)) {
        let action = await bot.nextAction(state, seat);
        if (action === null) {
          illegalActions++;
          earlyResult = { winner: null, reason: 'engine-emitted-nothing' };
          break;
        }
        if (!isLegalAction(action, legal)) {
          illegalActions++;
          if (legality === 'strict') {
            const retry = await bot.nextAction(state, seat);
            if (retry === null) {
              illegalActions++;
              earlyResult = { winner: null, reason: 'engine-emitted-nothing' };
              break;
            }
            if (!isLegalAction(retry, legal)) {
              illegalActions++;
              earlyResult = { winner: null, reason: 'illegal-action' };
              break;
            }
            action = retry;
          }
          // 'as-shipped': fall through and apply the illegal action as-is.
        }
        chosen.push({ seat, action });
      } else {
        const view = def.observe ? def.observe(state, seat) : (state as unknown as O);
        const rng = policyRngs.get(seat) ?? mulberry32(seed);
        const action = bot.choose({ view, seat, legal, rng });
        if (!isLegalAction(action, legal)) {
          throw new Error(
            `ScriptedBot '${bot.name}' returned an action outside the legal set for seat '${seat}': ` +
              stableStringify(action),
          );
        }
        chosen.push({ seat, action });
      }
    }

    if (earlyResult) {
      result = earlyResult;
      break;
    }

    let invariantViolation = false;
    for (const { action } of chosen) {
      state = def.apply(state, action, engineRng);
      plies++;
      if (!checkInvariants()) {
        result = { winner: null, reason: 'invariant-violation' };
        invariantViolation = true;
        break;
      }
      const term = def.terminal(state);
      if (term !== null) {
        result = term;
        break;
      }
    }
    if (invariantViolation) {
      return { result: result!, plies, illegalActions, invariantViolation: true };
    }
  }

  return { result, plies, illegalActions, invariantViolation: false };
}

export async function runSeries<S, A, C, O>(
  opts: RunSeriesOptions<S, A, C, O>,
): Promise<SeriesResult> {
  const {
    game,
    config,
    bots,
    games,
    seedStart,
    seatRotation = true,
    maxPlies = 10_000,
    adjudicate,
    invariants = [],
    legality = 'as-shipped',
    hooks,
  } = opts;

  const seats = game.seats(config);
  if (bots.length !== seats.length) {
    throw new Error(
      `runSeries: bots.length (${bots.length}) must equal seats(config).length (${seats.length}); ` +
        `pass exactly one bot per seat (length 1 for a single-player sweep)`,
    );
  }

  const records: GameRecord[] = [];
  const byBot: Record<string, BotTally> = {};
  for (const bot of bots) {
    if (!(bot.name in byBot)) byBot[bot.name] = { wins: 0, losses: 0, draws: 0 };
  }

  let illegalActionsTotal = 0;
  let invariantViolationsTotal = 0;

  for (let i = 0; i < games; i++) {
    const seed = seedStart + i;
    const rotation = seatRotation ? i % bots.length : 0;
    const seatToBot = new Map<Seat, Bot<S, A, O>>();
    const seatAssignment: Record<Seat, string> = {};
    seats.forEach((seat, idx) => {
      const bot = bots[(idx + rotation) % bots.length];
      seatToBot.set(seat, bot);
      seatAssignment[seat] = bot.name;
    });

    const { result, plies, illegalActions, invariantViolation } = await playOneGame(
      game,
      config,
      seed,
      seatToBot,
      maxPlies,
      adjudicate,
      invariants,
      legality,
    );

    illegalActionsTotal += illegalActions;
    if (invariantViolation) invariantViolationsTotal++;

    if (result.reason !== 'invariant-violation') {
      for (const seat of seats) {
        const botName = seatAssignment[seat];
        const tally = byBot[botName];
        if (result.winner === null) tally.draws++;
        else if (result.winner === seat) tally.wins++;
        else tally.losses++;
      }
    }

    const record: GameRecord = {
      schema: 'deev-lab-game-v1',
      gameIndex: i,
      seed,
      seatAssignment,
      result,
      plies,
      illegalActions,
      engineHash: coreEngineHash(game),
      configHash: coreConfigHash(config),
    };
    records.push(record);
    hooks?.onGameEnd?.(record);
  }

  return {
    schema: 'deev-lab-series-v1',
    engineHash: coreEngineHash(game),
    configHash: coreConfigHash(config),
    seedStart,
    games,
    records,
    byBot,
    illegalActions: illegalActionsTotal,
    invariantViolations: invariantViolationsTotal,
  };
}
