import type { AIAction } from '../ai/types';
import type { Element, GameState, PlayerId, Position, Unit, VictoryReason } from './types';
import { getUnitAt } from './board';
import { calculateAttackPower, calculateDefense } from './combat';
import { findPath } from './movement';
import { getUnitDefinition } from './units';
import { unitUpkeep } from './upkeep';

export const HISTORY_NOTATION = {
  pieces: '🔥 fire · ⚡ lightning · 💧 water · 🌑 shadow · 🌱 plant · 🪨 metal; number = tier',
  actions: '→ move · × attack (attacker stays put) · + purchase · ↑ promotion · ◆ crystals · AP shared action points',
  result: '# = server-adjudicated home checkmate. No coaching judgments or speculative moves.',
  turns: 'Each round has White and Black turns. Coordinates A1–J10; White home A1, Black home J10.',
};
const symbols: Record<Element, string> = { fire: '🔥', lightning: '⚡', water: '💧', shadow: '🌑', plant: '🌱', metal: '🪨' };
export const historySquare = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
export function pieceSymbol(definitionId: string) {
  const definition = getUnitDefinition(definitionId);
  return `${symbols[definition.element]}${definition.tier}`;
}
export function historyUnit(unit: Unit) {
  const definition = getUnitDefinition(unit.definitionId);
  return { id: unit.id, definitionId: unit.definitionId, name: definition.name, player: unit.owner,
    symbol: pieceSymbol(unit.definitionId), square: historySquare(unit.position) };
}
export type HistoryUnit = ReturnType<typeof historyUnit>;
interface EventBase { player: PlayerId; turnNumber: number; notation: string; description: string }
export type MoveEvent = EventBase & (
  | { kind: 'move'; unit: HistoryUnit; from: string; to: string; path: string[]; ap: number; speed: number }
  | { kind: 'purchase'; unit: HistoryUnit; cost: number; bankBefore: number; bankAfter: number }
  | { kind: 'promotion'; unit: HistoryUnit; previousDefinitionId: string; cost: number; bankBefore: number; bankAfter: number }
  | { kind: 'attack'; unit: HistoryUnit; target: HistoryUnit; ap: number; attackPower: number; defenseBefore: number; defenseAfter: number; killed: boolean }
  | { kind: 'upkeep'; automatic: boolean; paid: number; bankBefore: number; bankAfter: number; kept: (HistoryUnit & { cost: number })[]; released: HistoryUnit[] }
  | { kind: 'mining'; total: number; bankBefore: number; bankAfter: number; takes: { unit: HistoryUnit; amount: number; reservesBefore: number; reservesAfter: number }[] }
  | { kind: 'result'; winner: PlayerId | null; reason: VictoryReason }
);
export type MoveHistoryEntry = MoveEvent & { sequence: number; revision: number; timestamp: string; undoneAtRevision: number | null;
  positionTurn?: { player: PlayerId; turnNumber: number } };
export interface HistoryStart { revision: number; turnNumber: number; player: PlayerId; complete: boolean }
export interface HistoryQuery { before?: number; after?: number; limit?: number; includeUndone?: boolean }
export interface RoomMoveHistory {
  roomId: string; revision: number; recordingStart: HistoryStart; entries: MoveHistoryEntry[];
  total: number; hasEarlier: boolean; hasLater: boolean;
}

/** Derive the score from successful engine transitions, including automatic outcomes. */
export function describeTransition(before: GameState, action: AIAction, after: GameState): MoveEvent[] {
  if (before === after) return [];
  const events: MoveEvent[] = [];
  const player = before.turn.currentPlayer, turnNumber = before.turn.turnNumber;
  const base = { player, turnNumber };
  const unit = 'unitId' in action ? before.board.units.find(u => u.id === action.unitId) : undefined;
  const bankBefore = before.players[player].resources, bankAfter = after.players[player].resources;
  const ap = before.turn.actionsRemaining - after.turn.actionsRemaining;
  if (action.type === 'MOVE' && unit) {
    const from = historySquare(unit.position), to = historySquare(action.to);
    events.push({ ...base, kind: 'move', unit: historyUnit(unit), from, to, ap, speed: getUnitDefinition(unit.definitionId).speed,
      path: (findPath(unit.position, action.to, before.board, 100) ?? []).map(historySquare),
      notation: `${pieceSymbol(unit.definitionId)} ${from}→${to}`,
      description: `${getUnitDefinition(unit.definitionId).name} · ${ap} AP` });
  }
  if (action.type === 'BUY_UNIT') {
    const placed = getUnitAt(after.board, action.position)!;
    events.push({ ...base, kind: 'purchase', unit: historyUnit(placed), cost: bankBefore - bankAfter, bankBefore, bankAfter,
      notation: `+${pieceSymbol(placed.definitionId)}@${historySquare(action.position)}`,
      description: `${getUnitDefinition(placed.definitionId).name} · −${bankBefore - bankAfter} ◆ · bank ${bankAfter}` });
  }
  if (action.type === 'PROMOTE_UNIT' && unit) {
    const promoted = after.board.units.find(u => u.id === unit.id)!;
    events.push({ ...base, kind: 'promotion', unit: historyUnit(promoted), previousDefinitionId: unit.definitionId,
      cost: bankBefore - bankAfter, bankBefore, bankAfter,
      notation: `↑${pieceSymbol(promoted.definitionId)}@${historySquare(unit.position)}`,
      description: `${getUnitDefinition(unit.definitionId).name} → ${getUnitDefinition(promoted.definitionId).name} · −${bankBefore - bankAfter} ◆ · bank ${bankAfter}` });
  }
  if (action.type === 'ATTACK' && unit) {
    const target = getUnitAt(before.board, action.targetPosition)!;
    const survivor = after.board.units.find(u => u.id === target.id);
    const attackPower = calculateAttackPower(unit, target), defenseBefore = calculateDefense(target);
    const defenseAfter = survivor ? calculateDefense(survivor) : 0;
    events.push({ ...base, kind: 'attack', unit: historyUnit(unit), target: historyUnit(target),
      ap, attackPower, defenseBefore, defenseAfter, killed: !survivor,
      notation: `${pieceSymbol(unit.definitionId)} ${historySquare(unit.position)}×${historySquare(target.position)}`,
      description: `${getUnitDefinition(target.definitionId).name}: ${attackPower} attack vs ${defenseBefore} defense · ${survivor ? `${defenseAfter} defense left` : 'captured'} · ${ap} AP` });
  }
  // Income belongs to the outgoing turn; automatic upkeep belongs to the incoming one.
  if (after.lastIncome && after.lastIncome !== before.lastIncome) {
    const income = after.lastIncome;
    const takes = income.takes.map(take => ({ unit: historyUnit(before.board.units.find(u => u.id === take.unitId)!),
      amount: take.amount, reservesBefore: before.board.cells[take.position.y][take.position.x].resourceLayers,
      reservesAfter: after.board.cells[take.position.y][take.position.x].resourceLayers }));
    const bank = before.players[income.player].resources;
    events.push({ player: income.player, turnNumber: income.turnNumber, kind: 'mining', total: income.total,
      bankBefore: bank, bankAfter: bank + income.total, takes, notation: `Mining +${income.total} ◆`,
      description: `Bank ${bank} → ${bank + income.total} · ${takes.length} miners` });
  }
  if (after.lastUpkeep && after.lastUpkeep !== before.lastUpkeep) {
    const payment = after.lastUpkeep, owned = before.board.units.filter(u => u.owner === payment.player);
    const releasedIds = new Set(payment.released.map(u => u.id));
    const released = owned.filter(u => releasedIds.has(u.id)).map(historyUnit);
    const kept = owned.filter(u => !releasedIds.has(u.id)).map(u => ({ ...historyUnit(u), cost: unitUpkeep(u) }));
    const bank = after.players[payment.player].resources;
    events.push({ player: payment.player, turnNumber: payment.turnNumber, kind: 'upkeep', paid: payment.paid,
      automatic: action.type !== 'PAY_UPKEEP', bankBefore: bank + payment.paid, bankAfter: bank, kept, released,
      notation: `Upkeep −${payment.paid} ◆${released.length ? `; release ${released.map(u => `${u.symbol}@${u.square}`).join(', ')}` : ''}`,
      description: `${action.type !== 'PAY_UPKEEP' ? 'Automatic' : 'Chosen'} · bank ${bank + payment.paid} → ${bank}${released.length ? ` · ${released.length} released` : ''}` });
  }
  if (after.phase === 'victory' && before.phase !== 'victory') {
    const reason = after.victoryReason ?? 'elimination';
    if (reason === 'home-checkmate' && events.length) events[events.length - 1].notation += '#';
    events.push({ ...base, kind: 'result', winner: after.winner, reason,
      notation: after.winner ? `${after.winner === 'white' ? 'White' : 'Black'} wins${reason === 'home-checkmate' ? ' #' : ''}` : 'Draw',
      description: reason.replaceAll('-', ' ') });
  }
  return events;
}

/** Intermediate movement frames consume one AP each without re-running combat,
 * income, or checkmate adjudication against a historical position. */
export function movementStep(before: GameState, after: GameState, event: MoveEvent, step: number): GameState {
  if (event.kind !== 'move' || step >= event.ap) return after;
  const coordinate = event.path[Math.min(step * event.speed, event.path.length) - 1];
  const position = { x: coordinate.charCodeAt(0) - 65, y: Number(coordinate.slice(1)) - 1 };
  return { ...before, turn: { ...before.turn, actionsRemaining: before.turn.actionsRemaining - step },
    board: { ...before.board, units: before.board.units.map(unit => unit.id === event.unit.id ? { ...unit, position, hasMoved: true } : unit) },
    selectedUnit: null, validMoves: [], validAttacks: [] };
}
