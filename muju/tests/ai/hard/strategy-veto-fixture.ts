/**
 * STRATEGOS W1.10 fixtures (`tests/ai/hard/strategy-veto.test.ts`): canonical
 * Phasing `GameState`s that put the root's clock reading into a posture AND
 * make the veto's decision turn on one fact, in pairs:
 *
 *   - `mateOrMaterial(extraBody)` — ForceContact. White's only striker is a
 *     `fire_1`; the one enemy unit it can damage is a `water_1` (water beats
 *     fire: the fire hits it for 1, it one-shots the fire). Every line that
 *     makes contact ends with the fire next to the water. Without
 *     `extraBody` the fire is White's ONLY unit, so losing it is an
 *     elimination (a mate-scale loss); with it — a `plant_1` in a far corner,
 *     the one fact that differs — losing the fire is only material.
 *   - `essentialOrNot(whiteGained)` — Hold. White's `plant_1` stands on the
 *     board's only paying cell with a Black `fire_1` next to it (fire beats
 *     plant: it one-shots it, then has three actions to run from White's
 *     `water_1`); the water can kill that fire this turn — a free kill, which
 *     Hold suppresses. At `whiteGained = 30` the plant's remaining mining is
 *     inside the lead's margin (`strategy/hold.ts holdEssentialSlots`); at 34
 *     — the one fact that differs — it is not.
 *
 * Kept in its own module, like `strategy-plans-fixture.ts`, so the "flag
 * absent ⇒ byte-identical to `c054136b`" digests pinned in the test could be
 * computed from these exact states against an archive of `c054136b`.
 */
import type { GameState } from '../../../src/game/types';
import type { UnitSpec } from './game-fixture';
import { NO_RESERVES, withMined } from './strategy-plans-fixture';

/** ForceContact at clock 6 (`r = 4`), Black 30 ahead on empty reserves; see
 * the module doc. The fire starts at (1,1), eight squares from the water at
 * (6,5): its whole turn is the approach, so no line hits and runs. */
export function mateOrMaterial(extraBody: boolean): GameState {
  const units: UnitSpec[] = [
    { def: 'fire_1', owner: 'white', x: 1, y: 1 },
    { def: 'water_1', owner: 'black', x: 6, y: 5 },
    { def: 'plant_1', owner: 'black', x: 9, y: 9 },
  ];
  if (extraBody) units.push({ def: 'plant_1', owner: 'white', x: 0, y: 9 });
  return withMined(
    { units, reserves: NO_RESERVES, white: 0, black: 0, inactivityPlies: 6, turnNumber: 13, current: 'white' },
    0,
    30,
  );
}

/** The one paying cell of `essentialOrNot`: (5,5), reserve 16 (the packer's
 * ceiling). */
export const ESSENTIAL_CELL = 55;

/** Hold at clock 6 (`r = 4`): White (to move) `plant_1` (5,5) on the paying
 * cell and `water_1` (3,8); Black `fire_1` (5,6) and a far `water_1` (9,0),
 * bank 6; Black 20 mined. See the module doc. */
export function essentialOrNot(whiteGained: number): GameState {
  const reserves = Array<number>(100).fill(0);
  reserves[ESSENTIAL_CELL] = 16;
  const units: UnitSpec[] = [
    { def: 'plant_1', owner: 'white', x: 5, y: 5 },
    { def: 'water_1', owner: 'white', x: 3, y: 8 },
    { def: 'fire_1', owner: 'black', x: 5, y: 6 },
    { def: 'water_1', owner: 'black', x: 9, y: 0 },
  ];
  return withMined(
    { units, reserves, white: 0, black: 6, inactivityPlies: 6, turnNumber: 13, current: 'white' },
    whiteGained,
    20,
  );
}

/** Every named fixture, for the digest pins and the sweeps. */
export const VETO_FIXTURES: ReadonlyArray<readonly [string, () => GameState]> = [
  ['mate', () => mateOrMaterial(false)],
  ['material', () => mateOrMaterial(true)],
  ['essential', () => essentialOrNot(30)],
  ['notEssential', () => essentialOrNot(34)],
];
