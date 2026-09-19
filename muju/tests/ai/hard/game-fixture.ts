/**
 * Canonical `GameState` builders for the replica tests. Everything here
 * produces REAL `GameState`s that `src/game` accepts, so a test can compare
 * the replica against the canonical engine on the same position rather than
 * against a hand-written expectation.
 *
 * Every state is `ruleset: 'phasing'` by default, because the replica is
 * Phasing-only as of M2 and `pack` refuses anything else. `ruleset: 'standard'`
 * is still buildable, for the tests that pin that refusal.
 */
import type { BoardState, Cell, GameState, PendingSummon, PlayerId, Position, Ruleset, Unit } from '../../../src/game/types';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../../../src/game/units';

export interface UnitSpec {
  def: string;
  owner: PlayerId;
  x: number;
  y: number;
  damage?: number;
  atkCount?: number;
  canAct?: boolean;
  lastAttackKilled?: boolean;
  placedThisTurn?: boolean;
  promotedThisPlacement?: boolean;
  id?: string;
}

/** A public Phasing commitment. `cost` defaults to the catalogue cost, which is
 * the only value `pack` accepts (DESIGN M2 item A). */
export interface SummonSpec {
  def: string;
  owner: PlayerId;
  x: number;
  y: number;
  cost?: number;
  id?: string;
}

export interface StateSpec {
  units: UnitSpec[];
  /** Defaults to `'phasing'`; only the pack-refusal tests pass anything else. */
  ruleset?: Ruleset;
  pendingSummons?: SummonSpec[];
  white?: number;
  black?: number;
  whiteGained?: number;
  blackGained?: number;
  current?: PlayerId;
  phase?: 'place' | 'action';
  actions?: number;
  turnNumber?: number;
  upkeepPending?: boolean;
  inactivityPlies?: number;
  progressThisTurn?: boolean;
  victoryRule?: 'elimination' | 'home-or-elimination';
  inactivityRule?: 'on' | 'off';
  reviewUpkeep?: Partial<Record<PlayerId, boolean>>;
  handicap?: number;
  /** Reserve layout override, 100 entries; defaults to the shipped map. */
  reserves?: readonly number[];
}

export function buildCells(reserves: readonly number[] = UNEQUAL_ROUTES_MAP): Cell[][] {
  const cells: Cell[][] = new Array<Cell[]>(10);
  for (let y = 0; y < 10; y++) {
    const row: Cell[] = new Array<Cell>(10);
    for (let x = 0; x < 10; x++) row[x] = { position: { x, y }, resourceLayers: reserves[y * 10 + x] };
    cells[y] = row;
  }
  return cells;
}

export function buildUnit(spec: UnitSpec, index: number): Unit {
  const count = spec.atkCount ?? 0;
  const attacked: string[] = [];
  for (let k = 0; k < count; k++) attacked.push(`gone-${index}-${k}`);
  return {
    id: spec.id ?? `u${index}`,
    definitionId: spec.def,
    owner: spec.owner,
    position: { x: spec.x, y: spec.y },
    hasMoved: false,
    hasAttacked: count > 0,
    attackedThisTurn: attacked,
    lastAttackKilled: spec.lastAttackKilled ?? false,
    canActThisTurn: spec.canAct ?? true,
    damageTaken: spec.damage ?? 0,
    placedThisTurn: spec.placedThisTurn ?? false,
    promotedThisPlacement: spec.promotedThisPlacement ?? false,
  };
}

export function buildSummon(spec: SummonSpec, index: number): PendingSummon {
  return {
    id: spec.id ?? `pend${index}`,
    owner: spec.owner,
    definitionId: spec.def,
    position: { x: spec.x, y: spec.y },
    cost: spec.cost ?? getUnitDefinition(spec.def).cost,
  };
}

export function buildState(spec: StateSpec): GameState {
  const reserves = spec.reserves ?? UNEQUAL_ROUTES_MAP;
  const board: BoardState = {
    cells: buildCells(reserves),
    units: spec.units.map(buildUnit),
    initialResourceLayers: [...reserves],
  };
  return {
    actionsPerTurn: 4,
    ruleset: spec.ruleset ?? 'phasing',
    pendingSummons: (spec.pendingSummons ?? []).map((s, i) => buildSummon(s, i)),
    blackCrystalHandicap: spec.handicap ?? 0,
    victoryRule: spec.victoryRule ?? 'home-or-elimination',
    inactivityRule: spec.inactivityRule ?? 'on',
    upkeepPending: spec.upkeepPending ?? false,
    reviewUpkeep: spec.reviewUpkeep ?? { white: false, black: false },
    inactivityPlies: spec.inactivityPlies ?? 0,
    progressThisTurn: spec.progressThisTurn ?? false,
    phase: 'playing',
    board,
    players: {
      // `resourcesGained` defaults to 0 so the reserve-conservation invariant
      // (`Σ reserve + gained === Σ initialReserve`) holds for the untouched map.
      white: { id: 'white', resources: spec.white ?? 0, startCorner: { x: 0, y: 0 }, resourcesGained: spec.whiteGained ?? 0, resourcesUpkeep: 0 },
      black: { id: 'black', resources: spec.black ?? 0, startCorner: { x: 9, y: 9 }, resourcesGained: spec.blackGained ?? 0, resourcesUpkeep: 0 },
    },
    turn: {
      currentPlayer: spec.current ?? 'white',
      phase: spec.phase ?? 'action',
      actionsRemaining: spec.actions ?? 4,
      turnNumber: spec.turnNumber ?? 1,
    },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

const ALL_DEFS: readonly string[] = UNIT_DEFINITIONS.map(d => d.id);

/**
 * A random board with `count` units on distinct squares. Reserves come from
 * the shipped map so `pack` never has to invent a capacity, and the returned
 * state is always structurally valid (it is not necessarily reachable by
 * legal play — that is the point: the replica must agree with the canonical
 * engine on every well-formed position, not only on reachable ones).
 */
export function randomState(rng: () => number, count: number, spec: Partial<StateSpec> = {}): GameState {
  const taken = new Set<number>();
  const units: UnitSpec[] = [];
  for (let i = 0; i < count; i++) {
    let s = Math.floor(rng() * 100);
    let guard = 0;
    while (taken.has(s) && guard++ < 200) s = Math.floor(rng() * 100);
    if (taken.has(s)) break;
    taken.add(s);
    units.push({
      def: ALL_DEFS[Math.floor(rng() * ALL_DEFS.length)],
      owner: rng() < 0.5 ? 'white' : 'black',
      x: s % 10,
      y: Math.floor(s / 10),
      canAct: rng() < 0.85,
    });
  }
  return buildState({ units, ...spec });
}

export function positionsOf(list: readonly Position[]): number[] {
  return list.map(p => p.y * 10 + p.x).sort((a, b) => a - b);
}

/**
 * A Phasing position over the same BOARD as `state`, with the commitments given.
 *
 * This is not a ruleset conversion — `pack` refuses those on purpose, and no
 * saved match is ever reinterpreted (`docs/PHASING-2026-09-16.md`). It is how
 * the ruleset-agnostic corpus (a board, a bank, a phase and a side) is reused to
 * build Phasing positions: boards, units, reserves, banks and the 4-action
 * budget are identical between the rulesets, and the canonical engine is asked
 * for its own verdict on the resulting state, never on the original.
 */
export function asPhasing(state: GameState, pendingSummons: PendingSummon[] = []): GameState {
  return { ...state, ruleset: 'phasing', pendingSummons };
}
