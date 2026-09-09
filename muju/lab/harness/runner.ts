import { setUpkeepVariant, defaultUpkeepAction } from '../../src/game/upkeep';
import { phaseEndAction } from '../../src/game/legality';
import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import { createInitialGameState } from '../../src/game/board';
import { getUnitDefinition } from '../../src/game/units';
import { getNextTierDefinition } from '../../src/game/units';
import { checkVictory } from '../../src/game/victory';
import { applyAction } from '../../src/ai/simulate';
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
import { setElementGraph } from '../../src/game/elements';
import { setCombatHandicap, resetCombatHandicap } from '../../src/game/combat';

function otherPlayer(p: PlayerId): PlayerId {
  return p === 'white' ? 'black' : 'white';
}

export function buildView(state: GameState, player: PlayerId): BotView {
  const opponent = otherPlayer(player);
  return { state, player, opponent, phase:state.turn.phase, actionsRemaining:state.turn.actionsRemaining,
    turnNumber:state.turn.turnNumber, board:state.board, me:state.players[player], enemy:state.players[opponent] };
}

function onBoardMaterial(state: GameState, player: PlayerId): number {
  return state.board.units
    .filter((u) => u.owner === player)
    .reduce((sum, u) => sum + getUnitDefinition(u.definitionId).cost, 0);
}

function unitCount(state: GameState, player: PlayerId): number {
  return state.board.units.filter((u) => u.owner === player).length;
}

function snapshotStep(state: GameState, ply: number, actor: PlayerId, action: AIAction | null): ReplayStep {
  const cells = state.board.cells.flat().map(cell => cell.resourceLayers);
  const res = {} as ReplayStep['res'];
  for (const p of ['white', 'black'] as PlayerId[]) {
    const ps = state.players[p];
    res[p] = { r: ps.resources, g: ps.resourcesGained, s: ps.resourcesGained - ps.resources };
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
  /** Read-only lab instrumentation; never supplied by gameplay. */
  onAction?: (before: GameState, after: GameState, action: AIAction, player: PlayerId) => void;
}

export interface PlayGameResult {
  record: GameRecord;
  replay: ReplayFile | null;
}

export async function playGame(args: PlayGameArgs): Promise<PlayGameResult> {
  const options: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, ...args.options };

  // Engine knobs for this game (module-global; games run sequentially).
  // Reset in the finally below so no game leaks config into the next.
  setUpkeepVariant(options.upkeep??'shipped');
  setElementGraph(options.elementGraph);
  setCombatHandicap('white', options.handicap.white);
  setCombatHandicap('black', options.handicap.black);
  try {
    return await playGameInner(args, options);
  } finally {
    setUpkeepVariant('shipped');
    setElementGraph('double-thick');
    resetCombatHandicap();
  }
}

async function playGameInner(args: PlayGameArgs, options: MatchOptions): Promise<PlayGameResult> {
  const { bots, seed } = args;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let state = createInitialGameState(options.resourceLayout);
  state.victoryRule = options.victoryRule;
  state.inactivityRule = options.inactivityRule;
  const rngs: Record<PlayerId, () => number> = {
    white: mulberry32(deriveSeed(seed, 0)),
    black: mulberry32(deriveSeed(seed, 1)),
  };

  const stats: Record<PlayerId, PlayerGameStats> = {
    white: emptyStats(bots.white.name),
    black: emptyStats(bots.black.name),
  };
  const anomalies: string[] = [];
  const incomeCurve: GameRecord['incomeCurve'] = [], purchases: GameRecord['purchases'] = [], promotionEvents: GameRecord['promotionEvents'] = [];
  let round90Exhaustion: number|null = null, placedAndAttackedKills = 0;
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
  let maxInactivityPlies=0;
  const sampledStarts={white:1,black:0};
  stats.white.zeroStockpileTurns=state.players.white.resources===0?1:0;

  if (options.recordReplay) {
    steps.push(snapshotStep(state, 0, 'white', null)); // initial position
  }

  gameLoop: while (true) {
    // Terminal checks
    if (state.phase === 'victory') {
      winner = state.winner;
      const result = checkVictory(state.board);
      winType = state.victoryReason ?? (result.status === 'victory' ? 'elimination' : 'resignation');
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
      const scoreW = onBoardMaterial(state, 'white') + state.players.white.resources;
      const scoreB = onBoardMaterial(state, 'black') + state.players.black.resources;
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
    if (!state.upkeepPending && state.turn.currentPlayer === 'white' && state.turn.turnNumber > lastSampledTurn) {
      lastSampledTurn = state.turn.turnNumber;
      materialCurve.push({
        turn: state.turn.turnNumber,
        whiteTier2Plus: state.board.units.filter(u=>u.owner==='white'&&getUnitDefinition(u.definitionId).tier>1).length,
        blackTier2Plus: state.board.units.filter(u=>u.owner==='black'&&getUnitDefinition(u.definitionId).tier>1).length,
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
    if(state.upkeepPending && bot.kind==='scripted') {
      action=defaultUpkeepAction(state,/AntiRush|Guard/.test(bot.name));
    } else if (bot.kind === 'scripted') {
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
        anomalies.push(`illegal ${player} action at ply ${ply + 1}: ${JSON.stringify(action)}`);
        if (options.legality === 'strict') {
          action = null; // replaced with phase-end fallback below
        }
        // 'as-shipped': fall through and apply — this is what APPLY_AI_ACTION
        // does in the real game (divergences D1/D2). Counted for calibration.
      }
    }

    // Fallback when the bot passes (or strict mode rejected): end the phase.
    if (!action) action=phaseEndAction(state);

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
            ? applyAction(state, { type: 'END_PLACE_PHASE' })
            : applyAction(state, { type: 'END_ACTION_PHASE' });
        consecutiveNoops = 0;
      }
    } else {
      consecutiveNoops = 0;
    }

    if (state.lastIncome && state.lastIncome !== before.lastIncome) {
      const {player: p,turnNumber:turn,total:income,takes} = state.lastIncome;
      const remaining=state.board.cells.flat().reduce((n,c)=>n+c.resourceLayers,0);
      const initial=state.board.initialResourceLayers!.reduce((n,c)=>n+c,0);
      if(round90Exhaustion===null && remaining<=initial*.1)round90Exhaustion=turn;
      const byTier:Record<string,number>={},byElement:Record<string,number>={};
      for(const t of takes){const d=getUnitDefinition(t.definitionId);byTier[d.tier]=(byTier[d.tier]??0)+t.amount;byElement[d.element]=(byElement[d.element]??0)+t.amount;}
      const own=before.board.units.filter(u=>u.owner===p);
      incomeCurve.push({player:p,turn,income,remaining,byTier,byElement,bank:before.players[p].resources,
        zeroReserveUnits:own.filter(u=>state.board.cells[u.position.y][u.position.x].resourceLayers===0).length,
        tier1Share:own.length?own.filter(u=>getUnitDefinition(u.definitionId).tier===1).length/own.length:0});
    }
    if(applied && action.type==='BUY_UNIT')purchases.push({player,turn:before.turn.turnNumber,definitionId:action.definitionId});
    if(applied && action.type==='PROMOTE_UNIT')promotionEvents.push({player,turn:before.turn.turnNumber,unitId:action.unitId,definitionId:state.board.units.find(u=>u.id===action.unitId)!.definitionId});
    if(applied && action.type==='ATTACK' && before.board.units.find(u=>u.id===action.unitId)?.placedThisTurn && state.board.units.length<before.board.units.length)placedAndAttackedKills++;
    args.onAction?.(before, state, action, player);

    maxInactivityPlies=Math.max(maxInactivityPlies,state.inactivityPlies??0);
    if(state.lastUpkeep && state.lastUpkeep!==before.lastUpkeep){
      const rent=state.lastUpkeep,p=rent.player;
      stats[p].upkeepPaid!+=rent.paid;
      stats[p].upkeepReleased!.push(...rent.released.map(u=>{const unit=before.board.units.find(x=>x.id===u.id),home=before.players[p].startCorner;return {...u,turn:rent.turnNumber,homeDistance:unit?Math.abs(unit.position.x-home.x)+Math.abs(unit.position.y-home.y):null};}));
    }
    for(const p of ['white','black'] as const){
      const own=state.board.units.filter(u=>u.owner===p);
      stats[p].peakTier2Plus=Math.max(stats[p].peakTier2Plus??0,own.filter(u=>getUnitDefinition(u.definitionId).tier>1).length);
      if(stats[p].firstTier3Round===null&&own.some(u=>getUnitDefinition(u.definitionId).tier===3))stats[p].firstTier3Round=state.turn.turnNumber;
      if(state.turn.currentPlayer===p&&!state.upkeepPending&&sampledStarts[p]!==state.turn.turnNumber){sampledStarts[p]=state.turn.turnNumber;if(state.players[p].resources===0)stats[p].zeroStockpileTurns!++;}
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
    if (action.type === 'BUY_UNIT' && applied) {
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
    if (action.type === 'BUY_UNIT' && applied) {
      const el = getUnitDefinition(action.definitionId).element;
      stats[player].elementPurchased[el] = (stats[player].elementPurchased[el] ?? 0) + 1;
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
    stats[p].resourcesSpent = state.players[p].resourcesGained - state.players[p].resources;
    stats[p].finalMaterial = onBoardMaterial(state, p);
  }

  const record: GameRecord = {
    incomeCurve,round90Exhaustion,purchases,promotionEvents,placedAndAttackedKills,
    schema: 'muju-lab-game-v2',
    maxInactivityPlies,inactivityDraw:state.victoryReason==='inactivity',upkeepElimination:state.victoryReason==='upkeep-elimination',
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
    replay: options.recordReplay ? { schema: 'muju-lab-replay-v2', meta: record, steps } : null,
  };
}

function emptyStats(botName: string): PlayerGameStats {
  return {
    bot: botName,
    upkeepPaid:0,upkeepReleased:[],zeroStockpileTurns:0,peakTier2Plus:0,firstTier3Round:null,
    finalResources: 0,
    resourcesGained: 0,
    resourcesSpent: 0,
    finalMaterial: 0,
    unitsPlaced: 0,
    promotions: 0,
    tierUsage: { 1: 0, 2: 0, 3: 0, 4: 0 },
    elementPurchased: {},
    unitsLost: 0,
    unitsKilled: 0,
    illegalActions: 0,
    plies: 0,
  };
}

// re-export for bots that need it
export { getNextTierDefinition };
