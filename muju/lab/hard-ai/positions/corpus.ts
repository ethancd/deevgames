/**
 * `muju-position-v1` reader/writer and 180-degree mirroring (DESIGN §7.5).
 *
 * Every stored position pairs a real canonical `GameState` with a `rules`
 * block, because the game's element graph, upkeep schedule and combat
 * handicap are process-global knobs (`setElementGraph`/`setUpkeepVariant`/
 * `setCombatHandicap`) that a bare `GameState` does not capture; the block
 * also restates the three knobs that ARE embedded on `state` itself
 * (`victoryRule`, `inactivityRule`, `blackCrystalHandicap`) so every fixture
 * consumer has one place to read the whole rules configuration from.
 *
 * File format: one JSON object per line (JSONL), no trailing commas, each
 * line independently `JSON.parse`-able.
 */
import fs from 'node:fs';
import type { Cell, GameState, PendingSummon, PlayerId, Position } from '../../../src/game/types';
import type { ElementGraphName } from '../../../src/game/elements';

export interface RulesBlock {
  elementGraph: ElementGraphName;
  upkeep: 'shipped' | 'steep' | 'off';
  inactivityRule: 'on' | 'off';
  victoryRule: 'elimination' | 'home-or-elimination';
  /** blackCrystalHandicap, 0..MAX_BLACK_CRYSTAL_HANDICAP (rules.ts). */
  handicap: number;
  combatHandicap: { white: number; black: number };
}

export const DEFAULT_RULES: Readonly<RulesBlock> = Object.freeze({
  elementGraph: 'double-thick',
  upkeep: 'shipped',
  inactivityRule: 'on',
  victoryRule: 'home-or-elimination',
  handicap: 0,
  combatHandicap: Object.freeze({ white: 0, black: 0 }),
});

export interface StoredPosition {
  schema: 'muju-position-v1';
  /** Unique within the file it is stored in. */
  id: string;
  /** Free-text search tags (e.g. "home", "tactics", "economy"). */
  tags?: string[];
  /** Why this position exists / what it pins down. */
  rationale?: string;
  /** Suggested `perftActions` maxActions budget for this position (perft/fuzz tooling). */
  depth?: number;
  rules: RulesBlock;
  state: GameState;
}

function parseLine(line: string, source: string, lineNumber: number): StoredPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    throw new Error(`${source}:${lineNumber}: invalid JSON (${(err as Error).message})`);
  }
  const p = parsed as Partial<StoredPosition>;
  if (p.schema !== 'muju-position-v1') {
    throw new Error(`${source}:${lineNumber}: expected schema "muju-position-v1", got ${JSON.stringify(p.schema)}`);
  }
  if (typeof p.id !== 'string' || p.id.length === 0) {
    throw new Error(`${source}:${lineNumber}: missing "id"`);
  }
  if (!p.rules) throw new Error(`${source}:${lineNumber} (${p.id}): missing "rules" block`);
  if (!p.state) throw new Error(`${source}:${lineNumber} (${p.id}): missing "state"`);
  return parsed as StoredPosition;
}

/** Reads every non-blank line of a `muju-position-v1` JSONL file. */
export function readPositions(path: string): StoredPosition[] {
  const text = fs.readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const positions: StoredPosition[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    positions.push(parseLine(line, path, i + 1));
  }
  return positions;
}

/** Writes one JSON object per line, trailing newline, ids in the given order. */
export function writePositions(path: string, positions: readonly StoredPosition[]): void {
  const body = positions.map(p => JSON.stringify(p)).join('\n');
  fs.writeFileSync(path, positions.length > 0 ? body + '\n' : '');
}

export function findPosition(positions: readonly StoredPosition[], id: string): StoredPosition {
  const found = positions.find(p => p.id === id);
  if (!found) throw new Error(`Position not found: ${id}`);
  return found;
}

function swapSide(side: PlayerId): PlayerId {
  return side === 'white' ? 'black' : 'white';
}

function flip(p: Position): Position {
  return { x: 9 - p.x, y: 9 - p.y };
}

/**
 * 180-degree board symmetry with sides swapped: square s -> 99-s (DESIGN
 * `core/tables.ts rot180`, F10). This transforms state, including ordered
 * Phasing commitments and receipts. It does not imply score symmetry: the
 * named default-upkeep policy has absolute-square tie breaks, and handicaps
 * and process-global rules require separate interpretation.
 */
export function mirror180(state: GameState): GameState {
  const summon = (p: PendingSummon): PendingSummon => ({ ...p, owner: swapSide(p.owner), position: flip(p.position) });
  const cells: Cell[][] = new Array(10);
  for (let y = 0; y < 10; y++) {
    const row: Cell[] = new Array(10);
    for (let x = 0; x < 10; x++) {
      row[x] = { position: { x, y }, resourceLayers: state.board.cells[9 - y][9 - x].resourceLayers };
    }
    cells[y] = row;
  }
  const initialResourceLayers = state.board.initialResourceLayers
    ? [...state.board.initialResourceLayers].reverse()
    : state.board.initialResourceLayers;

  return {
    ...state,
    board: {
      ...state.board,
      initialResourceLayers,
      cells,
      units: state.board.units.map(u => ({ ...u, owner: swapSide(u.owner), position: flip(u.position) })),
    },
    players: {
      white: { ...state.players.black, id: 'white', startCorner: flip(state.players.black.startCorner) },
      black: { ...state.players.white, id: 'black', startCorner: flip(state.players.white.startCorner) },
    },
    turn: { ...state.turn, currentPlayer: swapSide(state.turn.currentPlayer) },
    winner: state.winner ? swapSide(state.winner) : state.winner,
    reviewUpkeep: state.reviewUpkeep
      ? { white: state.reviewUpkeep.black, black: state.reviewUpkeep.white }
      : state.reviewUpkeep,
    pendingSummons: state.pendingSummons?.map(summon),
    lastSummoning: state.lastSummoning ? { ...state.lastSummoning, player: swapSide(state.lastSummoning.player),
      summoned: state.lastSummoning.summoned.map(summon), disrupted: state.lastSummoning.disrupted.map(summon) } : state.lastSummoning,
    validMoves: state.validMoves.map(flip), validAttacks: state.validAttacks.map(flip),
    lastIncome: state.lastIncome ? { ...state.lastIncome, player: swapSide(state.lastIncome.player),
      takes: state.lastIncome.takes.map(t => ({ ...t, position: flip(t.position) })) } : state.lastIncome,
    lastUpkeep: state.lastUpkeep ? { ...state.lastUpkeep, player: swapSide(state.lastUpkeep.player) } : state.lastUpkeep,
  };
}
