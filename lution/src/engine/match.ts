// Outer match loop: first to MATCH_WINS inner-game wins takes the match.
// Game 1's first player is random (seeded); after a decisive inner game the
// loser goes first next; after a draw, the SAME first player replays
// immediately with no design round (plan rule 8).
//
// MATCH_WINS is a real (configurable) constant, not a stub.

import type { CardDef, CardId, MatchState, PlayerId } from '../../shared/types';
import type { CardEffect, PlayerController } from './types';
import { createInnerGame, runInnerGame, WIN_POINTS, type InnerGameRuntime } from './engine';
import { mulberry32Step } from './rng';

export const MATCH_WINS = 10;

export interface CreateMatchParams {
  matchId: string;
  decks: Record<PlayerId, CardId[]>;
  matchSeed: number;
}

// The match's random-number state is threaded through MatchState.matchSeed
// itself (there is no separate matchRngState field on the wire type):
// every consumption advances matchSeed via mulberry32Step and stores the
// new state back, so a persisted/resumed MatchState reproduces the exact
// same sequence of "first inner game's first player" / "next inner game's
// seed" decisions deterministically.
function stepMatchRng(match: MatchState): number {
  const { value, nextSeed } = mulberry32Step(match.matchSeed);
  match.matchSeed = nextSeed;
  return value;
}

export function createMatchState(params: CreateMatchParams): MatchState {
  const { matchId, decks, matchSeed } = params;
  const match: MatchState = {
    matchId,
    createdAt: new Date().toISOString(),
    decks,
    innerWins: { human: 0, claude: 0 },
    round: 0,
    // Placeholder; replaced immediately below by a seeded coin flip so game
    // 1's first player is chosen randomly per the plan.
    nextFirstPlayer: 'human',
    matchSeed,
    currentInnerGame: null,
    roundHistory: [],
    phase: 'playing',
    winner: null,
  };
  match.nextFirstPlayer = stepMatchRng(match) < 0.5 ? 'human' : 'claude';
  return match;
}

export interface PlayMatchParams {
  match: MatchState;
  registry: ReadonlyMap<CardId, CardDef>;
  effects: ReadonlyMap<CardId, CardEffect>;
  controllers: Record<PlayerId, PlayerController>;
  winPoints?: number;
  matchWins?: number;
  // Seam for M3/M4: runs after a decisive (non-draw) inner game that hasn't
  // just finished the match, before the next inner game starts. Headless /
  // "skipDesign" mode is simply omitting this.
  onDesignRound?: () => Promise<void>;
}

export async function playOneInnerGame(params: PlayMatchParams): Promise<InnerGameRuntime> {
  const { match, registry, effects, controllers, winPoints = WIN_POINTS, matchWins = MATCH_WINS, onDesignRound } = params;

  const innerSeed = Math.floor(stepMatchRng(match) * 0x7fffffff);
  const runtime = createInnerGame({
    registry,
    effects,
    decks: match.decks,
    seed: innerSeed,
    firstPlayer: match.nextFirstPlayer,
    choiceResponders: {
      human: controllers.human.choiceResponder,
      claude: controllers.claude.choiceResponder,
    },
    winPoints,
  });

  await runInnerGame(runtime, controllers);

  match.currentInnerGame = runtime.state;
  const result = runtime.state.result;

  if (!result) {
    throw new Error('playOneInnerGame: inner game completed without a result');
  }

  if (result.outcome === 'draw') {
    // Draw: immediate replay, SAME first player, no round advance, no
    // design round.
    return runtime;
  }

  const { winner } = result;
  const loser: PlayerId = winner === 'human' ? 'claude' : 'human';
  match.innerWins[winner] += 1;
  match.round += 1;
  match.nextFirstPlayer = loser;

  if (match.innerWins[winner] >= matchWins) {
    match.phase = 'match-over';
    match.winner = winner;
  } else if (onDesignRound) {
    await onDesignRound();
  }

  return runtime;
}

export interface PlayMatchToCompletionParams extends PlayMatchParams {
  maxInnerGames?: number;
}

export async function playMatchToCompletion(params: PlayMatchToCompletionParams): Promise<MatchState> {
  const { maxInnerGames = 500, ...rest } = params;
  let games = 0;
  while (rest.match.phase !== 'match-over') {
    if (games >= maxInnerGames) {
      throw new Error(`playMatchToCompletion: exceeded maxInnerGames (${maxInnerGames}) without a winner`);
    }
    await playOneInnerGame(rest);
    games += 1;
  }
  return rest.match;
}
