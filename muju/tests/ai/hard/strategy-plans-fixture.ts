/**
 * STRATEGOS W1.9 fixtures (`tests/ai/hard/strategy-plans.test.ts`): canonical
 * Phasing `GameState`s built to put the root's clock reading
 * (`strategy/clock.ts clockReading`) into a known posture, so the plan
 * injection (`strategy/contact.ts`, `strategy/hold.ts`) has something to do.
 *
 * Kept in its own module, like `game-fixture.ts`, so the "flag absent ⇒ the
 * root candidate list is byte-identical to `c054136b`" digests pinned in the
 * test could be computed from these exact states against the unmodified tree
 * before any W1.9 source existed.
 *
 * Every state books its mined totals on the INITIAL reserve of one cell that
 * is empty on the board (`withMined`), so the reserve-conservation invariant
 * (`Σ reserve + gained === Σ initialReserve`) holds exactly as it does in
 * `tests/ai/hard/kill-clock-policy.test.ts leadAtClock`.
 */
import type { GameState } from '../../../src/game/types';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';
import { buildState, type StateSpec, type UnitSpec } from './game-fixture';

/** An empty board: every reserve zero, so nothing is mined and the ledger's
 * `L`/`U` collapse to the mined totals already booked. Used where a test wants
 * the clock verdict to depend on `whiteGained`/`blackGained` alone. */
export const NO_RESERVES: readonly number[] = Object.freeze(Array<number>(100).fill(0));

/** A cell no fixture occupies whose INITIAL reserve absorbs the booked mined
 * totals: `(3, 0)`, empty on the shipped map (`UNEQUAL_ROUTES_MAP[3] === 0`). */
const BOOK_CELL = 3;

/** `spec` built, then the two sides' mined totals booked on `BOOK_CELL`'s
 * initial reserve so the reserve-conservation invariant still holds. */
export function withMined(spec: StateSpec, whiteGained: number, blackGained: number): GameState {
  const state = buildState(spec);
  const initialResourceLayers = [...(state.board.initialResourceLayers ?? spec.reserves ?? UNEQUAL_ROUTES_MAP)];
  initialResourceLayers[BOOK_CELL] += whiteGained + blackGained;
  return {
    ...state,
    board: { ...state.board, initialResourceLayers },
    players: {
      white: { ...state.players.white, resourcesGained: whiteGained },
      black: { ...state.players.black, resourcesGained: blackGained },
    },
  };
}

/**
 * WAVE-1 SHAPE, bounded-loss for White (the side to move): White has miners,
 * one striker and cash but NO contact, Black is far ahead on mined total, and
 * the kill clock stands at 6 (`r = 4` plies left). The shipped reserve map, so
 * both sides really mine.
 *
 * White: `plant_1` a1-ish miners at (1,0) and (0,1), `fire_1` at (1,2), bank
 * 9, 12 mined. Black: `plant_1` miners at (8,9) and (9,8), a forward `plant_1`
 * at (6,6), bank 4, 45 mined. The fire is nine squares from the forward
 * plant: it cannot hit it this turn (eight squares of approach at speed 2 is
 * the whole budget) and can next turn if the plant stays.
 */
export function trailingNoContact(whiteGained = 12, blackGained = 45): GameState {
  const units: UnitSpec[] = [
    { def: 'plant_1', owner: 'white', x: 1, y: 0 },
    { def: 'plant_1', owner: 'white', x: 0, y: 1 },
    { def: 'fire_1', owner: 'white', x: 1, y: 2 },
    { def: 'plant_1', owner: 'black', x: 8, y: 9 },
    { def: 'plant_1', owner: 'black', x: 9, y: 8 },
    { def: 'plant_1', owner: 'black', x: 6, y: 6 },
  ];
  return withMined(
    { units, reserves: UNEQUAL_ROUTES_MAP, white: 9, black: 4, inactivityPlies: 6, turnNumber: 13, current: 'white' },
    whiteGained,
    blackGained,
  );
}

/**
 * Bounded-win for White (the side to move), with real threats: a Black
 * `fire_1` at (5,5) one-shots `plant_1` (fire beats plant: 2 + 1 ≥ 3,
 * `src/game/elements.ts`) and can Cleave through White's plants at (4,4)
 * and (4,6) from (4,5), one step away. The plants (speed 1) cannot leave the
 * fire's reach this turn, so no retreat saves them — only stepping one of them
 * out of the chain does; White's `fire_1` at (6,2) is inside the same strike
 * area and fast enough (speed 2) to leave it. White's third plant at (0,1)
 * is out of reach. Clock 6 (`r = 4`).
 */
export function leadingExposed(whiteGained = 50, blackGained = 10): GameState {
  const units: UnitSpec[] = [
    { def: 'plant_1', owner: 'white', x: 4, y: 4 },
    { def: 'plant_1', owner: 'white', x: 4, y: 6 },
    { def: 'plant_1', owner: 'white', x: 0, y: 1 },
    { def: 'fire_1', owner: 'white', x: 6, y: 2 },
    { def: 'fire_1', owner: 'black', x: 5, y: 5 },
    { def: 'plant_1', owner: 'black', x: 9, y: 8 },
  ];
  return withMined(
    { units, reserves: UNEQUAL_ROUTES_MAP, white: 5, black: 3, inactivityPlies: 6, turnNumber: 13, current: 'white' },
    whiteGained,
    blackGained,
  );
}

/**
 * ForceContact whose cheapest target needs a PROMOTION to be one-shot: White's
 * `fire_1` at (2,3) hits Black's `water_1` at (6,6) for 1 (water beats fire:
 * 2 − 1), below its DEF 2, while a `fire_2` hits it for 2 (3 − 1) — the
 * threshold `strategy/contact.ts`'s PROMOTE line crosses. White banks 10
 * (`fire_1 → fire_2` costs 4). Black 33 up on the shipped map; clock 6.
 */
export function promoteCrossing(): GameState {
  const units: UnitSpec[] = [
    { def: 'fire_1', owner: 'white', x: 2, y: 3 },
    { def: 'plant_1', owner: 'white', x: 0, y: 1 },
    { def: 'water_1', owner: 'black', x: 6, y: 6 },
    { def: 'plant_1', owner: 'black', x: 9, y: 8 },
  ];
  return withMined(
    { units, reserves: UNEQUAL_ROUTES_MAP, white: 10, black: 2, inactivityPlies: 6, turnNumber: 13, current: 'white' },
    10,
    43,
  );
}

/**
 * ForceContact where the approach alone reaches contact THIS turn: White's
 * `fire_1` at (2,4) is five squares from Black's `plant_1` at (6,5) — four
 * squares of approach (two actions at speed 2) and a hit (fire one-shots
 * plant). Empty reserves; Black 30 up; clock 7 (`r = 3`).
 */
export function contactThisTurn(): GameState {
  const units: UnitSpec[] = [
    { def: 'fire_1', owner: 'white', x: 2, y: 4 },
    { def: 'plant_1', owner: 'white', x: 0, y: 0 },
    { def: 'plant_1', owner: 'black', x: 6, y: 5 },
    { def: 'plant_1', owner: 'black', x: 9, y: 9 },
  ];
  return withMined(
    { units, reserves: NO_RESERVES, white: 0, black: 0, inactivityPlies: 7, turnNumber: 15, current: 'white' },
    0,
    30,
  );
}

/**
 * ForceContact that a MINING opponent concedes and an EVADING one refuses:
 * White's only striker is a `water_1` (speed 1; water beats fire, so it
 * one-shots `fire_1`) at (2,4), six squares from Black's `fire_1` at (6,6).
 * White cannot touch it this turn (five squares of approach at speed 1), is
 * adjacent after the approach next turn if the fire stays (it has no reason
 * to move: every reserve is empty, and it cannot kill a `water_1`), and never
 * again once the fire runs (speed 2 outruns speed 1). Neither side can buy
 * (both banks empty, nothing to mine). Clock 6 (`r = 4`, deadline ply 3).
 */
export function evadeEscapes(): GameState {
  const units: UnitSpec[] = [
    { def: 'water_1', owner: 'white', x: 2, y: 4 },
    { def: 'plant_1', owner: 'white', x: 0, y: 0 },
    { def: 'fire_1', owner: 'black', x: 6, y: 6 },
    { def: 'plant_1', owner: 'black', x: 9, y: 9 },
  ];
  return withMined(
    { units, reserves: NO_RESERVES, white: 0, black: 0, inactivityPlies: 6, turnNumber: 13, current: 'white' },
    0,
    30,
  );
}

/**
 * ForceContact that no line can deliver in time: the same two strikers as
 * `evadeEscapes`, far apart, with the clock at 8 (`r = 2`, deadline ply 1:
 * the turn in progress is the only one that counts).
 */
export function tooFarToReach(): GameState {
  const units: UnitSpec[] = [
    { def: 'water_1', owner: 'white', x: 0, y: 2 },
    { def: 'plant_1', owner: 'white', x: 0, y: 0 },
    { def: 'fire_1', owner: 'black', x: 8, y: 8 },
    { def: 'plant_1', owner: 'black', x: 9, y: 9 },
  ];
  return withMined(
    { units, reserves: NO_RESERVES, white: 0, black: 0, inactivityPlies: 8, turnNumber: 17, current: 'white' },
    0,
    30,
  );
}

/** Every named fixture, for the digest pins and the sweeps. */
export const PLAN_FIXTURES: ReadonlyArray<readonly [string, () => GameState]> = [
  ['trailingNoContact', () => trailingNoContact()],
  ['trailingNoContactTied', () => trailingNoContact(40, 40)],
  ['leadingExposed', () => leadingExposed()],
  ['leadingExposedFlipped', () => leadingExposed(10, 50)],
  ['promoteCrossing', promoteCrossing],
  ['contactThisTurn', contactThisTurn],
  ['evadeEscapes', evadeEscapes],
  ['tooFarToReach', tooFarToReach],
];

/**
 * Real Phasing roots where the clock reading has a posture: rows of
 * `lab/hard-ai/positions/p4-determinism.jsonl` (STRATEGOS W1.11's corpus)
 * whose `clockReading` for the side to move is `hold` (015, 018, 019, 022)
 * or `force-contact` (023) — surveyed at `c054136b`; the test re-derives the
 * posture rather than trusting this list.
 */
export const CORPUS_POSTURE_IDS: readonly string[] = ['p4-det-015', 'p4-det-018', 'p4-det-019', 'p4-det-022', 'p4-det-023'];

/** The fields of an exposed fixed-work `RootResult` the plan injection could
 * move — the move, its score, depth, work and nodes, and the published
 * candidate list with every candidate's ordering score, flags, signature and
 * searched score — as one canonical JSON string. `strategy` is deliberately
 * NOT part of it: the Chronicle is new in W1.9 and absent on every search the
 * digest pins. */
export interface ExposedResultLike {
  actions: unknown[];
  scoreCc: number;
  depth: number;
  work: number;
  endKey: string;
  source: string;
  fallback?: string;
  stats: { nodes: number };
  candidates?: ReadonlyArray<{ endKey: string; genRankCc: number; flags: number; sig: number; searched: boolean; scoreCc: number | null; chosen: boolean }>;
  candidateSource?: string;
  rootTrace?: ReadonlyArray<{ depth: number; n: number; searched: number; completed: boolean; cutoffAt: number; truncated: boolean; work?: number }>;
}

export function resultDigestSource(r: ExposedResultLike): string {
  return JSON.stringify({
    actions: r.actions,
    scoreCc: r.scoreCc,
    depth: r.depth,
    work: r.work,
    endKey: r.endKey,
    source: r.source,
    fallback: r.fallback ?? null,
    nodes: r.stats.nodes,
    candidateSource: r.candidateSource ?? null,
    candidates: (r.candidates ?? []).map(c => [c.endKey, c.genRankCc, c.flags, c.sig, c.searched, c.scoreCc, c.chosen]),
    rootTrace: (r.rootTrace ?? []).map(t => [t.depth, t.n, t.searched, t.completed, t.cutoffAt, t.truncated, t.work ?? null]),
  });
}
