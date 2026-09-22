/**
 * `node --import tsx lab/hard-ai/recall/build-fixtures.ts [--check]` — writes (or
 * verifies) `lab/hard-ai/recall/fixtures.jsonl`, the positions the recall gate
 * asserts a named plan on.
 *
 * Only one fixture lives here today: **F16**. DESIGN F16 is the flaw that
 * MF's purchase generator "rejects the only punisher when the buy fills the last
 * spawn square", and names the line
 * `BUY water_1@C1 → Hi C2→D2 → Sjor C1→C2 → ATTACK C3`. The position below is
 * that line's home, built so every clause of the flaw is live:
 *
 *   - White's ONLY legal spawn square is C1 = (2,0); buying there leaves
 *     `spawnAfter === 0` with 4 crystals still in the bank, so DESIGN §5.5's
 *     zero-spawn penalty (and only the penalty — never a rejection) applies;
 *   - the bought Sjor VACATES C1 inside the same turn, which is exactly why the
 *     rejection would have been wrong;
 *   - no white body answers the Black Sjor on C3 as it stands: Hi (fire, POWER 1
 *     into water) and both Mujus (POWER 1) fall short of DEF 2, so the answer
 *     costs crystals either way and the C1 purchase — the buy that fills the
 *     last spawn square — is the cheapest of them.
 *
 * `authored.jsonl` is NOT extended: its eleven positions are treated as frozen.
 * (Corrected 2026-09-22: M1's gate does NOT count them. `fixturesChecked` is
 * `hard:perft --check`'s count of the PERFT fixture set — seven under Phasing,
 * `perft/phasing-fixtures.ts` — and the `=== 11` this note pointed at was the
 * old Standard perft set, not this corpus. The freeze stands on its own; it is
 * just not machine-enforced by M1.) See DEVIATIONS under M13.
 */
import path from 'node:path';
import type { Cell, GameState, Unit } from '../../../src/game/types';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';
import { DEFAULT_RULES, readPositions, writePositions, type StoredPosition } from '../positions/corpus';

const HERE = path.resolve(import.meta.dirname);
export const FIXTURES_FILE = path.join(HERE, 'fixtures.jsonl');

/** File `x` 0..9 (A..J) and rank `y` 0..9 (1..10), the notation SU and the
 * archived games use: "C1" is `(x 2, y 0)`, "J10" is `(x 9, y 9)`. */
function at(file: string, rank: number): { x: number; y: number } {
  return { x: file.charCodeAt(0) - 'A'.charCodeAt(0), y: rank - 1 };
}

function unit(id: string, definitionId: string, owner: 'white' | 'black', file: string, rank: number): Unit {
  return {
    id,
    definitionId,
    owner,
    position: at(file, rank),
    hasMoved: false,
    hasAttacked: false,
    lastAttackKilled: false,
    canActThisTurn: true,
    damageTaken: 0,
    promotedThisPlacement: false,
    placedThisTurn: false,
  };
}

function cells(): Cell[][] {
  const rows: Cell[][] = new Array<Cell[]>(10);
  for (let y = 0; y < 10; y++) {
    const row: Cell[] = new Array<Cell>(10);
    for (let x = 0; x < 10; x++) row[x] = { position: { x, y }, resourceLayers: UNEQUAL_ROUTES_MAP[y * 10 + x] };
    rows[y] = row;
  }
  return rows;
}

function f16State(): GameState {
  return {
    actionsPerTurn: 4,
    blackCrystalHandicap: 0,
    victoryRule: 'home-or-elimination',
    inactivityRule: 'on',
    upkeepPending: false,
    reviewUpkeep: { white: false, black: false },
    inactivityPlies: 0,
    progressThisTurn: false,
    phase: 'playing',
    board: {
      cells: cells(),
      units: [
        // White fills its own rectangle except C1, so C1 is the last legal square.
        unit('unit-white-0-a1', 'plant_1', 'white', 'A', 1),
        unit('unit-white-0-b1', 'fire_1', 'white', 'B', 1),
        unit('unit-white-0-a2', 'fire_1', 'white', 'A', 2),
        unit('unit-white-0-b2', 'plant_1', 'white', 'B', 2),
        // "Hi C2" — the anchor whose rectangle reaches C1, and the body that
        // steps aside to D2 so the bought Sjor can take its square.
        unit('unit-white-0-hi', 'fire_1', 'white', 'C', 2),
        // "C3" — the Black Sjor no white body on the board can remove (POWER 1 < DEF 2).
        unit('unit-black-0-sjor', 'water_1', 'black', 'C', 3),
        unit('unit-black-0-far1', 'plant_1', 'black', 'J', 10),
        unit('unit-black-0-far2', 'fire_1', 'black', 'I', 10),
      ],
      initialResourceLayers: [...UNEQUAL_ROUTES_MAP],
    },
    players: {
      // 8 crystals: enough that `bank - spend >= 3` after the 4-crystal Sjor, so
      // DESIGN §5.5's zero-spawn penalty is live rather than vacuous.
      white: { id: 'white', resources: 8, startCorner: { x: 0, y: 0 }, resourcesGained: 0, resourcesUpkeep: 0 },
      black: { id: 'black', resources: 6, startCorner: { x: 9, y: 9 }, resourcesGained: 0, resourcesUpkeep: 0 },
    },
    turn: { currentPlayer: 'white', phase: 'place', actionsRemaining: 4, turnNumber: 5 },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

export const F16_ID = 'f16-punisher';
/** The buy the gate looks for: `water_1` on C1. */
export const F16_DEF = 'water_1';
export const F16_SQUARE = at('C', 1).y * 10 + at('C', 1).x;

function fixtures(): StoredPosition[] {
  return [
    {
      schema: 'muju-position-v1',
      id: F16_ID,
      tags: ['purchase', 'f16', 'recall'],
      rationale:
        "DESIGN F16: C1 is White's last legal spawn square, so BUY water_1@C1 leaves spawnAfter 0 with 4 crystals " +
        'in hand — and is still the cheapest answer to the Black Sjor on C3, which no white body can remove as it ' +
        'stands (Hi C2->D2, Sjor C1->C2, ATTACK C3).',
      depth: 3,
      rules: { ...DEFAULT_RULES, combatHandicap: { white: 0, black: 0 } },
      state: f16State(),
    },
  ];
}

function main(): void {
  const check = process.argv.includes('--check');
  const built = fixtures();
  if (!check) {
    writePositions(FIXTURES_FILE, built);
    console.log(`recall/build-fixtures: wrote ${built.length} fixture(s) to ${FIXTURES_FILE}`);
    return;
  }
  const stored = readPositions(FIXTURES_FILE);
  const same = JSON.stringify(stored) === JSON.stringify(built);
  console.log(JSON.stringify({ fixtures: stored.length, matches: same }));
  if (!same) process.exitCode = 1;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('build-fixtures.ts')) main();
