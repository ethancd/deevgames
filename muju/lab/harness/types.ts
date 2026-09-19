import type { GameState, PlayerId, BoardState, TurnPhase, PlayerState, PendingSummon } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import type { Rng } from './rng';

/**
 * Every rules revision the lab can READ. Both are Phasing; they differ in one
 * number and that number decides results:
 *
 *   - `muju-phasing-1` — inactivity draw at 10 plies (five hand-offs each).
 *     HISTORICAL. Every row measured before 2026-09-19 carries it.
 *   - `muju-phasing-2` — inactivity draw at 20 plies, warning at 17
 *     (preregistration amendment A4, owner decision 2026-09-19). What resets
 *     the clock is unchanged: only an attack that removes a unit. Nothing else
 *     in the rules moved.
 *
 * A record with NO `rulesVersion` is Standard and predates Phasing entirely.
 */
export type RulesVersion = 'muju-phasing-1' | 'muju-phasing-2';

/**
 * The revision this tree PLAYS. It is the single source of the value: the
 * harness stamps it on every `GameRecord` (`runner.ts`),
 * `ladder/openings/phasing.ts` re-exports it as `RULES_VERSION` and folds it
 * into every opening's `gameplayDigest`, and `ladder/ruleset.ts` re-exports it
 * as `LADDER_RULES_VERSION`, from where `ladder/identity.ts` hashes it into
 * every resolved-configuration hash.
 *
 * Before A4 the same string was written out by hand in four places. It is one
 * constant now so a future revision cannot land in three of them.
 */
export const HARNESS_RULES_VERSION = 'muju-phasing-2' as const satisfies RulesVersion;

/** The full, perfect-information game plus convenience fields for policies. */
export interface BotView {
  state: GameState; player: PlayerId; opponent: PlayerId;
  phase: TurnPhase; actionsRemaining: number; turnNumber: number; board: BoardState;
  me: PlayerState; enemy: PlayerState;
  /** Public commitments for BOTH players, inert until their next own turn. */
  pendingSummons: readonly PendingSummon[];
}

export interface BotContext {
  view: BotView;
  /** Legal actions for this ply, pre-filtered through full rules (including public tier-1 purchases). */
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
 * the full public state. The runner validates emissions against the legal set and
 * counts violations (divergences D1/D2) but by default applies them anyway —
 * "as-shipped" measurement (J-002).
 */
/**
 * One bot instance's own adapter counters for ONE game (E1.5).
 *
 * Structurally identical to `lab/hard-ai/bots/hard.ts#HardBotTiming`, spelled
 * here so the harness keeps no dependency on `lab/hard-ai`. Every field is a
 * count or a total over this seat's game alone — `maxTurnMs` included, which
 * is this seat's worst turn outright rather than the high-water delta
 * `GameRecord.hardTiming` can offer from a process-wide counter.
 *
 * WHY PER SEAT. The process-wide counters cannot be split between two `hard@`
 * seats, so `ladder/run.ts` reported A10's and A16's columns only for a run
 * with exactly ONE `hard@` arm — which made `firstSearchAborted`, the
 * cold-start statistic the E1.4 §5 patch is judged by, unmeasurable in the very
 * contest that prices it (E1.4 §5, "Two prerequisites"). A bot that owns its
 * counters and hands them to the runner per seat closes that.
 */
/**
 * One row per SEARCH the hard seat ran, in order (E2 lane 1). `hardTiming`'s
 * totals say how long a game took; these say what each turn was actually
 * funded with and why it stopped — which is the pair
 * `docs/hard-ai/e2/E2-LANE1-WORK-FIT.md` found nothing on disk records. The
 * harness only carries it; `lab/hard-ai/bots/hard.ts` fills it in.
 */
export interface HardSeatTurnRow {
  /** `GameState.turn.turnNumber` this search was run for. */
  turn: number;
  /** The work rung the engine armed the meter with (`stats.rung`). */
  rung: number;
  /** Work actually spent (`RootResult.work`). */
  work: number;
  /** The engine's own measurement of its search. */
  elapsedMs: number;
  /** What the adapter measured around the same call. */
  searchMs: number;
  /** Wall ms this search was funded with (wall mode; 0 under fixed work). */
  fundedMs: number;
  /** Last COMPLETED depth. */
  depth: number;
  /** The engine's verdict: 'complete' | 'work' | 'abort'. */
  stopReason: string;
  /** `profile.unitsPerMs` before the rung was chosen and after the search's
   * measurement was folded in (0/0 under fixed work). */
  unitsPerMsBefore: number;
  unitsPerMsAfter: number;
  /** The A11 watchdog cut this search (`stopReason === 'abort'`). */
  deadlineCut: boolean;
}

export interface HardSeatTiming {
  turns: number;
  searches: number;
  reSearches: number;
  totalSearchMs: number;
  totalAdapterMs: number;
  overruns: number;
  maxTurnMs: number;
  budgetExhausted: number;
  emptyPlans: number;
  abortedSearches: number;
  firstSearchAborted: number;
  /** E2 lane 1's per-search rows, always on for a hard seat. Optional so an
   * older artifact (and `tests/lab/turn-allowance.test.ts`'s stub) still
   * satisfies the type. */
  turnRows?: HardSeatTurnRow[];
}

export interface EngineBot {
  kind: 'engine';
  name: string;
  onGameStart(player: PlayerId, seed: number): void;
  /** Return the next single action for the current state (re-planned per action). */
  nextAction(state: GameState, player: PlayerId): Promise<AIAction | null>;
  /**
   * This bot's own counters for the game it just played, or null when it keeps
   * none. Optional: only the hard adapter implements it, and the runner writes
   * whatever it returns into `PlayerGameStats.hardTiming` (E1.5).
   */
  timing?(): HardSeatTiming | null;
}

export type Bot = ScriptedBot | EngineBot;

export interface MatchOptions {
  /** Explicit map for paired comparisons; omitted means current production layout. */
  resourceLayout?: readonly number[];
  victoryRule?: GameState['victoryRule'];
  upkeep?: 'shipped'|'steep'|'off';
  inactivityRule?: 'on'|'off';
  /** Absolute full-round ceiling. Adjudicate after Black completes Prepare, at the next White Act root. */
  maxTurns: number;
  /** Emergency single-decision cap, including both phase ends and manual upkeep. May stop mid-turn. */
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
  /**
   * Starting-crystal handicap applied to Black by `createInitialGameState`
   * (DESIGN §7.7; distinct from the combat `handicap` above). 0..
   * `MAX_BLACK_CRYSTAL_HANDICAP` (20, `src/game/rules.ts`). Omitted means 0
   * (production default).
   */
  blackCrystalHandicap?: number;
  /** Actions-per-turn override threaded into `createInitialGameState`. Omitted means the game default (4). */
  actionsPerTurn?: GameState['actionsPerTurn'];
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  maxTurns: 120,
  maxPlies: 50000,
  legality: 'strict',
  recordReplay: false,
  checkInvariants: true,
  elementGraph: 'double-thick',
  handicap: { white: 0, black: 0 },
};

export type WinType =
  | 'inactivity'
  | 'upkeep-elimination'
  | 'home-occupation'
  | 'home-checkmate' // canonical `homeCheckmate.ts` forced-mate verdict (DESIGN §7.7)
  | 'elimination'
  | 'resignation'
  | 'adjudication' // turn/ply cap hit; material+stockpile decides
  | 'timeout' // engine failed to move inside its allotted decision time (ladder)
  | 'abandoned' // online room abandoned (master 03620df8, `VictoryReason`); never produced by the ladder
  | 'draw' // adjudication tie or mutual elimination
  | 'invariant-violation'; // game aborted; no winner

export interface PlayerGameStats {
  bot: string;
  upkeepPaid?: number;
  upkeepReleased?: {id:string;definitionId:string;tier:number;turn:number;homeDistance?:number|null}[];
  zeroStockpileTurns?: number;
  peakTier2Plus?: number;
  firstTier3Round?: number|null;
  finalResources: number;
  resourcesGained: number;
  resourcesSpent: number; // derived telemetry: gained minus bank
  finalPendingCost?: number; // refundable commitments, separate from actual material
  finalMaterial: number; // sum of on-board unit costs at end

  /** Purchase commitments, including ones later refunded; retained field name for consumers. */
  unitsPlaced: number;
  promotions: number;
  /** Units placed or promoted into each tier (placement counts the placed tier). */
  tierUsage: Record<1 | 2 | 3 | 4, number>;
  /** Units purchased per element over the whole game. */
  elementPurchased: Record<string, number>;
  unitsLost: number;
  unitsKilled: number;
  illegalActions: number; // engine-bot emissions not in the legal set
  plies: number; // actions taken by this player
  /** v3 (DESIGN §7.7): wall-clock ms this seat's bot spent inside `nextAction`
   * / `chooseAction` over the whole game. Per-SEAT, unlike `GameRecord.durationMs`,
   * so a ladder row can report each engine's own latency instead of the game's.
   * Optional so `muju-lab-game-v2` records still satisfy the type. */
  decisionMs?: number;
  /** v3: distinct game turns this seat was on move for — the denominator that
   * turns `decisionMs` into the per-turn latency §7.7's `meanTurnMs` reports. */
  turnsTaken?: number;
  /** v3: wall-clock ms this seat spent on EACH of its turns, in turn order —
   * one entry per `turnsTaken`, summing to `decisionMs`. A single number
   * cannot answer the p95 question M19 asks (AMENDMENTS-PENDING A4:
   * `p95TurnMs` is the 95th percentile over every turn of the seat), so the
   * per-turn samples are kept rather than only their total. Optional: records
   * written before this field existed simply have no per-turn detail. */
  turnMs?: number[];
  /**
   * v3 (E1.5): this SEAT's own hard-adapter counters for this game, straight
   * off the bot instance that played it (`EngineBot.timing`). Absent for a
   * seat whose bot keeps none — every scripted and `aiv2` bot — and for every
   * record written before the field existed, so a metric reads it as "unknown"
   * and never as a zero. `GameRecord.hardTiming` remains the process-wide
   * delta for the whole game; this is the per-arm truth a Hard-vs-Hard row
   * needs.
   */
  hardTiming?: HardSeatTiming;
}

export interface MaterialSample {
  turn: number;
  white: number; // on-board material (cost sum)
  black: number;
  whiteTier2Plus?: number;
  blackTier2Plus?: number;
  whiteRes: number;
  blackRes: number;
}

/** One JSONL row per game. */
export interface GameRecord {
  schema: 'muju-lab-game-v2' | 'muju-lab-game-v3';
  /**
   * The revision this game was PLAYED under. Missing only in historical
   * Standard artifacts. A `muju-phasing-1` row is readable but is never pooled
   * with a `muju-phasing-2` one: the draw clock moved from 10 plies to 20, so
   * the two populations answer different questions. `summary.ts` keys its
   * pairing groups on this field and `ladder/run.ts#resumeIdentityMismatches`
   * refuses a resume across it.
   */
  rulesVersion?: RulesVersion;
  completedTurns?: number; // player turns ended via END_PLACE_PHASE during this run
  capReason?: 'round-cap' | 'ply-cap';
  maxInactivityPlies?: number;
  inactivityDraw?: boolean;
  upkeepElimination?: boolean;
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
  /** v3 (DESIGN §7.7, ladder): present when either seat ran at a fixed work budget. */
  fixedWork?: number;
  /** v3: present when either seat ran at a wall-clock decision budget (ms). */
  decisionMs?: number;
  /** v3: hash identifying the exact engine config (difficulty/speed/HardConfig) driving each seat, joined `white|black`. */
  engineConfigHash?: string;
  /** v3: hash of the evaluation weights file in play, when applicable (`hard@<label>` engines only). */
  weightsHash?: string;
  /** v3: this game's share of the process-wide hard-bot adapter counters
   * (`lab/hard-ai/bots/hard.ts#hardBotTiming`), folded in per game by
   * `lab/hard-ai/ladder/worker.ts` with the same snapshot-and-subtract it uses
   * for divergences. Counters are exact deltas; `maxTurnMs` is a high-water
   * mark, so it is this game's worst turn only when that turn beat every
   * earlier one in the process (0 otherwise — the per-turn truth is
   * `PlayerGameStats.turnMs`). Absent on records written outside the ladder.
   * Structurally identical to `HardBotTiming`, spelled here so the harness
   * keeps no dependency on `lab/hard-ai`. */
  hardTiming?: {
    turns: number;
    searches: number;
    reSearches: number;
    totalSearchMs: number;
    totalAdapterMs: number;
    overruns: number;
    maxTurnMs: number;
    budgetExhausted: number;
    /** A10/A16 additions. Optional because records written before them carry
     * neither, and a metric must not report a missing count as a zero:
     * `ladder/run.ts` reports `null` for an arm whose games never carried the
     * field. */
    emptyPlans?: number;
    abortedSearches?: number;
    firstSearchAborted?: number;
  };
  /** v3: true when `winType === 'adjudication'` (turn/ply cap decided the game by score, not play). */
  adjudicated?: boolean;
  /** v3: starting black-crystal handicap for this game (`MatchOptions.blackCrystalHandicap`, default 0). */
  handicap?: number;
  /** v3: the formula used to break adjudicated games. Always `'material+bank'` today (SU addendum 2). */
  adjudicationFormula?: 'material+bank' | 'material+bank+pending-cost';
  incomeCurve: {player:PlayerId;turn:number;income:number;remaining:number;zeroReserveUnits:number;byTier:Record<string,number>;byElement:Record<string,number>;bank:number;tier1Share:number}[];
  round90Exhaustion: number|null;
  purchases: {player:PlayerId;turn:number;definitionId:string}[];
  promotionEvents: {player:PlayerId;turn:number;unitId:string;definitionId:string}[];
  placedAndAttackedKills: number;
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
  /** 100 reserves in row-major order; 10 is a single cell value. */
  pendingSummons?: Array<{ o: PlayerId; d: string; x: number; y: number; cost: number }>;
  cells: number[];
  res: Record<PlayerId, { r: number; g: number; s: number }>; // resources, gained, spent
}

export interface ReplayFile {
  schema: 'muju-lab-replay-v2';
  meta: GameRecord;
  steps: ReplayStep[];
}
