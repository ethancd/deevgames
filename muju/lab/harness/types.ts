import type { GameState, PlayerId, BoardState, TurnPhase, QueuedUnit, Position } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import type { Rng } from './rng';

/**
 * What a scripted bot is allowed to see. Built from the engine's observation
 * layer (`ai/state/observation.ts`): the opponent's stockpile and build queue
 * are masked — hidden-information rulings Q1–Q3 are enforced by construction.
 */
export interface BotView {
  player: PlayerId;
  opponent: PlayerId;
  phase: TurnPhase;
  actionsRemaining: number;
  turnNumber: number;
  board: BoardState; // fully public (positions, tiers, damage, cells)
  me: {
    resources: number;
    buildQueue: QueuedUnit[];
    resourcesGained: number;
    resourcesSpent: number;
    startCorner: Position;
  };
  /** Public opponent info only. Stockpile/queue are NOT here by design. */
  enemy: {
    resourcesGained: number;
    resourcesSpent: number;
    startCorner: Position;
  };
}

export interface BotContext {
  view: BotView;
  /** Legal actions for this ply, pre-filtered through full rules (incl. tech gating — J-001). */
  legal: AIAction[];
  rng: Rng;
}

/**
 * A scripted bot picks one of the offered legal actions. Returning null/undefined
 * means "pass": the runner ends the current phase/turn.
 */
export interface ScriptedBot {
  kind: 'scripted';
  name: string;
  chooseAction(ctx: BotContext): AIAction | null;
  onGameStart?(player: PlayerId, seed: number): void;
}

/**
 * An engine bot drives the real AI (AIEngineV2) and emits its own actions from
 * the full state (the engine masks hidden info internally via its observation/
 * belief layer). The runner validates emissions against the legal set and
 * counts violations (divergences D1/D2) but by default applies them anyway —
 * "as-shipped" measurement (J-002).
 */
export interface EngineBot {
  kind: 'engine';
  name: string;
  onGameStart(player: PlayerId, seed: number): void;
  /** Return the next single action for the current state (re-planned per action). */
  nextAction(state: GameState, player: PlayerId): Promise<AIAction | null>;
}

export type Bot = ScriptedBot | EngineBot;

export interface MatchOptions {
  /** Cap on full rounds (turnNumber). Past it the game is adjudicated. */
  maxTurns: number;
  /** Hard safety cap on plies (single actions). */
  maxPlies: number;
  /**
   * 'as-shipped': engine-bot actions apply even if illegal (mirrors the real
   *   APPLY_AI_ACTION path; violations counted).
   * 'strict': illegal engine-bot actions are skipped (counted, not applied).
   */
  legality: 'as-shipped' | 'strict';
  /** Record a full step-by-step replay of this game. */
  recordReplay: boolean;
  /** Run invariant checks after every action (cheap; abort game on violation). */
  checkInvariants: boolean;
  /** Advantage graph for this game (E7). Default: the shipped incumbent. */
  elementGraph: 'double-thick' | 'dual-triangle' | 'rush-edge-only' | 'none';
  /** Global ATK handicap per player (instrument sensitivity gate). */
  handicap: { white: number; black: number };
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  maxTurns: 120,
  maxPlies: 8000,
  legality: 'as-shipped',
  recordReplay: false,
  checkInvariants: true,
  elementGraph: 'double-thick',
  handicap: { white: 0, black: 0 },
};

export type WinType =
  | 'elimination'
  | 'resignation'
  | 'adjudication' // turn/ply cap hit; material+stockpile decides
  | 'draw' // adjudication tie or mutual elimination
  | 'invariant-violation'; // game aborted; no winner

export interface PlayerGameStats {
  bot: string;
  finalResources: number;
  resourcesGained: number;
  resourcesSpent: number;
  finalMaterial: number; // sum of on-board unit costs at end
  finalQueueValue: number; // sum of queued unit costs at end
  unitsPlaced: number;
  promotions: number;
  /** Units placed or promoted into each tier (placement counts the placed tier). */
  tierUsage: Record<1 | 2 | 3 | 4, number>;
  /** Units queued per element over the whole game. */
  elementQueued: Record<string, number>;
  unitsLost: number;
  unitsKilled: number;
  illegalActions: number; // engine-bot emissions not in the legal set
  plies: number; // actions taken by this player
}

export interface MaterialSample {
  turn: number;
  white: number; // on-board material (cost sum)
  black: number;
  whiteRes: number;
  blackRes: number;
}

/** One JSONL row per game. */
export interface GameRecord {
  schema: 'muju-lab-game-v1';
  engineHash: string;
  runId: string;
  experiment: string | null;
  seed: number;
  startedAt: string;
  durationMs: number;
  options: MatchOptions;
  winner: PlayerId | null;
  winType: WinType;
  turns: number;
  plies: number;
  firstBlood: { by: PlayerId; turn: number } | null;
  players: Record<PlayerId, PlayerGameStats>;
  materialCurve: MaterialSample[]; // sampled at the start of every white turn
  invariantViolation: string | null;
  anomalies: string[];
}

/** Compact per-step snapshot so the replay viewer needs no engine logic. */
export interface ReplayStep {
  ply: number;
  turn: number;
  player: PlayerId;
  phase: TurnPhase;
  actionsRemaining: number;
  /** null on the initial-position step (ply 0). */
  action: AIAction | null;
  units: Array<{
    o: PlayerId;
    d: string; // definitionId
    x: number;
    y: number;
    dmg: number;
  }>;
  /** 100 chars, row-major (y*10+x), each char = remaining resourceLayers. */
  cells: string;
  res: Record<PlayerId, { r: number; g: number; s: number; q: number }>; // resources, gained, spent, queueCount
}

export interface ReplayFile {
  schema: 'muju-lab-replay-v1';
  meta: GameRecord;
  steps: ReplayStep[];
}
