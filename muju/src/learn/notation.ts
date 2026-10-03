import type { AIAction } from '../ai/types';
import { applyAction } from '../ai/simulate';
import { getUnitAt, getUnitById } from '../game/board';
import { getUnitDefinition } from '../game/units';
import type { Element, GameState, PlayerId, Position } from '../game/types';
import type { Square } from './types';

/**
 * Puzzle notation.
 *
 * Board rows are listed from the top (row 1, White's side) down, one token per
 * square, separated by spaces:
 *
 *   .        empty, no crystals          8        empty, 8 crystals
 *   F1       White Hi (no crystals)      f1+4     Black Hi standing on 4 crystals
 *   w2!1     Black Straumr, 1 damage     P1~      White Muju that already acted this turn
 *
 * A piece is an element letter and a tier: F fire, L lightning, W water, S shadow,
 * P plant, M metal. UPPERCASE is White, lowercase is Black. `+n` is the reserve
 * under it, `!n` damage already taken this turn (enemy pieces only), `~` spent.
 *
 * Squares are a column letter and a row number: `a1` is the top-left square,
 * White's home; the bottom-right corner is Black's home.
 *
 * Moves, for `solution` and `tries`:
 *
 *   c1-c3      move the piece on c1 to c3 (one declared trip, any number of actions)
 *   c3xc4      the piece on c3 attacks c4
 *   c1-c3xc4   move, then attack from the landing square
 *   mine       Mine & prepare (END_ACTION_PHASE)
 *   keep b2 c3 keep these tier-2/3 pieces at upkeep (tier 1 is always kept; `keep` alone keeps only tier 1)
 *   +F1@b2     summon a tier-1 piece on b2 (owner is the side to move)
 *   ^b2        promote the piece on b2
 *   end        End turn (END_PLACE_PHASE)
 */

export const ELEMENT_LETTER: Record<Element, string> = { fire: 'F', lightning: 'L', water: 'W', shadow: 'S', plant: 'P', metal: 'M' };
const LETTER_ELEMENT: Record<string, Element> = { F: 'fire', L: 'lightning', W: 'water', S: 'shadow', P: 'plant', M: 'metal' };

export const squareOf = (s: Square): Position => {
  const m = /^([a-j])(10|[1-9])$/.exec(s.trim().toLowerCase());
  if (!m) throw new Error(`Bad square "${s}"`);
  return { x: m[1].charCodeAt(0) - 97, y: Number(m[2]) - 1 };
};
export const nameSquare = (p: Position): Square => `${String.fromCharCode(97 + p.x)}${p.y + 1}`;

/** `F1` → `fire_1`, case-insensitive; also accepts a definition id. */
export function typeOf(code: string): string {
  if (/^[a-z]+_[123]$/.test(code)) { getUnitDefinition(code); return code; }
  const m = /^([FLWSPMflwspm])([123])$/.exec(code);
  if (!m) throw new Error(`Bad piece code "${code}"`);
  return `${LETTER_ELEMENT[m[1].toUpperCase()]}_${m[2]}`;
}
export const codeOf = (type: string, owner: PlayerId = 'white'): string => {
  const def = getUnitDefinition(type);
  const letter = ELEMENT_LETTER[def.element];
  return `${owner === 'white' ? letter : letter.toLowerCase()}${def.tier}`;
};

export interface ParsedPiece { owner: PlayerId; type: string; x: number; y: number; damage: number; spent: boolean }
export interface ParsedBoard { size: number; pieces: ParsedPiece[]; reserves: number[][] }

const TOKEN = /^(?:([FLWSPMflwspm])([123])(?:!(\d+))?(~)?)?(?:\+?(\d+))?$/;

export function parseBoard(rows: string[]): ParsedBoard {
  const size = rows.length;
  if (size < 3 || size > 10) throw new Error(`Boards are 3×3 to 10×10, got ${size} rows`);
  const pieces: ParsedPiece[] = [];
  const reserves = rows.map((row, y) => {
    const tokens = row.trim().split(/\s+/);
    if (tokens.length !== size) throw new Error(`Row ${y + 1} has ${tokens.length} squares; the board is ${size}×${size}`);
    return tokens.map((token, x) => {
      if (token === '.') return 0;
      const m = TOKEN.exec(token);
      if (!m || token === '') throw new Error(`Bad token "${token}" at ${nameSquare({ x, y })}`);
      const [, letter, tier, damage, spent, crystals] = m;
      if (letter) pieces.push({
        owner: letter === letter.toUpperCase() ? 'white' : 'black',
        type: `${LETTER_ELEMENT[letter.toUpperCase()]}_${tier}`,
        x, y, damage: damage ? Number(damage) : 0, spent: !!spent,
      });
      const n = crystals ? Number(crystals) : 0;
      if (n > 16) throw new Error(`Reserve ${n} at ${nameSquare({ x, y })} is above 16`);
      return n;
    });
  });
  return { size, pieces, reserves };
}

const unitOn = (state: GameState, s: Square) => {
  const unit = getUnitAt(state.board, squareOf(s));
  if (!unit) throw new Error(`No piece on ${s}`);
  return unit;
};

/** One notation step → the actions it stands for, resolved against `state`. */
export function parseMove(state: GameState, move: string): AIAction[] {
  const m = move.trim();
  if (m === 'mine') return [{ type: 'END_ACTION_PHASE' }];
  if (m === 'end') return [{ type: 'END_PLACE_PHASE' }];
  if (m === 'keep' || m.startsWith('keep ')) {
    // Tier-1 pieces are always kept, so they need not be listed.
    const listed = m.slice(4).trim().split(/[\s,]+/).filter(Boolean).map(s => unitOn(state, s).id);
    const free = state.board.units.filter(u => u.owner === state.turn.currentPlayer && getUnitDefinition(u.definitionId).tier === 1).map(u => u.id);
    return [{ type: 'PAY_UPKEEP', keepUnitIds: [...new Set([...free, ...listed])] }];
  }
  let buy = /^\+([A-Za-z]\d|[a-z]+_\d)@([a-j]\d+)$/.exec(m);
  if (buy) return [{ type: 'BUY_UNIT', definitionId: typeOf(buy[1]), position: squareOf(buy[2]) }];
  buy = /^\^([a-j]\d+)$/.exec(m);
  if (buy) return [{ type: 'PROMOTE_UNIT', unitId: unitOn(state, buy[1]).id }];
  const step = /^([a-j]\d+)(?:-([a-j]\d+))?(?:x([a-j]\d+))?$/.exec(m);
  if (!step || (!step[2] && !step[3])) throw new Error(`Bad move "${move}"`);
  const unit = unitOn(state, step[1]);
  const out: AIAction[] = [];
  if (step[2]) out.push({ type: 'MOVE', unitId: unit.id, to: squareOf(step[2]) });
  if (step[3]) out.push({ type: 'ATTACK', unitId: unit.id, targetPosition: squareOf(step[3]) });
  return out;
}

/** Play a notation line through `applyAction`; stops at the first illegal step. */
export function playLine(state: GameState, line: readonly string[]): { state: GameState; actions: AIAction[]; error?: string } {
  const actions: AIAction[] = [];
  let current = state;
  for (const move of line) {
    let parsed: AIAction[];
    try { parsed = parseMove(current, move); } catch (e) { return { state: current, actions, error: (e as Error).message }; }
    for (const action of parsed) {
      const next = applyAction(current, action);
      if (next === current) return { state: current, actions, error: `Illegal "${move}"` };
      actions.push(action);
      current = next;
    }
  }
  return { state: current, actions };
}

/** Inverse of `parseMove`, for printing solver witnesses. */
export function formatAction(state: GameState, action: AIAction): string {
  switch (action.type) {
    case 'END_ACTION_PHASE': return 'mine';
    case 'END_PLACE_PHASE': return 'end';
    case 'RESIGN': return 'resign';
    case 'PAY_UPKEEP': return ['keep', ...action.keepUnitIds.map(id => nameSquare(getUnitById(state.board, id)!.position))].join(' ');
    case 'BUY_UNIT': return `+${codeOf(action.definitionId)}@${nameSquare(action.position)}`;
    case 'PROMOTE_UNIT': return `^${nameSquare(getUnitById(state.board, action.unitId)!.position)}`;
    case 'MOVE': return `${nameSquare(getUnitById(state.board, action.unitId)!.position)}-${nameSquare(action.to)}`;
    case 'ATTACK': return `${nameSquare(getUnitById(state.board, action.unitId)!.position)}x${nameSquare(action.targetPosition)}`;
  }
}

/** Format a whole line, advancing the state as it goes. */
export function formatLine(state: GameState, actions: readonly AIAction[]): string[] {
  const out: string[] = [];
  let current = state;
  for (const action of actions) {
    out.push(formatAction(current, action));
    current = applyAction(current, action);
  }
  return out;
}

/** Pending summons, e.g. `black Hi lands on c3`. */
export const renderPending = (state: GameState): string[] =>
  (state.pendingSummons ?? []).map(p => `${p.owner} ${getUnitDefinition(p.definitionId).name} lands on ${nameSquare(p.position)}`);

/** Render a state back to notation rows (for the check tool and tests). */
export function renderBoard(state: GameState): string[] {
  const size = state.board.cells.length;
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    const tokens: string[] = [];
    for (let x = 0; x < size; x++) {
      const unit = getUnitAt(state.board, { x, y });
      const crystals = state.board.cells[y][x].resourceLayers;
      if (!unit) { tokens.push(crystals ? String(crystals) : '.'); continue; }
      let token = codeOf(unit.definitionId, unit.owner);
      if (unit.damageTaken) token += `!${unit.damageTaken}`;
      if (!unit.canActThisTurn) token += '~';
      if (crystals) token += `+${crystals}`;
      tokens.push(token);
    }
    rows.push(tokens.map(t => t.padEnd(6)).join(' ').trimEnd());
  }
  return rows;
}
