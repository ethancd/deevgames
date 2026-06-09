import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import { createInitialGameState } from '../../src/game/board';
import { getUnitDefinition } from '../../src/game/units';
import { getNextTierDefinition } from '../../src/game/units';
import { checkVictory } from '../../src/game/victory';
import { applyAction } from '../../src/ai/simulate';
import { extractPublicState, extractPrivateState } from '../../src/ai/state/observation';
import type {
  Bot,
  BotView,
  GameRecord,
  MatchOptions,
  MaterialSample,
  PlayerGameStats,
  ReplayFile,
  ReplayStep,
  WinType,
} from './types';
import { DEFAULT_MATCH_OPTIONS } from './types';
import { legalActions, actionsEqual, isLegalNow } from './legal';
import { checkInvariants, InvariantViolation } from './invariants';
import { mulberry32, deriveSeed } from './rng';

function otherPlayer(p: PlayerId): PlayerId {
  return p === 'white' ? 'black' : 'white';
}

/**
 * Bot view over the engine's observation layer: opponent stockpile/queue are
 * masked by extractPublicState, own private state comes from
 * extractPrivateState. Scripted bots can only see what a human opponent sees.
 */
function buildView(state: GameState, player: PlayerId): BotView {
  const pub = extractPublicState(state, player);
  const own = extractPrivateState(state, player);
  const opp = otherPlayer(player);
  return {
    player,
    opponent: opp,
    phase: pub.turn.phase,
    actionsRemaining: pub.turn.actionsRemaining,
    turnNumber: pub.turn.turnNumber,
    board: pub.board,
    me: {
      resources: own.resources,
      buildQueue: own.buildQueue,
      resourcesGained: pub.players[player].resourcesGained,
      resourcesSpent: pub.players[player].resourcesSpent,
      startCorner: pub.players[player].startCorner,
    },
    enemy: {
      resourcesGained: pub.players[opp].resourcesGained,
      resourcesSpent: pub.players[opp].resourcesSpent,
      startCorner: pub.players[opp].startCorner,
    },
  };
}

function onBoardMaterial(state: GameState, player: PlayerId): number {
  return state.board.units
    .filter((u) => u.owner === player)
    .reduce((sum, u) => sum + getUnitDefinition(u.definitionId).cost, 0);
}

function queueValue(state: GameState, player: PlayerId): number {
  return state.players[player].buildQueue.reduce(
    (sum, q) => sum + getUnitDefinition(q.definitionId).cost,
    0
  );
}

function unitCount(state: GameState, player: PlayerId): number {
  return state.board.units.filter((u) => u.owner === player).length;
}

function snapshotStep(state: GameState, ply: number, actor: PlayerId, action: AIAction | null): ReplayStep {
  let cells = '';
  for (const row of state.board.cells) {
    for (const cell of row) cells += String(cell.resourceLayers);
  }
  const res = {} as ReplayStep['res'];
  for (const p of ['white', 'black'] as PlayerId[]) {
    const ps = state.players[p];
    res[p] = { r: ps.resources, g: ps.resourcesGained, s: ps.resourcesSpent, q: ps.buildQueue.length };
  }
  return {
    ply,
    turn: state.turn.turnNumber,
    player: actor,
    phase: state.turn.phase,
    actionsRemaining: state.turn.actionsRemaining,
    action,
    units: state.board.units.map((u) => ({
      o: u.owner,
      d: u.definitionId,
      x: u.position.x,
      y: u.position.y,
      dmg: u.damageTaken,
    })),
    cells,
    res,
  };
}

export interface PlayGameArgs {
  bots: Record<PlayerId, Bot>;
  seed: number;
  engineHash: string;
  runId: string;
  experiment?: string | null;
  options?: Partial<MatchOptions>;
}

export interface PlayGameResult {
  record: GameRecord;
  replay: ReplayFile | null;
}

export async function playGame(args: PlayGameArgs): Promise<PlayGameResult> {
  const options: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, ...args.options };
  const { bots, seed } = args;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let state = createInitialGameState();
  const rngs: Record<PlayerId, () => number> = {
    white: mulberry32(deriveSeed(seed, 0)),
    black: mulberry32(deriveSeed(seed, 1)),
  };

  const stats: Record<PlayerId, PlayerGameStats> = {
    white: emptyStats(bots.white.name),
    black: emptyStats(bots.black.name),
  };
  const anomalies: string[] = [];
  const materialCurve: MaterialSample[] = [];
  const steps: ReplayStep[] = [];

  bots.white.onGameStart?.('white', deriveSeed(seed, 0));
  bots.black.onGameStart?.('black', deriveSeed(seed, 1));

  let firstBlood: GameRecord['firstBlood'] = null;
  let invariantViolation: string | null = null;
  let winner: PlayerId | null = null;
  let winType: WinType | null = null;
  let ply = 0;
  let lastSampledTurn = 0;
  let consecutiveNoops = 0;

  if (options.recordReplay) {
    steps.push(snapshotStep(state, 0, 'white', null)); // initial position
  }

  gameLoop: while (true) {
    // Terminal checks
    if (state.phase === 'victory' && state.winner) {
      winner = state.winner;
      const result = checkVictory(state.board);
      winType = result.status === 'victory' ? 'elimination' : 'resignation';
      break;
    }
    const vic = checkVictory(state.board);
    if (vic.status === 'victory') {
      winner = vic.winner;
      winType = 'elimination';
      break;
    }
    if (vic.status === 'draw') {
      winner = null;
      winType = 'draw';
      break;
    }

    // Caps → adjudication
    if (state.turn.turnNumber > options.maxTurns || ply >= options.maxPlies) {
      if (ply >= options.maxPlies) anomalies.push(`ply-cap ${options.maxPlies} hit`);
      const scoreW = onBoardMaterial(state, 'white') + state.players.white.resources + queueValue(state, 'white');
      const scoreB = onBoardMaterial(state, 'black') + state.players.black.resources + queueValue(state, 'black');
      if (scoreW === scoreB) {
        winner = null;
        winType = 'draw';
      } else {
        winner = scoreW > scoreB ? 'white' : 'black';
        winType = 'adjudication';
      }
      break;
    }

    // Material curve: sample at the start of each white turn (new round)
    if (state.turn.currentPlayer === 'white' && state.turn.turnNumber > lastSampledTurn) {
      lastSampledTurn = state.turn.turnNumber;
      materialCurve.push({
        turn: state.turn.turnNumber,
        white: onBoardMaterial(state, 'white'),
        black: onBoardMaterial(state, 'black'),
        whiteRes: state.players.white.resources,
        blackRes: state.players.black.resources,
      });
    }

    const player = state.turn.currentPlayer;
    const bot = bots[player];
    const before = state;

    // Choose an action
    let action: AIAction | null = null;
    if (bot.kind === 'scripted') {
      const legal = legalActions(state, player);
      if (legal.length > 0) {
        const ctx = { view: buildView(state, player), legal, rng: rngs[player] };
        action = bot.chooseAction(ctx);
        if (action && !legal.some((l) => actionsEqual(l, action!))) {
          throw new Error(
            `Bot ${bot.name} (${player}) returned an action outside the legal set: ${JSON.stringify(action)}`
          );
        }
      }
    } else {
      action = await bot.nextAction(state, player);
      if (action && !isLegalNow(state, player, action)) {
        stats[player].illegalActions++;
        if (options.legality === 'strict') {
          action = null; // replaced with phase-end fallback below
        }
        // 'as-shipped': fall through and apply — this is what APPLY_AI_ACTION
        // does in the real game (divergences D1/D2). Counted for calibration.
      }
    }

    // Fallback when the bot passes (or strict mode rejected): end the phase.
    if (!action) {
      if (state.turn.phase === 'place') {
        // No END_PLACE_PHASE in the AI action union; mirror useAI's phase hop.
        state = { ...state, turn: { ...state.turn, phase: 'action' } };
        continue;
      }
      action = state.turn.phase === 'action' ? { type: 'END_ACTION_PHASE' } : { type: 'END_TURN' };
    }

    // Pre-application bookkeeping for kill attribution
    const unitsW = unitCount(state, 'white');
    const unitsB = unitCount(state, 'black');

    const afterAction = applyAction(state, action);
    const applied = afterAction !== before;
    state = afterAction;
    ply++;
    stats[player].plies++;

    // No-op guard: a bot stuck emitting actions the simulator rejects would
    // spin forever (applyAction returns the same reference on invalid input).
    if (!applied) {
      consecutiveNoops++;
      anomalies.push(`noop action by ${player} at ply ${ply}: ${action.type}`);
      if (consecutiveNoops >= 3) {
        state =
          state.turn.phase === 'place'
            ? { ...state, turn: { ...state.turn, phase: 'action' } }
            : applyAction(state, state.turn.phase === 'action' ? { type: 'END_ACTION_PHASE' } : { type: 'END_TURN' });
        consecutiveNoops = 0;
      }
    } else {
      consecutiveNoops = 0;
    }

    // Stats
    const dW = unitsW - unitCount(state, 'white');
    const dB = unitsB - unitCount(state, 'black');
    if (action.type === 'ATTACK' && applied) {
      const enemyLost = player === 'white' ? dB : dW;
      if (enemyLost > 0) {
        stats[player].unitsKilled += enemyLost;
        stats[otherPlayer(player)].unitsLost += enemyLost;
        if (!firstBlood) firstBlood = { by: player, turn: state.turn.turnNumber };
      }
    }
    if (action.type === 'PLACE_UNIT' && applied) {
      stats[player].unitsPlaced++;
      const placed = state.board.units[state.board.units.length - 1];
      if (placed && placed.owner === player) {
        const tier = getUnitDefinition(placed.definitionId).tier;
        stats[player].tierUsage[tier]++;
      }
    }
    if (action.type === 'PROMOTE_UNIT' && applied) {
      stats[player].promotions++;
      const promoted = state.board.units.find((u) => u.id === action.unitId);
      if (promoted) {
        stats[player].tierUsage[getUnitDefinition(promoted.definitionId).tier]++;
      }
    }
    if (action.type === 'QUEUE_UNIT' && applied) {
      const el = getUnitDefinition(action.definitionId).element;
      stats[player].elementQueued[el] = (stats[player].elementQueued[el] ?? 0) + 1;
    }

    if (options.recordReplay) {
      steps.push(snapshotStep(state, ply, player, action));
    }

    if (options.checkInvariants) {
      try {
        checkInvariants(state, `seed ${seed} ply ${ply} (${player} ${action.type})`);
      } catch (e) {
        if (e instanceof InvariantViolation) {
          invariantViolation = e.message;
          winner = null;
          winType = 'invariant-violation';
          break gameLoop;
        }
        throw e;
      }
    }
  }

  for (const p of ['white', 'black'] as PlayerId[]) {
    stats[p].finalResources = state.players[p].resources;
    stats[p].resourcesGained = state.players[p].resourcesGained;
    stats[p].resourcesSpent = state.players[p].resourcesSpent;
    stats[p].finalMaterial = onBoardMaterial(state, p);
    stats[p].finalQueueValue = queueValue(state, p);
  }

  const record: GameRecord = {
    schema: 'muju-lab-game-v1',
    engineHash: args.engineHash,
    runId: args.runId,
    experiment: args.experiment ?? null,
    seed,
    startedAt,
    durationMs: Date.now() - t0,
    options,
    winner,
    winType: winType ?? 'draw',
    turns: state.turn.turnNumber,
    plies: ply,
    firstBlood,
    players: stats,
    materialCurve,
    invariantViolation,
    anomalies,
  };

  return {
    record,
    replay: options.recordReplay ? { schema: 'muju-lab-replay-v1', meta: record, steps } : null,
  };
}

function emptyStats(botName: string): PlayerGameStats {
  return {
    bot: botName,
    finalResources: 0,
    resourcesGained: 0,
    resourcesSpent: 0,
    finalMaterial: 0,
    finalQueueValue: 0,
    unitsPlaced: 0,
    promotions: 0,
    tierUsage: { 1: 0, 2: 0, 3: 0, 4: 0 },
    elementQueued: {},
    unitsLost: 0,
    unitsKilled: 0,
    illegalActions: 0,
    plies: 0,
  };
}

// re-export for bots that need it
export { getNextTierDefinition };
