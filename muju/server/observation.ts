import type { GameState, PlayerId } from '../src/game/types';
import type { RoomAction, RoomSnapshot } from '../src/online/types';
import { getUnitAt } from '../src/game/board';
import { getActionsPerTurn, isPhasing } from '../src/game/rules';
import { INITIAL_MAP_RESOURCES, MAX_RESOURCE_RESERVE, RESOURCE_MAP_NAME, UNEQUAL_ROUTES_MAP } from '../src/game/resourceMap';
import { getMovementRange, getMoveCost } from '../src/game/movement';
import { calculateAttackPower, calculateDefense, getAttackCount, getValidAttacks } from '../src/game/combat';
import { getAffordablePurchases } from '../src/game/building';
import { isLegalAction } from '../src/game/legality';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../src/game/units';
import { defaultUpkeepAction, unitUpkeep, upkeepDue } from '../src/game/upkeep';
import { projectedIncome } from '../src/game/mining';
import { getAllSpawnPositions, isValidSpawnPosition } from '../src/game/spawning';
import { getHomeOccupier } from '../src/game/victory';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING, minedTotal } from '../src/game/inactivity';
import { TIME_CONTROL_PRESETS } from '../src/online/timeControl';
import { square, describeAction } from './notation';
import { assertMatchCapability } from './matchPolicy';
import { analysisService } from './analysis';
import { PHASING_RULES_VERSION } from './rooms';
export { square, describeAction } from './notation';

export function turnContext(s: GameState) {
  return { ruleset: s.ruleset ?? 'standard', turn: s.turn, upkeepPending: !!s.upkeepPending,
    endTurnAction: isPhasing(s) ? 'END_PLACE_PHASE' as const : 'END_ACTION_PHASE' as const };
}

export function observe(room: RoomSnapshot, perspective = room.state.turn.currentPlayer) {
  const s = room.state, bare = room.matchPolicy?.toolTier === 'bare';
  return {
    ...(room.matchPolicy ? { matchPolicy: room.matchPolicy } : {}),
    roomId: room.id, revision: room.revision, ready: room.ready, seats: room.seats,
    canUndo: !bare && !!room.canUndo, archivedAt: room.archivedAt ?? null, lastMoveAt: room.lastMoveAt ?? null,
    timeControl: room.timeControl ?? null, clock: room.clock ?? null, clockPressure: room.clockPressure ?? null,
    ...(room.staging ? { staging: room.staging } : {}),
    analysis: analysisService.headline(room, perspective),
    historyTool: 'muju_history',
    activePlayer: room.ready && s.phase === 'playing' ? s.turn.currentPlayer : null,
    ...turnContext(s), pendingSummons: (s.pendingSummons ?? []).map(p => ({ ...p, square: square(p.position),
      ...(bare ? {} : { validOnCurrentBoard: isValidSpawnPosition(p.position, p.owner, s.board) }) })), lastSummoning: s.lastSummoning,
    status: s.phase, actionsPerTurn: getActionsPerTurn(s), blackCrystalHandicap: s.blackCrystalHandicap ?? 0,
    winner: s.winner, victoryReason: s.victoryReason ?? null,
    nextStep: room.archivedAt ? 'Room archived after 24 hours without a game action. Its history and positions remain available for review.' : !room.ready ? 'Invite the opponent, then wait for them to join.' : s.phase === 'victory' ? 'Game finished.'
      : s.upkeepPending ? 'Choose PAY_UPKEEP keepUnitIds; all tier 1 units must stay. Higher tiers omitted are released.'
      : isPhasing(s) ? s.turn.phase === 'action' ? 'Take actions, then END_ACTION_PHASE to mine and pay upkeep. This does not end your turn.' : 'Promote actual units or BUY_UNIT to commit public summons. END_PLACE_PHASE hands over the turn and clock.'
      : bare ? `${s.turn.currentPlayer} may submit actions using this revision.` : `${s.turn.currentPlayer} may act. Read legal actions, optionally preview, then play using this revision.`,
    players: Object.fromEntries((['white', 'black'] as const).map(player => [player, {
      ...s.players[player], home: square(s.players[player].startCorner),
      ...(bare ? {} : { projectedIncome: projectedIncome(s, player), upkeepDue: upkeepDue(s, player) }), reviewUpkeep: !!s.reviewUpkeep?.[player],
      occupyingEnemyHome: getHomeOccupier(s.board, player)?.id ?? null,
    }])),
    // Rules revision `muju-phasing-3` (2026-09-22): ten kill-free plies end the
    // game on the higher mined total; a tie draws. The deprecated
    // `quietTurns`/`drawAtQuietTurns` aliases were removed 2026-09-24: agents read
    // `drawAtQuietTurns` as "ten quiet plies is a draw" and lost games on the clock.
    killClock: { plies: s.inactivityPlies ?? 0, limit: INACTIVITY_LIMIT, warningAt: INACTIVITY_WARNING,
      minedTotals: { white: minedTotal(s, 'white'), black: minedTotal(s, 'black') },
      leader: minedTotal(s, 'white') > minedTotal(s, 'black') ? 'white' as const
        : minedTotal(s, 'black') > minedTotal(s, 'white') ? 'black' as const : null },
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
  assertMatchCapability(room, 'rules-oracle');
  const s: GameState = room.state, player: PlayerId = s.turn.currentPlayer;
  let actions: RoomAction[] = [];
  if (room.ready && s.phase === 'playing') {
    if (s.upkeepPending) actions = [defaultUpkeepAction(s)];
    else if (s.turn.phase === 'place') {
      // This is a rules oracle. AI move generators may prune strategically risky
      // but legal purchases, so never use their candidate lists here.
      actions = [
        ...getAffordablePurchases(s.players[player].resources).flatMap(definition => getAllSpawnPositions(player, s.board)
          .map(position => ({ type: 'BUY_UNIT' as const, definitionId: definition.id, position }))),
        ...s.board.units.filter(unit => unit.owner === player).map(unit => ({ type: 'PROMOTE_UNIT' as const, unitId: unit.id })),
        { type: 'END_PLACE_PHASE' },
      ];
    }
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
  return { roomId: room.id, revision: room.revision, ...turnContext(s), currentPlayer: player, total: actions.length,
    timeControl: room.timeControl ?? null, clock: room.clock ?? null, clockPressure: room.clockPressure ?? null,
    nextOffset: offset + limit < actions.length ? offset + limit : null,
    upkeepNote: s.upkeepPending ? 'One affordable keep-set is shown. You may submit any affordable keepUnitIds containing every tier 1 unit.' : undefined,
    actions: actions.slice(offset, offset + limit).map(action => {
      const u = 'unitId' in action ? s.board.units.find(u => u.id === action.unitId)! : null;
      const target = action.type === 'ATTACK' ? getUnitAt(s.board, action.targetPosition)! : null;
      return { action: describeAction(action),
        ...(action.type === 'BUY_UNIT' ? { crystalCost: getUnitDefinition(action.definitionId).cost,
          effect: isPhasing(s) ? 'Public commitment; arrives or fully refunds at next own turn start.' : 'Places a unit immediately.' } : {}),
        ...(action.type === 'END_ACTION_PHASE' ? { effect: isPhasing(s) ? 'Mine once, pay upkeep, then Prepare; same player and running clock.' : 'Mine and hand over the turn and clock.' } : {}),
        ...(action.type === 'END_PLACE_PHASE' ? { effect: isPhasing(s) ? 'Hand over the full turn and clock; resolve incoming summons.' : 'Begin Act; same player and running clock.' } : {}),
        ...(action.type === 'MOVE' && u ? { actionCost: getMoveCost(u.position, action.to, getUnitDefinition(u.definitionId).speed, s.board) } : {}),
        ...(u && target ? { actionCost: 1, targetUnitId: target.id, attack: calculateAttackPower(u, target),
          defense: calculateDefense(target), eliminates: calculateAttackPower(u, target) >= calculateDefense(target) } : {}),
      };
    }) };
}

export const rules = {
  // ONE RULESET. Standard was retired on 2026-09-21: it cannot be created, and
  // the rooms stored under its revisions keep their rows and their 409. So this
  // object no longer DEFAULTS to one rule set with a patch for the other — it
  // states the played rules directly, and `rulesFor()` adds nothing but the
  // labels. `retired` is listed so an agent reading an archived room's
  // `rulesVersion` can tell why it will not open.
  ruleset: { name: 'phasing', revision: PHASING_RULES_VERSION, immutable: true, retired: ['standard'] },
  summons: 'Public, immutable commitments. Not board units: no occupancy, movement blocking, attacks, mining, upkeep, promotion, spawn anchoring or prevention of elimination. One own pending summon per square. At next own turn start, any unblocked spawn rectangle (see spawning) suffices and the square must be empty. Validate all against the same board. Invalid summons disappear with their original cost fully refunded; temporary blocking during the reply does not count.',
  spawning: 'Where BUY_UNIT may place: an empty square inside one of your unblocked spawn rectangles. Every actual unit you own is an anchor; its rectangle spans from your home corner (White A1, Black J10) to the anchor’s square, inclusive. If any enemy unit stands anywhere inside a rectangle, that anchor is blocked. Pending summons never anchor or block. Example for White: units on C3 and A5 give the rectangles A1–C3 and A1–A5; an enemy on B2 blocks A1–C3 but not A1–A5. An enemy on your home corner blocks every rectangle. The same test runs again when the summon would arrive, and a failed arrival refunds in full.',
  mining: 'At END_ACTION_PHASE each of your units takes min(its mining stat, the crystals left on its own square) from that square, whether or not it moved or attacked. Squares never refill: resourceMap gives starting reserves and each observation the current ones. Mining-0 units (every lightning, shadow_1) take nothing. Your mined total is every crystal ever taken, plus Black’s handicap for Black; spending never reduces it, and it decides the kill clock.',
  promotion: 'After mining/upkeep, new stats immediately apply. No more actions or mining that turn. Arrivals can promote at that turn end. The new upkeep rate is first due next own turn after mining.',
  compatibility: 'Human/local/online play and manual analysis board supported. Built-in browser AI plays these rules (easy/medium: AIEngineV2; hard: HardEngine, ?hardAi=0 opts out to the previous engine). MCP analysis uses Phasing turn transitions and existing armies/arrivals for action-phase tactics; preparation cannot create another action phase. Pending summons are public; private staged action batches are a different feature.',
  resourceMap: { name: RESOURCE_MAP_NAME, total: INITIAL_MAP_RESOURCES, maximumReserve: MAX_RESOURCE_RESERVE,
    startingReserves: [...new Set(UNEQUAL_ROUTES_MAP)].sort((a, b) => a - b),
    layout: Array.from({ length: 10 }, (_, row) => UNEQUAL_ROUTES_MAP.slice(row * 10, row * 10 + 10)),
    compatibility: 'This map applies to new games and restarts. Existing games retain their stored reserves; use the room observation for its actual map. The current unit catalogue applies to all games.' },
  blackCrystalHandicap: {
    default: 0, min: 1, max: 20,
    setup: 'Optional creation-only starting crystals for Black. Omit or use 0 for no handicap. White starts with 0 and moves first. This grant is separate from mined income and is not repeated on later turns.',
    opening: 'Both players start in Act regardless of handicap. Normal purchase and promotion costs apply; both sides still have four actions.',
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
    agentWorkflow: 'Read rules and prepare before joining. Inspect clock in observations, legal actions and play responses, or use muju_clock for a small fresh read. All timestamps are server Unix milliseconds. Time left at observation = deadlineAtMs − serverNowMs; subtract your locally elapsed time and allow for network latency. Do not wait on your own running turn. Submit the full-turn ending command before the deadline (END_PLACE_PHASE, after preparation); merely spending all AP does not hand off. Prefer a legal atomic turn batch and limit previews when short on time. A preview’s liveClock describes the real game, not its hypothetical board. Ordinary ticks do not change revision; timed unchanged waits include clock. A timeout advances revision and wakes waits with a result event.',
    estimates: 'Approximate wall time if most time is used: 2 × bankSeconds + total player turns × delaySeconds. Blitz ≈10 minutes at 36 turns, rapid ≈45 minutes at 50 turns, classical ≈2 hours at 60 turns. These are pacing suggestions, not duration guarantees.',
    staging: {
      tools: ['muju_stage', 'muju_cancel_stage', 'muju_staged'], resource: 'muju://skills/muju-time-awareness/staged-play',
      workflow: 'Read clock/clockPressure and briefing; stage an early player-authored candidate, choose a sustainable thinking budget, improve/replace, commit earlier or let it fire, then check private status. No automatic moves, repairs, appended end-turn or model-effort control.',
      request: 'Stage with token, requestId, expectedTurnNumber, expectedStageVersion (outer private status version, initially 0), commitWhenRemainingMs, actions (1–32), and optional fallbacks (up to three complete batches). Use new IDs for replacements; retry identical normalized requests with the same ID. Cancel uses token, requestId, expectedTurnNumber and expectedStageVersion. Inspect optionally by stageId. No expectedRevision: live play/undo may intervene.',
      trigger: 'Remaining means total delay plus bank until flag-fall. A positive integer no greater than this turn’s starting allowance; already-due triggers fire immediately if time remains. Five seconds remaining can spend almost the entire bank. Choose larger thresholds or commit earlier to conserve time.',
      execution: 'SQLite serializes all operations. Expiry resolves first, then due stage, then incoming operation. Fire validates whole batches atomically against the real board and executes the first legal player-authored batch in order. All illegal consumes the stage, records private failure and keeps the clock running. Partial batches are allowed but do not hand over. Include END_PLACE_PHASE after mining/upkeep/preparation to stop your clock. Ordinary undo and immediate home-checkmate tail cancellation apply.',
      persistence: 'One pending plan per seat/current full turn. Every staging transition advances a persistent seat version; stale replace/cancel fails. Handoff or result clears plans. Pending work and receipts survive restart without an MCP connection. The 250ms sweep is not a real-time guarantee; late wakeups use actual time, expiry always wins at the deadline, and moves are never backdated. Scheduling reduces flag risk without guaranteeing against it.',
      privacy: 'Plans, fallback order, thresholds and receipts are seat-private. Only executed moves enter public history/replay/waits. Private changes/failures do not advance board revision or wake public waits. Timed authenticated play/undo returns staging; use muju_staged for outcomes. Preview exposes liveStaging separately.',
    },
    clockPressure: 'Per-seat cumulative completed-turn counts, elapsed and bank-spend totals/means, remaining bank and declared sampling window. Average max(0, elapsedMs-delayMs) for each turn, never subtract delay from the mean elapsed time. Partial commands/undo count as time, not extra samples. Active and terminal turns are excluded. Old rooms skip earlier history and their already-running turn. Projection remainingBankMs/meanBankSpentMs means if historical pace continues, not turns left in the game; no_samples and no_observed_drain use null. Fresh clockPressure accompanies clock-bearing responses and briefings outside revision caches; preview uses liveClockPressure.',
  },
  actionsPerTurn: { default: 4, options: [4], setting: 'Every game uses four shared actions per player turn.' },
  game: 'Muju Hono Irumbu', board: '10×10, White home A1, Black home J10. All board information is public; pending staged plans are private to their seat.',
  observers: 'Create, join and muju_observe return a watchUrl. Share it with any number of human observers to watch both seats live in a read-only browser. Observers need no invitation or token and never claim a seat. MCP observers use muju_observe and muju_wait_for_change with just roomId.',
  restoreSeat: 'To continue an existing seat on another device, open Play online → Restore a seat and paste the private credentials JSON (roomId, player, token, serverUrl). No new invitation is needed. Both devices retain control of the same seat; coordinate who plays.',
  history: 'muju_history reads the persistent room score, including upkeep, purchases, public summon commitments/arrivals/refunds, promotions, move paths/AP, combat outcomes and per-unit mining. Use before/after sequence cursors to page; default omits undone commands. History is public and available in the browser room sidebar. Older rooms mark where detailed recording began.',
  turn: ['Start: existing victory checks, then resolve all own pending summons simultaneously, heal/reset units, and Act. Both players start in Act even with handicap.',
    'Act: spend up to 4 shared actions per turn. Movement is orthogonal through empty cells; cost is ceil(path length / speed). Speed 0 pieces cannot move, but may attack adjacent enemies. Attacks target orthogonally adjacent enemies and cost 1.',
    'END_ACTION_PHASE collects mining once, then pays upkeep from the resulting bank. It does not hand off. If upkeepPending, submit PAY_UPKEEP.',
    'Prepare (turn.phase=place): PROMOTE_UNIT once per actual piece, including arrivals this turn; BUY_UNIT pays now and commits type and empty legal square. END_PLACE_PHASE ends the full turn and hands over the clock.'],
  combat: 'Attack ≥ remaining defense eliminates. Otherwise damage lasts until the defender’s turn starts. A unit gets one attack; each of its own killing blows unlocks another, at any tier — the 4 shared actions are the only limit. Moving can repeat while actions remain.',
  elements: 'Fire/Lightning beats Plant/Metal beats Water/Shadow beats Fire/Lightning. Advantage +1 attack; disadvantage −1, minimum 0.',
  // The kill-clock sentence is built from the canonical constants so a rules
  // revision cannot leave the agent-facing text stating a previous limit or verdict.
  victory: `Eliminate every actual enemy unit (pending summons do not postpone elimination), or hold the enemy home until next own turn. Existing victory checks precede summons. Immediate home-checkmate requires surviving outgoing upkeep. Earlier opposing occupation has priority. Home blocks all purchases. Three attacks on the same corner unit require at least five actions. A kill is any attack that removes a unit; releases, refunds, promotions, mining, chip damage and disrupted or failed summons are not kills. ${INACTIVITY_LIMIT} consecutive kill-free player turns (${INACTIVITY_LIMIT} plies, ${INACTIVITY_LIMIT / 2} hand-offs each) end the game immediately at END_PLACE_PHASE of the ${INACTIVITY_LIMIT}th; the next turn never begins, so no turn-start home-occupation check, upkeep or healing can override it. Only a kill resets the clock to zero on the killer's own turn, so the most recent killer takes the final move before the count is judged; income, movement, purchases, promotions and upkeep losses never reset it. The kill clock is decided on mined totals: the higher of each side's mined total (every crystal that side's units have taken from the board over the whole game, plus Black's starting handicap, never reduced by spending, upkeep, release or refund) wins; equal totals draw. A unit occupying the enemy home when the clock ends does not win by occupation. No home-checkmate is awarded when the defender's reply would be the ${INACTIVITY_LIMIT}th ply (the clock decides instead unless the defender kills); the invading turn that would produce the ${INACTIVITY_LIMIT}th ply ends the game on mined totals and is never pre-empted by a mate award. Resignation or timeout loses.`,
  checkmate: `An invader must survive its own mining/upkeep before immediate home-checkmate is adjudicated. Defender rescue starts in Act with the actual army after healing; no pre-action promotions or upkeep releases. Home occupation prevents all pending arrivals. No checkmate is awarded when the kill clock would end the game at or before the defender's reply — the invading turn's hand-off would produce ${INACTIVITY_LIMIT - 1} or ${INACTIVITY_LIMIT} kill-free plies; the game plays on and the clock or a kill decides instead. A proven result cancels the queued batch tail. If checkmate ends a muju_play batch, remaining commands are skipped and events contain only executed actions. Preview reports the same result. Finished games cannot be undone.`,
  workflow: 'Create a room and share only the invitation with the opponent, or join using their roomId and inviteCode. Keep your seat token private. Read the room and legal actions; preview a sequence; play with expectedRevision and a unique requestId. Reuse the exact requestId/body after an uncertain network outcome. Batches are atomic and cannot play the opponent’s turn. Call muju_wait_for_change with afterRevision set to the latest revision between turns. On changed=true, inspect events for who acted and what they did, then use room.activePlayer to determine who can play. A move or undo within the opponent’s turn does not hand over control. On changed=false, retain the board and wait again. Stop on phase=victory.',
  undo: 'Send UNDO alone via muju_play to reverse the latest command in this full turn (an atomic batch is one command). Repeat while canUndo is true. Mining and automatic upkeep belong to one reversible END_ACTION_PHASE command. There is no incoming automatic-upkeep undo. To choose upkeep, undo back before mining, enable SET_UPKEEP_REVIEW in its own command, end actions and submit PAY_UPKEEP. Undo never refunds time, crosses END_PLACE_PHASE, reverses the opponent’s completed turn or reopens a finished game.',
  upkeep: 'END_ACTION_PHASE mines once, then pays outgoing upkeep. If upkeepPending, PAY_UPKEEP must keep every tier 1 plus an affordable subset of higher tiers. Payment does not heal/reset or hand off. Promotion happens afterward; its new upkeep rate first applies after mining next own turn. Affordable upkeep is paid automatically unless SET_UPKEEP_REVIEW is enabled, which must be sent alone. Tier 2 costs 1 and tier 3 costs 2 per turn; tier 1 is free and can never be released. If you own no tier-1 unit, an unaffordable bill can release every unit, and zero units loses (victoryReason upkeep-elimination).',
  catalogue: UNIT_DEFINITIONS,
};

/**
 * The rules payload, plus the one end-turn command. It takes no argument: there
 * is one rule set, the timing prose above IS the played timing, and the payload
 * names itself in `rules.ruleset` ({ name, revision, immutable, retired }). The
 * function survives its two-branch past because `muju_rules` and its tests want
 * `endTurnAction` alongside the body.
 */
export function rulesFor() {
  return { ...rules, endTurnAction: 'END_PLACE_PHASE' as const };
}
