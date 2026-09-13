import type { GameState, PlayerId } from '../src/game/types';
import type { RoomAction, RoomSnapshot } from '../src/online/types';
import { getUnitAt } from '../src/game/board';
import { getActionsPerTurn } from '../src/game/rules';
import { INITIAL_MAP_RESOURCES, MAX_RESOURCE_RESERVE, RESOURCE_MAP_NAME, UNEQUAL_ROUTES_MAP } from '../src/game/resourceMap';
import { getMovementRange, getMoveCost } from '../src/game/movement';
import { calculateAttackPower, calculateDefense, getAttackCount, getValidAttacks } from '../src/game/combat';
import { generatePlacePhaseActions } from '../src/ai/moves';
import { isLegalAction } from '../src/game/legality';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../src/game/units';
import { defaultUpkeepAction, unitUpkeep, upkeepDue } from '../src/game/upkeep';
import { projectedIncome } from '../src/game/mining';
import { getHomeOccupier } from '../src/game/victory';
import { INACTIVITY_LIMIT } from '../src/game/inactivity';
import { TIME_CONTROL_PRESETS } from '../src/online/timeControl';
import { square, describeAction } from './notation';
import { analysisService } from './analysis';
export { square, describeAction } from './notation';

export function observe(room: RoomSnapshot, perspective = room.state.turn.currentPlayer) {
  const s = room.state;
  return {
    roomId: room.id, revision: room.revision, ready: room.ready, seats: room.seats,
    canUndo: !!room.canUndo,
    timeControl: room.timeControl ?? null, clock: room.clock ?? null, clockPressure: room.clockPressure ?? null,
    ...(room.staging ? { staging: room.staging } : {}),
    analysis: analysisService.headline(room, perspective),
    historyTool: 'muju_history',
    activePlayer: room.ready && s.phase === 'playing' ? s.turn.currentPlayer : null,
    status: s.phase, turn: s.turn, actionsPerTurn: getActionsPerTurn(s), blackCrystalHandicap: s.blackCrystalHandicap ?? 0, upkeepPending: !!s.upkeepPending,
    winner: s.winner, victoryReason: s.victoryReason ?? null,
    nextStep: !room.ready ? 'Invite the opponent, then wait for them to join.' : s.phase === 'victory' ? 'Game finished.'
      : s.upkeepPending ? 'Choose PAY_UPKEEP keepUnitIds; all tier 1 units must stay. Higher tiers omitted are released.'
      : `${s.turn.currentPlayer} may act. Read legal actions, optionally preview, then play using this revision.`,
    players: Object.fromEntries((['white', 'black'] as const).map(player => [player, {
      ...s.players[player], home: square(s.players[player].startCorner), projectedIncome: projectedIncome(s, player),
      upkeepDue: upkeepDue(s, player), reviewUpkeep: !!s.reviewUpkeep?.[player],
      occupyingEnemyHome: getHomeOccupier(s.board, player)?.id ?? null,
    }])),
    quietTurns: s.inactivityPlies ?? 0, drawAtQuietTurns: INACTIVITY_LIMIT,
    // Separate matrices avoid repeating 100 coordinate objects in every tool response.
    coordinates: 'Columns A–J left to right; rows 1–10 top to bottom. White home A1; Black home J10. No perspective flipping.',
    board: s.board.cells.map(row => row.map(c => {
      const u = getUnitAt(s.board, c.position);
      return u ? `${u.owner === 'white' ? 'W' : 'B'}:${u.definitionId}` : '.';
    }).join(' ')),
    reserves: s.board.cells.map(row => row.map(c => c.resourceLayers)),
    units: s.board.units.map(u => ({ owner: u.owner, square: square(u.position),
      ...getUnitDefinition(u.definitionId), definitionId: u.definitionId, id: u.id,
      effectiveDefense: calculateDefense(u), upkeep: unitUpkeep(u), canActThisTurn: u.canActThisTurn,
      attacksUsed: getAttackCount(u), lastAttackKilled: !!u.lastAttackKilled,
      placedThisTurn: !!u.placedThisTurn, promotedThisPlacement: !!u.promotedThisPlacement,
    })),
    lastIncome: s.lastIncome, lastUpkeep: s.lastUpkeep,
    recentActions: room.history.slice(-8).map(h => ({ ...h, actions: h.actions.map(describeAction) })),
  };
}

export function legalActions(room: RoomSnapshot, options: { unitId?: string; type?: string; offset?: number; limit?: number } = {}) {
  const s: GameState = room.state, player: PlayerId = s.turn.currentPlayer;
  let actions: RoomAction[] = [];
  if (room.ready && s.phase === 'playing') {
    if (s.upkeepPending) actions = [defaultUpkeepAction(s)];
    else if (s.turn.phase === 'place') actions = generatePlacePhaseActions(s, player);
    else {
      for (const u of s.board.units.filter(u => u.owner === player && u.canActThisTurn)) {
        actions.push(...getValidAttacks(u, s.board).map(targetPosition => ({ type: 'ATTACK' as const, unitId: u.id, targetPosition })));
        actions.push(...getMovementRange(u.position, getUnitDefinition(u.definitionId).speed, s.turn.actionsRemaining, s.board)
          .map(p => ({ type: 'MOVE' as const, unitId: u.id, to: p.position })));
      }
      actions.push({ type: 'END_ACTION_PHASE' });
    }
    actions.push({ type: 'RESIGN' });
    if (room.canUndo) actions.push({ type: 'UNDO' });
  }
  actions = actions.filter(a => (a.type === 'UNDO' || (a.type !== 'SET_UPKEEP_REVIEW' && isLegalAction(s, a))) && (!options.type || a.type === options.type)
    && (!options.unitId || ('unitId' in a && a.unitId === options.unitId)));
  const offset = options.offset ?? 0, limit = options.limit ?? 60;
  return { roomId: room.id, revision: room.revision, currentPlayer: player, total: actions.length,
    timeControl: room.timeControl ?? null, clock: room.clock ?? null, clockPressure: room.clockPressure ?? null,
    nextOffset: offset + limit < actions.length ? offset + limit : null,
    upkeepNote: s.upkeepPending ? 'One affordable keep-set is shown. You may submit any affordable keepUnitIds containing every tier 1 unit.' : undefined,
    actions: actions.slice(offset, offset + limit).map(action => {
      const u = 'unitId' in action ? s.board.units.find(u => u.id === action.unitId)! : null;
      const target = action.type === 'ATTACK' ? getUnitAt(s.board, action.targetPosition)! : null;
      return { action: describeAction(action),
        ...(action.type === 'MOVE' && u ? { actionCost: getMoveCost(u.position, action.to, getUnitDefinition(u.definitionId).speed, s.board) } : {}),
        ...(u && target ? { actionCost: 1, targetUnitId: target.id, attack: calculateAttackPower(u, target),
          defense: calculateDefense(target), eliminates: calculateAttackPower(u, target) >= calculateDefense(target) } : {}),
      };
    }) };
}

export const rules = {
  resourceMap: { name: RESOURCE_MAP_NAME, total: INITIAL_MAP_RESOURCES, maximumReserve: MAX_RESOURCE_RESERVE,
    startingReserves: [...new Set(UNEQUAL_ROUTES_MAP)].sort((a, b) => a - b),
    layout: Array.from({ length: 10 }, (_, row) => UNEQUAL_ROUTES_MAP.slice(row * 10, row * 10 + 10)),
    compatibility: 'This map applies to new games and restarts. Existing games retain their stored reserves; use the room observation for its actual map. The current unit catalogue applies to all games.' },
  blackCrystalHandicap: {
    default: 0, min: 1, max: 20,
    setup: 'Optional creation-only starting crystals for Black. Omit or use 0 for the standard start. White starts with 0 and moves first. This grant is separate from mined income and is not repeated on later turns.',
    opening: 'Black skips Place & Promote on turn 1 with 0–2 crystals; with 3–20 it enters Place & Promote. Normal purchase and promotion costs apply; both sides still have four actions.',
  },
  analysis: {
    workflow: 'Observe with briefing:true and player for one turn-start call. muju_analyze batches topics and targets at expectedRevision; use hypotheticalActions for complete proposed turns. Focus threats before exposure, exchange/reply for trades, and checkmate before home attempts. sinceRevision returns changed sections when a compatible process-local baseline is cached, otherwise a labeled full result.',
    proof: 'proven_possible requires an engine witness. proven_impossible applies only to the declared complete search scope. unknown never means safe. Best-found costs are not proven minima. Replies are one-ply objectives, not minimax. Structural defenders and survival profiles are conditional, not executed purchases.',
    limits: 'Headlines use existing single-hit flags; briefings are bounded summaries. Focused deep:true searches legal combinations within shared AP, treasury, occupancy and attack flags. Read every search cutoff and omission. Analysis never commits actions or reserves clock time; play uses the authoritative revision and seat token.',
  },
  timeControl: {
    skill: { tool: 'muju_time_awareness', resource: 'muju://skills/muju-time-awareness',
      scope: 'Player advice and implemented staged-play/clockPressure protocol. The player chooses moves and time expenditure; model effort remains a client concern.' },
    presets: TIME_CONTROL_PRESETS,
    configuration: 'Optional at muju_create_room only: timeControl is blitz, rapid, classical, {delaySeconds,bankSeconds}, or null/omitted for untimed. Delay 0–600 seconds, bank 1–14400 seconds per player. Cannot change after creation.',
    timing: 'Each player has a separate bank shared across their own turns. Each full player turn starts with a fresh free delay; only after that delay does their bank drain. Unused delay is discarded, never added to the bank. Upkeep, placement and all four actions share one delay. Partial commands, phase changes, undo, previews, reads and retries never reset it.',
    enforcement: 'White’s clock starts immediately when the second player joins. No pause for disconnection, thinking, waiting, replay or server downtime. At deadlineAtMs the active player loses with victoryReason=timeout, even with no connected clients. The server checks deadlines before accepting commands; a late play/preview returns TIME_EXPIRED and the terminal room. Successful identical retries remain idempotent.',
    agentWorkflow: 'Read rules and prepare before joining. Inspect clock in observations, legal actions and play responses, or use muju_clock for a small fresh read. All timestamps are server Unix milliseconds. Time left at observation = deadlineAtMs − serverNowMs; subtract your locally elapsed time and allow for network latency. Do not wait on your own running turn. Submit END_ACTION_PHASE before the deadline; merely spending all AP does not hand off. Prefer a legal atomic turn batch and limit previews when short on time. A preview’s liveClock describes the real game, not its hypothetical board. Ordinary ticks do not change revision; timed unchanged waits include clock. A timeout advances revision and wakes waits with a result event.',
    estimates: 'Approximate wall time if most time is used: 2 × bankSeconds + total player turns × delaySeconds. Blitz ≈10 minutes at 36 turns, rapid ≈45 minutes at 50 turns, classical ≈2 hours at 60 turns. These are pacing suggestions, not duration guarantees.',
    staging: {
      tools: ['muju_stage', 'muju_cancel_stage', 'muju_staged'], resource: 'muju://skills/muju-time-awareness/staged-play',
      workflow: 'Read clock/clockPressure and briefing; stage an early player-authored candidate, choose a sustainable thinking budget, improve/replace, commit earlier or let it fire, then check private status. No automatic moves, repairs, appended end-turn or model-effort control.',
      request: 'Stage with token, requestId, expectedTurnNumber, expectedStageVersion (outer private status version, initially 0), commitWhenRemainingMs, actions (1–32), and optional fallbacks (up to three complete batches). Use new IDs for replacements; retry identical normalized requests with the same ID. Cancel uses token, requestId, expectedTurnNumber and expectedStageVersion. Inspect optionally by stageId. No expectedRevision: live play/undo may intervene.',
      trigger: 'Remaining means total delay plus bank until flag-fall. A positive integer no greater than this turn’s starting allowance; already-due triggers fire immediately if time remains. Five seconds remaining can spend almost the entire bank. Choose larger thresholds or commit earlier to conserve time.',
      execution: 'SQLite serializes all operations. Expiry resolves first, then due stage, then incoming operation. Fire validates whole batches atomically against the real board and executes the first legal player-authored batch in order. All illegal consumes the stage, records private failure and keeps the clock running. END_ACTION_PHASE is optional. Ordinary undo and immediate home-checkmate tail cancellation apply.',
      persistence: 'One pending plan per seat/current full turn. Every staging transition advances a persistent seat version; stale replace/cancel fails. Handoff or result clears plans. Pending work and receipts survive restart without an MCP connection. The 250ms sweep is not a real-time guarantee; late wakeups use actual time, expiry always wins at the deadline, and moves are never backdated. Scheduling reduces flag risk without guaranteeing against it.',
      privacy: 'Plans, fallback order, thresholds and receipts are seat-private. Only executed moves enter public history/replay/waits. Private changes/failures do not advance board revision or wake public waits. Timed authenticated play/undo returns staging; use muju_staged for outcomes. Preview exposes liveStaging separately.',
    },
    clockPressure: 'Per-seat cumulative completed-turn counts, elapsed and bank-spend totals/means, remaining bank and declared sampling window. Average max(0, elapsedMs-delayMs) for each turn, never subtract delay from the mean elapsed time. Partial commands/undo count as time, not extra samples. Active and terminal turns are excluded. Old rooms skip earlier history and their already-running turn. Projection remainingBankMs/meanBankSpentMs means if historical pace continues, not turns left in the game; no_samples and no_observed_drain use null. Fresh clockPressure accompanies clock-bearing responses and briefings outside revision caches; preview uses liveClockPressure.',
  },
  actionsPerTurn: { default: 4, options: [4], setting: 'Every game uses four shared actions per player turn.' },
  game: 'Muju Hono Tanka', board: '10×10, White home A1, Black home J10. All board information is public; pending staged plans are private to their seat.',
  observers: 'Create, join and muju_observe return a watchUrl. Share it with any number of human observers to watch both seats live in a read-only browser. Observers need no invitation or token and never claim a seat. MCP observers use muju_observe and muju_wait_for_change with just roomId.',
  restoreSeat: 'To continue an existing seat on another device, open Play online → Restore a seat and paste the private credentials JSON (roomId, player, token, serverUrl). No new invitation is needed. Both devices retain control of the same seat; coordinate who plays.',
  history: 'muju_history reads the persistent room score, including upkeep, purchases, promotions, move paths/AP, combat outcomes and per-unit mining. Use before/after sequence cursors to page; default omits undone commands. History is public and available in the browser room sidebar. Older rooms mark where detailed recording began.',
  turn: ['Pay tier 2/3 upkeep at turn start (1/2 crystals per unit). Tier 1 stays free; release higher tiers if needed.',
    'Place: buy tier 1 units in controlled empty squares, or promote existing units by one tier, paying the cost difference. Newly placed units cannot promote this turn.',
    'Act: spend up to 4 shared actions per turn. Movement is orthogonal through empty cells; cost is ceil(path length / speed). Attacks target orthogonally adjacent enemies and cost 1.',
    'End the action phase to collect finite crystals beneath each unit, then hand play to the other player.'],
  combat: 'Attack ≥ remaining defense eliminates. Otherwise damage lasts until the defender’s turn starts. A unit gets one attack; its own killing blow unlocks another, up to its tier. Moving can repeat while actions remain.',
  elements: 'Fire/Lightning beats Plant/Metal beats Water/Shadow beats Fire/Lightning. Advantage +1 attack; disadvantage −1, minimum 0.',
  victory: 'Eliminate every enemy, or occupy the enemy home until your next turn starts. An occupation with no legal rescue wins immediately as home-checkmate, accounting for upkeep choices, promotions, movement and combined attacks within four actions. Otherwise the opponent gets a full turn to clear it. Home blocks all purchases. Three attacks on the same corner unit require at least five actions. An earlier opposing home occupation keeps priority. Resignation loses. 10 consecutive player turns without an enemy kill by attack draw. Only an attack kill resets the clock; income, movement, purchases, promotions and upkeep losses do not.',
  checkmate: 'The server resolves proven home-checkmate immediately, before handoff or turn-end income. No reply turn is needed. A proof uses deterministic bounded work; an inconclusive result retains the normal reply turn. If checkmate ends a muju_play batch, remaining commands are skipped and events contain only executed actions. Preview reports the same result. Finished games cannot be undone.',
  workflow: 'Create a room and share only the invitation with the opponent, or join using their roomId and inviteCode. Keep your seat token private. Read the room and legal actions; preview a sequence; play with expectedRevision and a unique requestId. Reuse the exact requestId/body after an uncertain network outcome. Batches are atomic and cannot play the opponent’s turn. Call muju_wait_for_change with afterRevision set to the latest revision between turns. On changed=true, inspect events for who acted and what they did, then use room.activePlayer to determine who can play. A move or undo within the opponent’s turn does not hand over control. On changed=false, retain the board and wait again. Stop on phase=victory.',
  undo: 'Send UNDO alone via muju_play to reverse your latest committed command (an atomic batch is one command). Repeat while canUndo is true. Purchases, promotions, upkeep choices and ending placement are reversible until turn end. A positive automatic upkeep payment is the first undo step of the incoming player’s turn. Undo never reverses the opponent’s completed turn or a finished game.',
  upkeep: 'Affordable upkeep is paid automatically unless review is enabled. Undo later commands first, then undo the automatic payment to refund it and reopen PAY_UPKEEP before healing. Submit a new affordable keep-set containing all tier 1 units. Unaffordable upkeep opens the selector immediately. SET_UPKEEP_REVIEW changes only your own preference and must be sent alone.',
  catalogue: UNIT_DEFINITIONS,
};
