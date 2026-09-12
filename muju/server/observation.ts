import type { GameState, PlayerId, Position } from '../src/game/types';
import type { RoomAction, RoomSnapshot } from '../src/online/types';
import { getUnitAt } from '../src/game/board';
import { getActionsPerTurn } from '../src/game/rules';
import { getMovementRange, getMoveCost } from '../src/game/movement';
import { calculateAttackPower, calculateDefense, getAttackCount, getValidAttacks } from '../src/game/combat';
import { generatePlacePhaseActions } from '../src/ai/moves';
import { isLegalAction } from '../src/game/legality';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../src/game/units';
import { defaultUpkeepAction, unitUpkeep, upkeepDue } from '../src/game/upkeep';
import { projectedIncome } from '../src/game/mining';
import { getHomeOccupier } from '../src/game/victory';
import { INACTIVITY_LIMIT } from '../src/game/inactivity';

export const square = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
export function describeAction(action: RoomAction) {
  if (action.type === 'MOVE') return { ...action, to: square(action.to) };
  if (action.type === 'ATTACK') return { ...action, targetPosition: square(action.targetPosition) };
  if (action.type === 'BUY_UNIT') return { ...action, position: square(action.position) };
  return action;
}
export function observe(room: RoomSnapshot) {
  const s = room.state;
  return {
    roomId: room.id, revision: room.revision, ready: room.ready, seats: room.seats,
    canUndo: !!room.canUndo,
    activePlayer: room.ready && s.phase === 'playing' ? s.turn.currentPlayer : null,
    status: s.phase, turn: s.turn, actionsPerTurn: getActionsPerTurn(s), upkeepPending: !!s.upkeepPending,
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
  actionsPerTurn: { default: 4, options: [4], setting: 'Every game uses four shared actions per player turn.' },
  game: 'Muju Hono Tanka', board: '10×10, White home A1, Black home J10. All game information is public.',
  observers: 'Create, join and muju_observe return a watchUrl. Share it with any number of human observers to watch both seats live in a read-only browser. Observers need no invitation or token and never claim a seat. MCP observers use muju_observe and muju_wait_for_change with just roomId.',
  restoreSeat: 'To continue an existing seat on another device, open Play online → Restore a seat and paste the private credentials JSON (roomId, player, token, serverUrl). No new invitation is needed. Both devices retain control of the same seat; coordinate who plays.',
  turn: ['Pay tier 2/3 upkeep at turn start (1/2 crystals per unit). Tier 1 stays free; release higher tiers if needed.',
    'Place: buy tier 1 units in controlled empty squares, or promote existing units by one tier, paying the cost difference. Newly placed units cannot promote this turn.',
    'Act: spend up to 4 shared actions per turn. Movement is orthogonal through empty cells; cost is ceil(path length / speed). Attacks target orthogonally adjacent enemies and cost 1.',
    'End the action phase to collect finite crystals beneath each unit, then hand play to the other player.'],
  combat: 'Attack ≥ remaining defense eliminates. Otherwise damage lasts until the defender’s turn starts. A unit gets one attack; its own killing blow unlocks another, up to its tier. Moving can repeat while actions remain.',
  elements: 'Fire/Lightning beats Plant/Metal beats Water/Shadow beats Fire/Lightning. Advantage +1 attack; disadvantage −1, minimum 0.',
  victory: 'Eliminate every enemy, or occupy the enemy home until your next turn starts. Opponent gets a full turn to clear it. Resignation loses. 10 consecutive player turns without an enemy kill by attack draw. Only an attack kill resets the clock; income, movement, purchases, promotions and upkeep losses do not.',
  workflow: 'Create a room and share only the invitation with the opponent, or join using their roomId and inviteCode. Keep your seat token private. Read the room and legal actions; preview a sequence; play with expectedRevision and a unique requestId. Reuse the exact requestId/body after an uncertain network outcome. Batches are atomic and cannot play the opponent’s turn. Call muju_wait_for_change with afterRevision set to the latest revision between turns. On changed=true, inspect events for who acted and what they did, then use room.activePlayer to determine who can play. A move or undo within the opponent’s turn does not hand over control. On changed=false, retain the board and wait again. Stop on phase=victory.',
  undo: 'Send UNDO alone via muju_play to reverse your latest committed command (an atomic batch is one command). Repeat while canUndo is true. Purchases, promotions, upkeep choices and ending placement are reversible until turn end. A positive automatic upkeep payment is the first undo step of the incoming player’s turn. Undo never reverses the opponent’s completed turn or a finished game.',
  upkeep: 'Affordable upkeep is paid automatically unless review is enabled. Undo later commands first, then undo the automatic payment to refund it and reopen PAY_UPKEEP before healing. Submit a new affordable keep-set containing all tier 1 units. Unaffordable upkeep opens the selector immediately. SET_UPKEEP_REVIEW changes only your own preference and must be sent alone.',
  catalogue: UNIT_DEFINITIONS,
};
