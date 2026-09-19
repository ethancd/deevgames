/**
 * COMPACT POSITION REPORTS — the same "report this position" content as
 * `positionReport.ts`, in a few hundred characters instead of ~35 kB of JSON.
 *
 * A `GameState` is mostly redundancy: a hundred `{position, resourceLayers}`
 * objects, a second copy of the map, random unit ids, and per-unit flags that
 * are nearly always at their defaults. The report is pasted into a chat with a
 * model, where every character is paid for, so this writes only what differs
 * from a fresh game on the named map and reads it back into a playable state.
 *
 * LINE-ORIENTED ASCII, one `key value` per line; emoji and JSON punctuation are
 * the expensive tokens. Squares are `a1`–`j10` (White home a1). Pieces are
 * owner + element letter + tier + square, e.g. `wF1e6`, listed in board order:
 *   F fire · L lightning · W water · S shadow · P plant · M metal
 *   `-2` damage taken · `!` flags: m moved, a attacked, x cannot act,
 *   n placed this turn, p promoted this placement, k last attack killed ·
 *   `~e5,f6` squares already attacked this turn
 *
 * Unit ids are NOT preserved (they are random and long); `last` names a unit
 * by where it stands now. `parseCompactReport` issues fresh ids in the same board order.
 */
import type { GameState, PendingSummon, PlayerId, Position, Unit, Element } from '../game/types';
import type { AIAction } from '../ai/types';
import type { LocalGameHistory } from '../game/analysis';
import type { PositionReportInput } from './positionReport';
import { readHardDiagSnapshot } from './positionReport';
import { createInitialGameState } from '../game/board';
import { getUnitDefinition } from '../game/units';
import { getActionsPerTurn } from '../game/rules';
import { UNEQUAL_ROUTES_MAP } from '../game/resourceMap';
import { PHASING_RULES_REVISION } from '../ai/hard/config';

export const COMPACT_REPORT_VERSION = 2;
const LETTERS: Record<Element, string> = { fire: 'F', lightning: 'L', water: 'W', shadow: 'S', plant: 'P', metal: 'M' };
const ELEMENTS = Object.fromEntries(Object.entries(LETTERS).map(([element, letter]) => [letter, element])) as Record<string, Element>;
const NAMED_MAPS: Record<string, readonly number[]> = { UR: UNEQUAL_ROUTES_MAP };
const FLAGS: [string, (u: Unit) => boolean, (u: Unit) => void][] = [
  ['m', u => u.hasMoved, u => { u.hasMoved = true; }],
  ['a', u => u.hasAttacked, u => { u.hasAttacked = true; }],
  ['x', u => !u.canActThisTurn, u => { u.canActThisTurn = false; }],
  ['n', u => !!u.placedThisTurn, u => { u.placedThisTurn = true; }],
  ['p', u => !!u.promotedThisPlacement, u => { u.promotedThisPlacement = true; }],
  ['k', u => !!u.lastAttackKilled, u => { u.lastAttackKilled = true; }],
];

const square = (p: Position) => `${String.fromCharCode(97 + p.x)}${p.y + 1}`;
const unsquare = (s: string): Position => ({ x: s.charCodeAt(0) - 97, y: Number(s.slice(1)) - 1 });
const piece = (definitionId: string) => { const d = getUnitDefinition(definitionId); return `${LETTERS[d.element]}${d.tier}`; };
const layers = (values: readonly number[]) => values.map(n => n.toString(36)).join('');
const sameSquare = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

function unitToken(unit: Unit, state: GameState): string {
  const flags = FLAGS.filter(([, has]) => has(unit)).map(([letter]) => letter).join('');
  const attacked = (unit.attackedThisTurn ?? []).map(id => state.board.units.find(u => u.id === id)).filter((u): u is Unit => !!u).map(u => square(u.position));
  return `${piece(unit.definitionId)}${square(unit.position)}${unit.damageTaken ? `-${unit.damageTaken}` : ''}${flags ? `!${flags}` : ''}${attacked.length ? `~${attacked.join(',')}` : ''}`;
}
const summonToken = (s: PendingSummon) => `${s.owner[0]}${piece(s.definitionId)}${square(s.position)}/${s.cost}`;

/** The AI's turn in order. Consecutive moves of one unit chain their destinations, `F1>h10>i10`;
 * other actions name the unit by where it stands now (`F1e5xe6`, `^L2e2`). */
function lastTurn(actions: readonly AIAction[], state: GameState): string {
  const name = (id: string) => { const u = state.board.units.find(v => v.id === id); return u ? `${piece(u.definitionId)}${square(u.position)}` : '?'; };
  const out: string[] = []; let moving: string | null = null;
  for (const action of actions) {
    if (action.type === 'MOVE') {
      const mover = state.board.units.find(u => u.id === action.unitId);
      if (moving === action.unitId) out[out.length - 1] += `>${square(action.to)}`; else out.push(`${mover ? piece(mover.definitionId) : '?'}>${square(action.to)}`);
      moving = action.unitId; continue;
    }
    moving = null;
    out.push(action.type === 'ATTACK' ? `${name(action.unitId)}x${square(action.targetPosition)}`
      : action.type === 'BUY_UNIT' ? `+${piece(action.definitionId)}${square(action.position)}`
      : action.type === 'PROMOTE_UNIT' ? `^${name(action.unitId)}`
      : action.type === 'PAY_UPKEEP' ? `upkeep keep ${action.keepUnitIds.length}`
      : action.type === 'RESIGN' ? 'resign' : 'end');
  }
  return out.join('; ');
}

const EMOJI: [RegExp, string][] = [[/🔥/gu, 'F'], [/⚡/gu, 'L'], [/💧/gu, 'W'], [/🌑/gu, 'S'], [/🌱/gu, 'P'], [/🪨/gu, 'M'],
  [/→/g, '>'], [/×/g, 'x'], [/◌/g, 'o'], [/↑/g, '^'], [/◆/g, 'c'], [/−/g, '-'], [/\uFE0F/g, ''], [/ · step \d+\/\d+$/, '']];
/** The recorded score, one `1w:` / `1b:` group per turn, in the move-history notation with ASCII for its symbols. */
export function compactHistory(history: LocalGameHistory): string {
  const turns: string[] = []; let key = '', previous = '';
  for (const frame of history.frames.slice(1)) {
    const label = EMOJI.reduce((text, [from, to]) => text.replace(from, to), frame.label)
      .replace(/^END_ACTION_PHASE$|^End turn$/, 'end').replace(/^Start actions$/, 'go');
    // The turn-ending step is recorded against the next mover; it belongs to the turn it ends.
    if (label === 'end' && frame.turn !== key && turns.length) { turns[turns.length - 1] += ' end;'; continue; }
    if (frame.turn !== key) { key = frame.turn; previous = ''; const [n, player] = key.split('.'); turns.push(`${n}${player[0]}:`); }
    if (label === previous) continue;
    previous = label; turns[turns.length - 1] += ` ${label};`;
  }
  return turns.join(' ');
}

export function formatCompactReport(input: PositionReportInput, history?: LocalGameHistory | null): string {
  const { state } = input, flat = state.board.cells.flat().map(c => c.resourceLayers);
  const initial = state.board.initialResourceLayers ?? flat;
  const mapName = Object.keys(NAMED_MAPS).find(name => NAMED_MAPS[name].length === initial.length && NAMED_MAPS[name].every((n, i) => n === initial[i]));
  const diffs = flat.flatMap((n, i) => n === initial[i] ? [] : [`${square({ x: i % 10, y: Math.floor(i / 10) })}=${n}`]).join(' ');
  const side = (player: PlayerId) => { const p = state.players[player];
    return `${player} ${p.resources}c +${p.resourcesGained} -${p.resourcesUpkeep ?? 0}`; };
  const diag = readHardDiagSnapshot(), counters = diag ? Object.entries(diag).filter(([, v]) => typeof v === 'number' && v !== 0).map(([k, v]) => `${k}=${v}`) : [];
  const head = [`muju/${COMPACT_REPORT_VERSION} ${state.ruleset ?? 'standard'}${state.ruleset === 'phasing' ? ` ${PHASING_RULES_REVISION}` : ''}`,
    `${input.difficulty} ${input.pace} ${input.engine}`,
    `T${state.turn.turnNumber} ${state.turn.currentPlayer} ${state.turn.phase} ap${state.turn.actionsRemaining}/${getActionsPerTurn(state)}`,
    `clock${state.inactivityPlies ?? 0}`,
    ...(state.upkeepPending ? ['upkeep'] : []), ...(state.progressThisTurn ? ['progress'] : []),
    ...(state.blackCrystalHandicap ? [`hcap${state.blackCrystalHandicap}`] : []),
    ...(state.phase === 'victory' ? [`won:${state.winner ?? 'draw'}:${state.victoryReason ?? ''}`] : [])].join(' | ');
  return [head,
    ...(input.note ? [`note ${input.note.replace(/\s+/g, ' ')}`] : []),
    `map ${mapName ?? layers(initial)}`,
    ...(diffs ? [`cells ${diffs.length < flat.length ? diffs : `=${layers(flat)}`}`] : []),
    side('white'), side('black'),
    // One list in board order: engines iterate units in this order, so it is part of the position.
    `units ${state.board.units.map(u => `${u.owner[0]}${unitToken(u, state)}`).join(' ')}`,
    ...(state.pendingSummons?.length ? [`summons ${state.pendingSummons.map(summonToken).join(' ')}`] : []),
    ...(state.lastSummoning?.disrupted.length ? [`disrupted ${state.lastSummoning.disrupted.map(summonToken).join(' ')}`] : []),
    ...(input.lastTurnActions.length ? [`last ${lastTurn(input.lastTurnActions, state)}`] : []),
    ...(diag ? [`diag ${counters.join(' ') || 'all-zero'}${diag.lastFallback ? ` lastFallback=${String(diag.lastFallback).replace(/\s+/g, '_')}` : ''}`] : []),
    ...(history && history.frames.length > 1 ? [`game${history.complete ? '' : ' (partial)'} ${compactHistory(history)}`] : []),
  ].join('\n');
}

export interface ParsedCompactReport { state: GameState; note: string | null; difficulty: string; pace: string; engine: string; last: string | null; game: string | null }

/** Rebuilds a playable state. Throws on a malformed report rather than guessing. */
export function parseCompactReport(text: string): ParsedCompactReport {
  const lines = text.trim().split('\n').map(line => line.trim()).filter(Boolean);
  const value = (key: string) => { const line = lines.find(l => l === key || l.startsWith(`${key} `)); return line === undefined ? null : line.slice(key.length + 1); };
  const head = lines[0].split(' | ').map(part => part.trim());
  const [version, ruleset] = head[0].split(' ');
  if (version !== `muju/${COMPACT_REPORT_VERSION}`) throw new Error(`Unsupported report: ${version}`);
  const [difficulty, pace, engine] = head[1].split(' ');
  const turn = /^T(\d+) (white|black) (place|action) ap(\d+)\/(\d+)$/.exec(head[2]);
  if (!turn) throw new Error('Malformed turn header');
  const extra = (prefix: string) => head.slice(3).find(part => part.startsWith(prefix))?.slice(prefix.length);
  const mapText = value('map');
  if (!mapText) throw new Error('Missing map');
  const initial = NAMED_MAPS[mapText] ?? [...mapText].map(c => parseInt(c, 36));
  if (initial.length !== 100 || initial.some(Number.isNaN)) throw new Error('Malformed map');
  const state = createInitialGameState(initial, Number(turn[5]) as Parameters<typeof createInitialGameState>[1], Number(extra('hcap') ?? 0), ruleset as GameState['ruleset']);

  const cellsText = value('cells'), flat = [...initial];
  if (cellsText?.startsWith('=')) [...cellsText.slice(1)].forEach((c, i) => { flat[i] = parseInt(c, 36); });
  else for (const diff of cellsText?.split(' ') ?? []) { const [sq, n] = diff.split('='), p = unsquare(sq); flat[p.y * 10 + p.x] = Number(n); }
  state.board.cells = state.board.cells.map((row, y) => row.map((cell, x) => ({ ...cell, resourceLayers: flat[y * 10 + x] })));

  const units: Unit[] = [], attacked: [Unit, Position[]][] = [];
  for (const player of ['white', 'black'] as const) {
    const match = new RegExp(`^${player} (-?\\d+)c \\+(\\d+) -(\\d+)$`).exec(lines.find(l => l.startsWith(`${player} `)) ?? '');
    if (!match) throw new Error(`Missing ${player} line`);
    state.players[player] = { ...state.players[player], resources: Number(match[1]), resourcesGained: Number(match[2]), resourcesUpkeep: Number(match[3]) };
  }
  for (const token of (value('units') ?? '').split(' ').filter(Boolean)) {
    const parts = /^([wb])([FLWSPM])(\d)([a-j]\d+)(?:-(\d+))?(?:!([a-z]+))?(?:~([a-j0-9,]+))?$/.exec(token);
    if (!parts) throw new Error(`Malformed unit: ${token}`);
    const owner: PlayerId = parts[1] === 'w' ? 'white' : 'black';
    const unit: Unit = { id: `${owner}-${units.length}`, definitionId: `${ELEMENTS[parts[2]]}_${parts[3]}`, owner, position: unsquare(parts[4]),
      hasMoved: false, hasAttacked: false, lastAttackKilled: false, canActThisTurn: true, damageTaken: Number(parts[5] ?? 0),
      promotedThisPlacement: false, placedThisTurn: false, attackedThisTurn: [] };
    getUnitDefinition(unit.definitionId);
    for (const letter of parts[6] ?? '') FLAGS.find(([l]) => l === letter)?.[2](unit);
    if (parts[7]) attacked.push([unit, parts[7].split(',').map(unsquare)]);
    units.push(unit);
  }
  for (const [unit, targets] of attacked) unit.attackedThisTurn = targets.flatMap(p => units.filter(u => sameSquare(u.position, p)).map(u => u.id));
  state.board.units = units;

  const summons = (line: string | null): PendingSummon[] => (line?.split(' ').filter(Boolean) ?? []).map((token, i) => {
    const parts = /^([wb])([FLWSPM])(\d)([a-j]\d+)\/(\d+)$/.exec(token);
    if (!parts) throw new Error(`Malformed summon: ${token}`);
    return { id: `summon-${parts[1]}-${i}`, owner: parts[1] === 'w' ? 'white' : 'black', definitionId: `${ELEMENTS[parts[2]]}_${parts[3]}`, position: unsquare(parts[4]), cost: Number(parts[5]) };
  });
  if (ruleset === 'phasing') state.pendingSummons = summons(value('summons'));
  const disrupted = summons(value('disrupted'));
  if (disrupted.length) state.lastSummoning = { player: disrupted[0].owner, turnNumber: Number(turn[1]), summoned: [], disrupted };

  state.turn = { currentPlayer: turn[2] as PlayerId, phase: turn[3] as GameState['turn']['phase'], actionsRemaining: Number(turn[4]), turnNumber: Number(turn[1]) };
  state.inactivityPlies = Number(extra('clock') ?? 0);
  state.upkeepPending = head.includes('upkeep');
  state.progressThisTurn = head.includes('progress');
  const won = extra('won:')?.split(':');
  if (won) { state.phase = 'victory'; state.winner = won[0] === 'draw' ? null : won[0] as PlayerId; if (won[1]) state.victoryReason = won[1] as GameState['victoryReason']; }
  return { state, note: value('note'), difficulty, pace, engine, last: value('last'), game: value('game') };
}
