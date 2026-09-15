/**
 * Builds the `invariants` suite (DESIGN §5.13, MILESTONES.md M12): twenty
 * authored fixtures, one per SU §7 invariant.
 *
 * `node --import tsx lab/hard-ai/suites/build-invariants.ts [--check]`
 *
 * Each fixture is a PAIR of post-turn macro positions that differ only in the
 * one decision the invariant is about:
 *
 *   - `<id>-violating`: the position the bad turn leaves behind.
 *     `invariantBits(p, t, side)` must set EXACTLY the fixture's own bit.
 *   - `<id>-correct`: the position the good turn leaves behind.
 *     `invariantBits` must set NO bit at all.
 *
 * That is the M12 gate's `invariantFixturesExact === 20`, and it is a far
 * sharper test than "the bad turn sets its bit": it pins every OTHER invariant
 * to silence on the same board, so a test that fires on half the corpus cannot
 * pass.
 *
 * The positions are authored directly as post-turn states rather than replayed
 * from a pre-turn root, because what several invariants read is precisely the
 * per-unit bookkeeping a turn leaves behind — `placedThisTurn`,
 * `promotedThisPlacement`, `lastAttackKilled`, `attackedThisTurn` — and those
 * are fields of `Unit`, set here exactly as `src/game` sets them. Every state
 * is a real `GameState` that `Replica.pack` accepts and the canonical
 * invariants (`lab/harness/invariants.ts`) hold for; `side` is the player who
 * has just moved, so the position has the OPPONENT to move in the place phase
 * with four actions, which is what `src/game/turn.ts finishTurnStart` produces.
 *
 * `best`/`avoid` carry the two `Kpos` values so the suite is a `muju-suite-v1`
 * row M14+ can score an engine against ("do not choose the violating end
 * position"); M12 itself scores the bits, through `lab/hard-ai/bench/run.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BoardState, Cell, GameState, PlayerId, Unit } from '../../../src/game/types';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { INVARIANT_COUNT, invariantBits } from '../../../src/ai/hard/eval/invariants';
import { kposHex } from '../../../src/ai/hard/verify/perft';
import { DEFAULT_RULES, writePositions, type StoredPosition } from '../positions/corpus';
import type { Side } from '../../../src/ai/hard/types';

const HERE = path.resolve(import.meta.dirname);
const SUITE_PATH = path.join(HERE, 'invariants.suite.json');
const POSITIONS_PATH = path.join(HERE, 'invariants.positions.jsonl');
export const POSITIONS_REF = 'lab/hard-ai/suites/invariants.positions.jsonl';

// --- state construction ----------------------------------------------------

interface U {
  def: string;
  owner: PlayerId;
  x: number;
  y: number;
  damage?: number;
  atkCount?: number;
  lastKilled?: boolean;
  placed?: boolean;
  promoted?: boolean;
  canAct?: boolean;
}

interface Board {
  units: U[];
  white: number;
  black: number;
  /** The player to move (the one who did NOT just play the turn). */
  current: PlayerId;
  clock?: number;
  upkeepPending?: boolean;
  turnNumber?: number;
}

function buildUnit(u: U, index: number): Unit {
  const count = u.atkCount ?? 0;
  const attacked: string[] = [];
  for (let k = 0; k < count; k++) attacked.push(`gone-${index}-${k}`);
  return {
    id: `u${index}`,
    definitionId: u.def,
    owner: u.owner,
    position: { x: u.x, y: u.y },
    hasMoved: false,
    hasAttacked: count > 0,
    attackedThisTurn: attacked,
    lastAttackKilled: u.lastKilled ?? false,
    canActThisTurn: u.canAct ?? true,
    damageTaken: u.damage ?? 0,
    placedThisTurn: u.placed ?? false,
    promotedThisPlacement: u.promoted ?? false,
  };
}

function buildCells(): Cell[][] {
  const cells: Cell[][] = new Array<Cell[]>(10);
  for (let y = 0; y < 10; y++) {
    const row: Cell[] = new Array<Cell>(10);
    for (let x = 0; x < 10; x++) row[x] = { position: { x, y }, resourceLayers: UNEQUAL_ROUTES_MAP[y * 10 + x] };
    cells[y] = row;
  }
  return cells;
}

function buildState(b: Board): GameState {
  const board: BoardState = {
    cells: buildCells(),
    units: b.units.map(buildUnit),
    initialResourceLayers: [...UNEQUAL_ROUTES_MAP],
  };
  return {
    actionsPerTurn: 4,
    blackCrystalHandicap: 0,
    victoryRule: 'home-or-elimination',
    inactivityRule: 'on',
    upkeepPending: b.upkeepPending ?? false,
    reviewUpkeep: { white: false, black: false },
    inactivityPlies: b.clock ?? 0,
    progressThisTurn: false,
    phase: 'playing',
    board,
    players: {
      white: { id: 'white', resources: b.white, startCorner: { x: 0, y: 0 }, resourcesGained: 0, resourcesUpkeep: 0 },
      black: { id: 'black', resources: b.black, startCorner: { x: 9, y: 9 }, resourcesGained: 0, resourcesUpkeep: 0 },
    },
    turn: { currentPlayer: b.current, phase: 'place', actionsRemaining: 4, turnNumber: b.turnNumber ?? 6 },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

// --- the twenty scenarios --------------------------------------------------

interface Scenario {
  invariant: number;
  id: string;
  /** The side that just moved; the invariant is evaluated for it. */
  side: PlayerId;
  rationale: string;
  violating: Board;
  correct: Board;
}

/** Black's baseline: two slow, harmless bodies in its own quarter and a bank
 * below a tier-1 price, so nothing black does can set a white invariant. */
const BLACK_QUIET: U[] = [
  { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
  { def: 'plant_1', owner: 'black', x: 7, y: 8 },
];

/** White's baseline: two bodies at spawn depth 4, well clear of its own corner
 * and of black, with a bank above the liquidity floor. */
const WHITE_QUIET: U[] = [
  { def: 'water_1', owner: 'white', x: 2, y: 2 },
  { def: 'metal_1', owner: 'white', x: 1, y: 3 },
];

function whiteBoard(units: U[], white = 8, extra: Partial<Board> = {}): Board {
  return { units: [...units, ...BLACK_QUIET], white, black: 2, current: 'black', ...extra };
}

const SCENARIOS: Scenario[] = [
  {
    invariant: 1,
    id: 'inv1-spawn-zero',
    side: 'white',
    rationale: 'SU #1 / NK:9: the only anchor is the home corner itself, so the rectangle is the one square it stands on and the spawn area is empty with 8 crystals in hand.',
    violating: whiteBoard([{ def: 'water_1', owner: 'white', x: 0, y: 0 }]),
    correct: whiteBoard([
      { def: 'water_1', owner: 'white', x: 0, y: 0 },
      { def: 'metal_1', owner: 'white', x: 2, y: 2 },
    ]),
  },
  {
    invariant: 2,
    id: 'inv2-corner-seal',
    side: 'white',
    rationale: 'SU #2: both squares next to the home corner are held by own speed-1 miners, so no rescuer can ever get back in.',
    violating: whiteBoard([
      { def: 'plant_1', owner: 'white', x: 1, y: 0 },
      { def: 'plant_1', owner: 'white', x: 0, y: 1 },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]),
    correct: whiteBoard([
      { def: 'plant_1', owner: 'white', x: 1, y: 0 },
      { def: 'plant_1', owner: 'white', x: 2, y: 0 },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]),
  },
  {
    invariant: 3,
    id: 'inv3-retreat-square',
    side: 'white',
    rationale: 'SU #3 / SD P6: a cost-5 body parked where a fire_1 can step in, one-shot it and step back out (approach class RETREAT).',
    violating: whiteBoard([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 7, y: 5 }, { def: 'fire_1', owner: 'black', x: 9, y: 2 }]),
    correct: whiteBoard([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 1, y: 4 }, { def: 'fire_1', owner: 'black', x: 9, y: 2 }]),
  },
  {
    invariant: 4,
    id: 'inv4-strand-unpunished',
    side: 'white',
    rationale: 'SU #4: a fire_1 three moves away can strand itself next to the forward plant_1 and white has nothing that kills anything next turn.',
    violating: whiteBoard(
      [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'white', x: 8, y: 4 },
        { def: 'fire_1', owner: 'black', x: 9, y: 9 },
      ],
      8,
    ),
    correct: whiteBoard(
      [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'white', x: 2, y: 4 },
        { def: 'fire_1', owner: 'black', x: 9, y: 9 },
      ],
      8,
    ),
  },
  {
    invariant: 5,
    id: 'inv5-poor-miner-square',
    side: 'white',
    rationale: 'SU #5: a miner bought this turn onto a cell holding less than two turns of its own mine rate, with no anchor, block, plug or home-race job.',
    violating: whiteBoard([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 3, y: 0, placed: true }]),
    correct: whiteBoard([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 3, y: 4, placed: true }]),
  },
  {
    invariant: 6,
    id: 'inv6-fragile-anchor',
    side: 'white',
    rationale: 'SU #6: a deep anchor (depth >= 6) that two enemy bodies can cover completely.',
    violating: whiteBoard([{ def: 'water_1', owner: 'white', x: 4, y: 4 }, { def: 'fire_1', owner: 'black', x: 5, y: 5 }]),
    correct: whiteBoard([{ def: 'water_1', owner: 'white', x: 2, y: 2 }, { def: 'fire_1', owner: 'black', x: 5, y: 5 }]),
  },
  {
    invariant: 7,
    id: 'inv7-promote-no-runway',
    side: 'white',
    rationale: 'SU #7: promoted this turn into an upkeep bill the projected income cannot carry.',
    violating: whiteBoard(
      [
        { def: 'lightning_3', owner: 'white', x: 2, y: 2, promoted: true },
        { def: 'lightning_3', owner: 'white', x: 1, y: 3 },
      ],
      6,
    ),
    correct: whiteBoard(
      [
        { def: 'lightning_3', owner: 'white', x: 2, y: 2 },
        { def: 'lightning_3', owner: 'white', x: 1, y: 3 },
      ],
      6,
    ),
  },
  {
    invariant: 8,
    id: 'inv8-no-pre-adjacency',
    side: 'white',
    rationale: 'SU #8: the turn hit and failed to kill while a kill was on the table.',
    violating: whiteBoard([
      { def: 'metal_1', owner: 'white', x: 8, y: 7, atkCount: 1, lastKilled: false },
      { def: 'metal_1', owner: 'white', x: 1, y: 3 },
    ]),
    correct: whiteBoard([
      { def: 'metal_1', owner: 'white', x: 8, y: 7 },
      { def: 'metal_1', owner: 'white', x: 1, y: 3 },
    ]),
  },
  {
    invariant: 9,
    id: 'inv9-chip-across-turn',
    side: 'white',
    rationale: 'SU #9: the turn chipped an enemy body it could not kill and had no kill available anywhere, so the damage heals for free.',
    violating: whiteBoard([
      { def: 'plant_1', owner: 'white', x: 2, y: 2, atkCount: 1, lastKilled: false },
      { def: 'plant_1', owner: 'white', x: 1, y: 3 },
    ]),
    correct: whiteBoard([
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'white', x: 1, y: 3 },
    ]),
  },
  {
    invariant: 10,
    id: 'inv10-home-reachable',
    side: 'white',
    rationale: 'SU #10: a lightning_1 four actions from the home corner, with no plug and no rescuer next to it.',
    violating: whiteBoard([
      ...WHITE_QUIET,
      { def: 'metal_1', owner: 'white', x: 1, y: 0 },
      { def: 'lightning_1', owner: 'black', x: 4, y: 4 },
    ]),
    correct: whiteBoard([
      ...WHITE_QUIET,
      { def: 'metal_1', owner: 'white', x: 1, y: 0 },
      { def: 'lightning_1', owner: 'black', x: 9, y: 6 },
    ]),
  },
  {
    invariant: 11,
    id: 'inv11-home-bare',
    side: 'white',
    rationale: 'SU #11: home corner and both neighbours empty while black holds a speed-3 runner with a rectangle inside ten of that corner.',
    violating: {
      units: [
        ...WHITE_QUIET,
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
        { def: 'lightning_1', owner: 'black', x: 9, y: 9 },
        ...BLACK_QUIET,
      ],
      white: 8,
      black: 2,
      current: 'black',
    },
    correct: {
      units: [
        ...WHITE_QUIET,
        { def: 'metal_1', owner: 'white', x: 1, y: 0 },
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
        { def: 'lightning_1', owner: 'black', x: 9, y: 9 },
        ...BLACK_QUIET,
      ],
      white: 8,
      black: 2,
      current: 'black',
    },
  },
  {
    invariant: 12,
    id: 'inv12-cleave-line',
    side: 'white',
    rationale: 'SU #12: two own bodies left on one Cleave line of an enemy tier-2 attacker.',
    violating: {
      units: [
        { def: 'lightning_1', owner: 'white', x: 4, y: 5 },
        { def: 'lightning_1', owner: 'white', x: 6, y: 5 },
        { def: 'water_1', owner: 'white', x: 2, y: 2 },
        { def: 'fire_2', owner: 'black', x: 5, y: 8 },
        ...BLACK_QUIET,
      ],
      white: 8,
      black: 2,
      current: 'black',
    },
    correct: {
      units: [
        { def: 'lightning_1', owner: 'white', x: 1, y: 2 },
        { def: 'lightning_1', owner: 'white', x: 3, y: 1 },
        { def: 'water_1', owner: 'white', x: 2, y: 2 },
        { def: 'fire_2', owner: 'black', x: 5, y: 8 },
        ...BLACK_QUIET,
      ],
      white: 8,
      black: 2,
      current: 'black',
    },
  },
  {
    invariant: 13,
    id: 'inv13-turtle',
    side: 'white',
    rationale: 'SU #13: every body within two of home, spawn depth under 4, while black has pushed its own anchor past 4.',
    violating: {
      units: [
        { def: 'water_1', owner: 'white', x: 1, y: 1 },
        { def: 'metal_1', owner: 'white', x: 2, y: 0 },
        { def: 'shadow_1', owner: 'black', x: 6, y: 6 },
        { def: 'plant_1', owner: 'black', x: 7, y: 8 },
      ],
      white: 8,
      black: 2,
      current: 'black',
    },
    correct: {
      units: [
        { def: 'water_1', owner: 'white', x: 1, y: 1 },
        { def: 'metal_1', owner: 'white', x: 3, y: 2 },
        { def: 'shadow_1', owner: 'black', x: 6, y: 6 },
        { def: 'plant_1', owner: 'black', x: 7, y: 8 },
      ],
      white: 8,
      black: 2,
      current: 'black',
    },
  },
  {
    invariant: 14,
    id: 'inv14-liquidity-floor',
    side: 'white',
    rationale: 'SU #14 / P3: the turn won no material and left the bank under the six-crystal floor.',
    violating: whiteBoard(WHITE_QUIET, 3),
    correct: whiteBoard(WHITE_QUIET, 8),
  },
  {
    invariant: 15,
    id: 'inv15-unknown-as-safe',
    side: 'white',
    rationale: 'SU #15 is structural (an UNKNOWN prover verdict is scored as the bad case, never as safety) and carries no weight and no per-position test; the fixture pins its bit to 0 on a board where every other invariant is quiet.',
    violating: whiteBoard(WHITE_QUIET),
    correct: whiteBoard(WHITE_QUIET),
  },
  {
    invariant: 16,
    id: 'inv16-clock-discipline',
    side: 'white',
    rationale: 'SU #16: clock at 7, a 300 cc lead, and nothing to kill — the draw is being handed away.',
    violating: whiteBoard([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 1, y: 4 }], 8, { clock: 7 }),
    correct: whiteBoard([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 1, y: 4 }], 8, { clock: 2 }),
  },
  {
    invariant: 17,
    id: 'inv17-self-block',
    side: 'white',
    rationale: 'SU #17: the body bought this turn sits in the one gap its own runner needed, lengthening that runner\'s route to the enemy corner.',
    violating: whiteBoard([
      { def: 'water_1', owner: 'white', x: 0, y: 0 },
      { def: 'shadow_1', owner: 'white', x: 0, y: 1 },
      { def: 'lightning_1', owner: 'white', x: 1, y: 0, placed: true },
      { def: 'water_1', owner: 'white', x: 3, y: 2 },
    ]),
    correct: whiteBoard([
      { def: 'water_1', owner: 'white', x: 0, y: 0 },
      { def: 'shadow_1', owner: 'white', x: 0, y: 1 },
      { def: 'lightning_1', owner: 'white', x: 2, y: 0, placed: true },
      { def: 'water_1', owner: 'white', x: 3, y: 2 },
    ]),
  },
  {
    invariant: 18,
    id: 'inv18-wasted-end-place',
    side: 'white',
    rationale: 'SU #18 is a protocol rule, not a feature (DESIGN F7): END_PLACE_PHASE is emitted only when legal, so the bit is always 0; the fixture pins it on a quiet board.',
    violating: whiteBoard(WHITE_QUIET),
    correct: whiteBoard(WHITE_QUIET),
  },
  {
    invariant: 19,
    id: 'inv19-soft-miner-exposed',
    side: 'white',
    rationale: 'SU #19: a DEF-1 miner parked forward inside the square set black could buy into, with black holding a tier-1 price.',
    violating: whiteBoard([...WHITE_QUIET, { def: 'fire_1', owner: 'white', x: 6, y: 5 }], 8, { black: 5 }),
    correct: whiteBoard([...WHITE_QUIET, { def: 'fire_1', owner: 'white', x: 1, y: 1 }], 8, { black: 5 }),
  },
  {
    invariant: 20,
    id: 'inv20-strand-no-retreat',
    side: 'white',
    rationale: 'SU #20: the body that made the kill this turn has nowhere to step that black does not already cover.',
    violating: whiteBoard([
      { def: 'metal_1', owner: 'white', x: 8, y: 9, lastKilled: true, atkCount: 1 },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]),
    correct: whiteBoard([
      { def: 'metal_1', owner: 'white', x: 2, y: 3, lastKilled: true, atkCount: 1 },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]),
  },
];

// --- build / check ---------------------------------------------------------

const replica = new Replica();
const packed = allocState();
const tables = allocTables();
const scratch = new Scratch(1, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);

export function bitsOf(state: GameState, side: Side): number {
  replica.pack(state, packed);
  tables.keyLo = -1 >>> 0;
  tables.keyHi = -1 >>> 0;
  buildTables(packed, scratch, 0, 2, tables);
  return invariantBits(packed, tables, side, scratch, 0);
}

function keyOf(state: GameState): string {
  replica.pack(state, packed);
  return kposHex(packed);
}

function describe(bits: number): string {
  if (bits === 0) return 'none';
  const out: number[] = [];
  for (let i = 0; i < INVARIANT_COUNT; i++) if ((bits >>> i) & 1) out.push(i + 1);
  return out.join(',');
}

interface Report {
  id: string;
  invariant: number;
  ok: boolean;
  violatingBits: string;
  correctBits: string;
}

export function evaluateScenarios(): { reports: Report[]; exact: number } {
  const reports: Report[] = [];
  let exact = 0;
  for (const sc of SCENARIOS) {
    const side: Side = sc.side === 'white' ? 0 : 1;
    const want = sc.invariant === 15 || sc.invariant === 18 ? 0 : 1 << (sc.invariant - 1);
    const vb = bitsOf(buildState(sc.violating), side);
    const cb = bitsOf(buildState(sc.correct), side);
    const ok = vb === want && cb === 0;
    if (ok) exact++;
    reports.push({ id: sc.id, invariant: sc.invariant, ok, violatingBits: describe(vb), correctBits: describe(cb) });
  }
  return { reports, exact };
}

function main(): void {
  const check = process.argv.includes('--check');
  const { reports, exact } = evaluateScenarios();
  for (const r of reports) {
    console.log(
      `${r.ok ? 'ok  ' : 'FAIL'} inv${String(r.invariant).padStart(2)} ${r.id.padEnd(28)} violating=[${r.violatingBits}] correct=[${r.correctBits}]`,
    );
  }
  console.log(`invariantFixturesExact ${exact}/${SCENARIOS.length}`);
  if (check) {
    process.exitCode = exact === SCENARIOS.length ? 0 : 1;
    return;
  }

  const positions: StoredPosition[] = [];
  const cases: unknown[] = [];
  for (const sc of SCENARIOS) {
    const violating = buildState(sc.violating);
    const correct = buildState(sc.correct);
    positions.push({
      schema: 'muju-position-v1',
      id: `${sc.id}-violating`,
      tags: ['invariants', `inv${sc.invariant}`],
      rationale: sc.rationale,
      rules: { ...DEFAULT_RULES },
      state: violating,
    });
    positions.push({
      schema: 'muju-position-v1',
      id: `${sc.id}-correct`,
      tags: ['invariants', `inv${sc.invariant}`],
      rationale: `${sc.rationale} (the turn that does not violate it)`,
      rules: { ...DEFAULT_RULES },
      state: correct,
    });
    cases.push({
      id: sc.id,
      invariant: sc.invariant,
      side: sc.side,
      position: `${POSITIONS_REF}#${sc.id}-violating`,
      violating: `${POSITIONS_REF}#${sc.id}-violating`,
      correct: `${POSITIONS_REF}#${sc.id}-correct`,
      best: [keyOf(correct)],
      avoid: [keyOf(violating)],
      budget: { work: 50000 },
      points: 1,
      tags: ['invariants', `inv${sc.invariant}`],
      rationale: sc.rationale,
    });
  }

  writePositions(POSITIONS_PATH, positions);
  const suite = {
    schema: 'muju-suite-v1',
    name: 'invariants',
    version: 1,
    notes:
      'DESIGN §5.13: one fixture per SU §7 invariant, each a pair of post-turn macro positions. ' +
      '`invariantBits(violating, side)` sets exactly that invariant\'s own bit and `invariantBits(correct, side)` sets none; ' +
      'invariants 15 and 18 are structural (no weight, no per-position test) and both members pin their bit to 0. ' +
      'Regenerate with `node --import tsx lab/hard-ai/suites/build-invariants.ts`; verify with `--check`.',
    cases,
  };
  fs.writeFileSync(SUITE_PATH, JSON.stringify(suite, null, 2) + '\n');
  console.log(`wrote ${SUITE_PATH} and ${POSITIONS_PATH}`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('build-invariants.ts')) main();
