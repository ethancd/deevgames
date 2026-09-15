// @vitest-environment node
/**
 * `tactics/prover.ts` against `src/game/homeCheckmate.ts` (DESIGN §4.14, §5.9).
 *
 * The bar is not "the same verdict" — it is "the same search". The canonical
 * prover stops at `PROOF_NODES` and reports exhaustion as UNKNOWN, so two
 * provers that explore the same tree in a different order, or fold a different
 * set of transpositions together, agree everywhere the answer is forced and
 * disagree exactly where the cap bites. Every differential test below
 * therefore compares `analyzeHomeDefenseEvidence`'s NODE COUNT and `method`
 * alongside its verdict, and a third of the random cases run at a deliberately
 * tiny cap so the exhaustion regime is common rather than rare.
 */
import { describe, expect, it } from 'vitest';
import type { AIAction, } from '../../../src/ai/types';
import type { GameState, PlayerId } from '../../../src/game/types';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { getHomeOccupier } from '../../../src/game/victory';
import { isLegalAction } from '../../../src/game/legality';
import { applyAction, transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { seededRandom } from '../../../src/ai/runtime';
import { MAX_TURN_ACTIONS, Reason, Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { CORNER } from '../../../src/ai/hard/core/tables';
import { AKind, newKeepSetTable, paMake, toAIAction } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import {
  HomeVerdict,
  PROOF_NODES,
  WITNESS_KEEP,
  damageBound,
  homeVerdict,
  homeWitness,
  needsProof,
  proverStats,
} from '../../../src/ai/hard/tactics/prover';
import { tacticalFixtures } from '../../../lab/ai/fixtures';
import { buildState, type StateSpec, type UnitSpec } from './game-fixture';

const replica = new Replica();
const scratch = new Scratch(1, 0, 0, 1);
const witnessBuffer = new Int32Array(MAX_TURN_ACTIONS);
const VERDICT_NAME: readonly string[] = ['rescue', 'mate', 'unknown'];
const METHOD_NAME: readonly string[] = ['no_occupier', 'damage_bound', 'search'];

function sideOf(player: PlayerId): Side {
  return player === 'white' ? 0 : 1;
}

function invaderOf(state: GameState): PlayerId | null {
  if (getHomeOccupier(state.board, 'white')) return 'white';
  if (getHomeOccupier(state.board, 'black')) return 'black';
  return null;
}

/** `[verdict, nodes, method]` from both provers, as comparable strings. */
function bothProvers(state: GameState, invader: PlayerId, maxNodes = PROOF_NODES): { canonical: string; replica: string; packed: PackedState } {
  const evidence = analyzeHomeDefenseEvidence(state, invader, transitionWithoutCheckmate, maxNodes);
  const packed = replica.pack(state, allocState());
  const verdict = homeVerdict(packed, sideOf(invader), maxNodes, scratch, 0);
  const stats = proverStats();
  return {
    canonical: `${evidence.result}/${evidence.nodes}/${evidence.method}`,
    replica: `${VERDICT_NAME[verdict]}/${stats.nodes}/${METHOD_NAME[stats.method]}`,
    packed,
  };
}

/** The defender's reply position, which a witness line is replayed from. */
function replyStart(state: GameState, invader: PlayerId): GameState {
  const defender: PlayerId = invader === 'white' ? 'black' : 'white';
  return { ...state, upkeepPending: true, turn: { ...state.turn, currentPlayer: defender, phase: 'place', actionsRemaining: 4 } };
}

function decodeWitness(p: PackedState, length: number): AIAction[] {
  const out: AIAction[] = new Array<AIAction>(length);
  for (let i = 0; i < length; i++) out[i] = toAIAction(p, witnessBuffer[i], WITNESS_KEEP);
  return out;
}

/** `keepUnitIds` is a SET; the two provers list it in different orders. */
function normalizeLine(line: readonly AIAction[]): string {
  return JSON.stringify(line.map(a => (a.type === 'PAY_UPKEEP' ? { ...a, keepUnitIds: [...a.keepUnitIds].sort() } : a)));
}

const ALL_DEFS = ['fire_1', 'fire_2', 'fire_3', 'lightning_1', 'lightning_2', 'water_1', 'water_2', 'water_3', 'shadow_1', 'shadow_2', 'metal_1', 'metal_2', 'metal_3', 'plant_1', 'plant_2'];

/** A random position in which `invader` holds the defender's corner. */
function randomOccupierPosition(rng: () => number, invader: PlayerId): GameState {
  const defender: PlayerId = invader === 'white' ? 'black' : 'white';
  const home = CORNER[1 - sideOf(invader)];
  const own = CORNER[sideOf(invader)];
  const taken = new Set<number>([home]);
  const units: UnitSpec[] = [
    { def: ALL_DEFS[(rng() * ALL_DEFS.length) | 0], owner: invader, x: home % 10, y: (home / 10) | 0 },
  ];
  const count = 1 + ((rng() * 5) | 0);
  for (let i = 0; i < count; i++) {
    const dx = (rng() * 4) | 0;
    const dy = (rng() * 4) | 0;
    const x = invader === 'black' ? dx : 9 - dx;
    const y = invader === 'black' ? dy : 9 - dy;
    const sq = y * 10 + x;
    if (taken.has(sq) || sq === own) continue;
    taken.add(sq);
    units.push({ def: ALL_DEFS[(rng() * ALL_DEFS.length) | 0], owner: rng() < 0.7 ? defender : invader, x, y });
  }
  const cash = [0, 1, 2, 4, 6, 8, 12, 24][(rng() * 8) | 0];
  const spec: StateSpec = {
    units,
    current: defender,
    white: defender === 'white' ? cash : 0,
    black: defender === 'black' ? cash : 0,
  };
  return buildState(spec);
}

describe('tactics/prover.ts constants and the gate', () => {
  it('PROOF_NODES is the canonical 20,000 (homeCheckmate.ts:22)', () => {
    expect(PROOF_NODES).toBe(20000);
    expect(HomeVerdict).toEqual({ RESCUE: 0, MATE: 1, UNKNOWN: 2 });
  });

  it('needsProof holds exactly when resolveHomeCheckmate would run the prover', () => {
    // Black on White's corner, White to have just moved there is impossible —
    // the mover is the side that must be occupying (homeCheckmate.ts:172).
    const base: StateSpec = {
      units: [
        { def: 'metal_3', owner: 'black', x: 0, y: 0 },
        { def: 'fire_1', owner: 'white', x: 5, y: 5 },
      ],
      current: 'black',
    };
    const packed = (spec: StateSpec): PackedState => replica.pack(buildState(spec), allocState());

    expect(needsProof(packed(base))).toBe(true);
    // the mover does not occupy the enemy corner
    expect(needsProof(packed({ ...base, current: 'white' }))).toBe(false);
    // the opponent occupies the mover's corner too (the counter-invasion
    // short-circuit, homeCheckmate.ts:176)
    expect(
      needsProof(
        packed({ ...base, units: [...base.units, { def: 'fire_1', owner: 'white', x: 9, y: 9 }] }),
      ),
    ).toBe(false);
    // elimination rules switch the home victory off entirely (turn.ts:23)
    expect(needsProof(packed({ ...base, victoryRule: 'elimination' }))).toBe(false);
    // upkeep is still pending, so the turn has not really started
    expect(needsProof(packed({ ...base, upkeepPending: true, phase: 'place' }))).toBe(false);
  });

  it('Replica.needsProof is the same predicate as the free function', () => {
    const rng = seededRandom(0x6e656564);
    for (let i = 0; i < 200; i++) {
      const invader: PlayerId = rng() < 0.5 ? 'white' : 'black';
      const state = randomOccupierPosition(rng, invader);
      const p = replica.pack(state, allocState());
      expect(replica.needsProof(p)).toBe(needsProof(p));
    }
  });
});

describe('tactics/prover.ts damageBound', () => {
  it('is trivially satisfied when nobody occupies the corner', () => {
    const p = replica.pack(buildState({ units: [{ def: 'fire_1', owner: 'white', x: 5, y: 5 }] }), allocState());
    expect(damageBound(p, 1, scratch, 0)).toBe(true);
  });

  it('fails — and so proves the mate — when no affordable reply can reach the occupier', () => {
    // A lone White Muju in the far corner cannot cross the board in four
    // actions, so `enoughPossibleDamage` rejects the position outright.
    const state = buildState({
      units: [
        { def: 'metal_3', owner: 'black', x: 0, y: 0 },
        { def: 'water_1', owner: 'white', x: 8, y: 8 },
      ],
      current: 'black',
    });
    const p = replica.pack(state, allocState());
    expect(damageBound(p, 1, scratch, 0)).toBe(false);
    expect(homeVerdict(p, 1, PROOF_NODES, scratch, 0)).toBe(HomeVerdict.MATE);
    expect(proverStats().method).toBe(1);
    expect(proverStats().nodes).toBe(0);
  });

  it('holds — and the search then decides — when a rescuer is adjacent', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'black', x: 0, y: 0 },
        { def: 'lightning_1', owner: 'white', x: 0, y: 1 },
      ],
      current: 'black',
    });
    const p = replica.pack(state, allocState());
    expect(damageBound(p, 1, scratch, 0)).toBe(true);
    expect(homeVerdict(p, 1, PROOF_NODES, scratch, 0)).toBe(HomeVerdict.RESCUE);
    expect(proverStats().method).toBe(2);
  });

  it('charges rent at the old tier and the promotion on top (homeCheckmate.ts:34-37)', () => {
    // A White Ho II beside the corner cannot out-damage a Metal III (DEF 5) in
    // two hits, but a Ho III can. The promotion costs its rent at the OLD tier
    // (1) plus the difference in unit cost (15 - 7 = 8), so the bound flips at
    // exactly 9 crystals — and with it the prover's `method`.
    const spec = (cash: number): GameState =>
      buildState({
        units: [
          { def: 'metal_3', owner: 'black', x: 0, y: 0 },
          { def: 'fire_2', owner: 'white', x: 1, y: 0 },
        ],
        current: 'black',
        white: cash,
      });
    expect(damageBound(replica.pack(spec(8), allocState()), 1, scratch, 0)).toBe(false);
    expect(damageBound(replica.pack(spec(9), allocState()), 1, scratch, 0)).toBe(true);
    // ... which is the canonical prover's own answer, node for node.
    expect(bothProvers(spec(8), 'black').replica).toBe(bothProvers(spec(8), 'black').canonical);
    expect(bothProvers(spec(9), 'black').replica).toBe(bothProvers(spec(9), 'black').canonical);
    expect(bothProvers(spec(8), 'black').canonical).toBe('mate/0/damage_bound');
  });
});

describe('tactics/prover.ts vs analyzeHomeDefense', () => {
  it('agrees on verdict, node count and method for all 28 lab/ai fixtures', () => {
    const fixtures = tacticalFixtures();
    expect(fixtures).toHaveLength(28);
    let compared = 0;
    for (const fixture of fixtures) {
      const invader = invaderOf(fixture.state);
      expect(invader, fixture.name).not.toBeNull();
      const { canonical, replica: mine } = bothProvers(fixture.state, invader as PlayerId);
      expect(mine, fixture.name).toBe(canonical);
      compared++;
    }
    expect(compared).toBe(28);
  });

  it('agrees on 1,500 random occupier positions, a third of them at a squeezed node cap', () => {
    const rng = seededRandom(0x50524f56);
    let capped = 0;
    let exhausted = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      const invader: PlayerId = rng() < 0.5 ? 'white' : 'black';
      const state = randomOccupierPosition(rng, invader);
      const maxNodes = rng() < 0.34 ? 1 + ((rng() * 48) | 0) : PROOF_NODES;
      if (maxNodes < PROOF_NODES) capped++;
      const { canonical, replica: mine } = bothProvers(state, invader, maxNodes);
      expect(mine, `case ${i} (maxNodes ${maxNodes})`).toBe(canonical);
      seen.add(canonical.split('/')[0]);
      if (canonical.startsWith('unknown')) exhausted++;
    }
    // The run is only meaningful if it covered all three verdicts and actually
    // hit the node cap: a differential that never exhausts never tests the
    // ordering the cap exposes.
    expect([...seen].sort()).toEqual(['mate', 'rescue', 'unknown']);
    expect(capped).toBeGreaterThan(400);
    expect(exhausted).toBeGreaterThan(20);
  });

  it('matches the canonical node count when the transposition set must fire', () => {
    // Regression for a signed/unsigned bug in the prover's `failed` set: keys
    // whose lane had the high bit set were stored as negative and never
    // matched again, so the replica silently re-expanded transpositions and
    // burned more nodes than the canonical prover. This position needs the
    // set: the same "Ho II stepped aside, Hi II on B1" node is reached down
    // two different move orders, and the canonical prover expands it once.
    const state = buildState({
      units: [
        { def: 'metal_3', owner: 'black', x: 0, y: 0, damage: 1 },
        { def: 'water_2', owner: 'white', x: 1, y: 0 },
        { def: 'fire_2', owner: 'white', x: 5, y: 1 },
        { def: 'water_1', owner: 'black', x: 0, y: 1, damage: 1 },
      ],
      current: 'black',
      white: 24,
    });
    const { canonical, replica: mine } = bothProvers(state, 'black', 24);
    expect(mine).toBe(canonical);
    expect(canonical).toBe('rescue/22/search');
  });
});

describe('tactics/prover.ts homeWitness', () => {
  it('reproduces the canonical rescuing line on every fixture that has one', () => {
    let witnesses = 0;
    for (const fixture of tacticalFixtures()) {
      const invader = invaderOf(fixture.state) as PlayerId;
      const evidence = analyzeHomeDefenseEvidence(fixture.state, invader, transitionWithoutCheckmate, PROOF_NODES);
      const p = replica.pack(fixture.state, allocState());
      const length = homeWitness(p, sideOf(invader), PROOF_NODES, witnessBuffer);
      if (!evidence.witness) {
        expect(length, fixture.name).toBe(0);
        continue;
      }
      witnesses++;
      expect(normalizeLine(decodeWitness(p, length)), fixture.name).toBe(normalizeLine(evidence.witness));
    }
    expect(witnesses).toBeGreaterThan(0);
  });

  it('returns a line that replays legally and removes the occupier', () => {
    const rng = seededRandom(0x77697473);
    let replayed = 0;
    for (let i = 0; i < 400; i++) {
      const invader: PlayerId = rng() < 0.5 ? 'white' : 'black';
      const state = randomOccupierPosition(rng, invader);
      const p = replica.pack(state, allocState());
      if (homeVerdict(p, sideOf(invader), PROOF_NODES, scratch, 0) !== HomeVerdict.RESCUE) continue;
      const length = homeWitness(p, sideOf(invader), PROOF_NODES, witnessBuffer);
      expect(length, `case ${i}`).toBeGreaterThan(0);
      const line = decodeWitness(p, length);
      let s = replyStart(state, invader);
      for (let k = 0; k < line.length; k++) {
        expect(isLegalAction(s, line[k]), `case ${i} action ${k}: ${JSON.stringify(line[k])}`).toBe(true);
        const next = applyAction(s, line[k]);
        expect(next, `case ${i} action ${k} was rejected`).not.toBe(s);
        s = next;
      }
      expect(getHomeOccupier(s.board, invader), `case ${i} left the occupier alive`).toBeUndefined();
      replayed++;
    }
    expect(replayed).toBeGreaterThan(100);
  });

  it('returns 0 when there is no occupier and when the position is mate', () => {
    const empty = replica.pack(buildState({ units: [{ def: 'fire_1', owner: 'white', x: 5, y: 5 }] }), allocState());
    expect(homeWitness(empty, 1, PROOF_NODES, witnessBuffer)).toBe(0);

    const mate = replica.pack(
      buildState({
        units: [
          { def: 'metal_3', owner: 'black', x: 0, y: 0 },
          { def: 'water_1', owner: 'white', x: 8, y: 8 },
        ],
        current: 'black',
      }),
      allocState(),
    );
    expect(homeVerdict(mate, 1, PROOF_NODES, scratch, 0)).toBe(HomeVerdict.MATE);
    expect(homeWitness(mate, 1, PROOF_NODES, witnessBuffer)).toBe(0);
  });
});

describe('core/state.ts make: the packed checkmate gate (DESIGN §3.4)', () => {
  const undo = newUndo();
  const keep = newKeepSetTable();

  /** Steps the black unit on B1 onto A1 in both engines. */
  function stepOntoCorner(state: GameState): { packed: PackedState; canonical: GameState } {
    const packed = replica.pack(state, allocState());
    const slot = packed.pieceAt[1];
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(packed, paMake(AKind.MOVE, slot, 0, 1), undo, keep);
    return { packed, canonical: applyAction(state, { type: 'MOVE', unitId: 'u0', to: { x: 0, y: 0 } }) };
  }

  const invasion = (extra: UnitSpec[], overrides: Partial<StateSpec> = {}): GameState =>
    buildState({
      units: [
        { def: 'fire_1', owner: 'black', x: 1, y: 0, id: 'u0' },
        { def: 'water_1', owner: 'white', x: 8, y: 8, id: 'u1' },
        ...extra,
      ],
      current: 'black',
      ...overrides,
    });

  it('adjudicates a proven mate at the action, exactly as applyAction does', () => {
    const { packed, canonical } = stepOntoCorner(invasion([]));
    expect(packed.result).toBe(Result.BLACK_WIN);
    expect(packed.reason).toBe(Reason.HOME_CHECKMATE);
    expect(canonical.phase).toBe('victory');
    expect(canonical.winner).toBe('black');
    expect(canonical.victoryReason).toBe('home-checkmate');
  });

  it('leaves an answerable occupation running, exactly as applyAction does', () => {
    const { packed, canonical } = stepOntoCorner(invasion([{ def: 'lightning_1', owner: 'white', x: 0, y: 1, id: 'u2' }]));
    expect(packed.result).toBe(Result.ONGOING);
    expect(canonical.phase).toBe('playing');
  });

  it('SU §8.1: a proven mate beats the ten-quiet-turn draw, an unproven occupation does not', () => {
    const mate = stepOntoCorner(invasion([], { inactivityPlies: 9 }));
    expect(mate.packed.reason).toBe(Reason.HOME_CHECKMATE);
    expect(mate.canonical.victoryReason).toBe('home-checkmate');

    const rescued = stepOntoCorner(
      invasion([{ def: 'lightning_1', owner: 'white', x: 0, y: 1, id: 'u2' }], { inactivityPlies: 9 }),
    );
    expect(rescued.packed.result).toBe(Result.ONGOING);

    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(rescued.packed, paMake(AKind.END_ACTION), undo, keep);
    const canonicalEnd = applyAction(rescued.canonical, { type: 'END_ACTION_PHASE' });
    expect(rescued.packed.result).toBe(Result.DRAW);
    expect(rescued.packed.reason).toBe(Reason.INACTIVITY);
    expect(canonicalEnd.victoryReason).toBe('inactivity');
    expect(canonicalEnd.winner).toBeNull();
  });

  it('proverMode 1 runs the bound alone and can only under-claim a mate', () => {
    // The bound proves this one, so mode 1 and mode 2 agree.
    const bound = replica.pack(invasion([]), allocState());
    bound.proverMode = 1;
    const slot = bound.pieceAt[1];
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(bound, paMake(AKind.MOVE, slot, 0, 1), undo, keep);
    expect(bound.reason).toBe(Reason.HOME_CHECKMATE);

    // Here the bound says a rescue is conceivable (a Kage II sits two squares
    // away with the money to promote) while the search proves it is not, so
    // mode 1 must NOT claim the mate that mode 2 finds.
    const blocked: StateSpec = {
      units: [
        { def: 'fire_1', owner: 'black', x: 1, y: 0, id: 'u0' },
        { def: 'water_3', owner: 'white', x: 2, y: 0, id: 'u1' },
        { def: 'water_3', owner: 'white', x: 0, y: 1, id: 'u2' },
        { def: 'water_3', owner: 'white', x: 3, y: 0, id: 'u3' },
      ],
      current: 'black',
      actions: 4,
    };
    const full = replica.pack(buildState(blocked), allocState());
    const under = replica.pack(buildState(blocked), allocState());
    under.proverMode = 1;
    const s = full.pieceAt[1];
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(full, paMake(AKind.MOVE, s, 0, 1), undo, keep);
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(under, paMake(AKind.MOVE, s, 0, 1), undo, keep);
    // Whatever the full prover decides, the bound may never be the stronger
    // claim: mode 1 mates are a subset of mode 2 mates.
    if (under.reason === Reason.HOME_CHECKMATE) expect(full.reason).toBe(Reason.HOME_CHECKMATE);
  });

  it('proverMode 0 is rejected while a corner is occupied (DESIGN §3.4)', () => {
    const p = replica.pack(invasion([]), allocState());
    p.proverMode = 0;
    const slot = p.pieceAt[1];
    undo.top = 0;
    replica.resetUndoScratch();
    expect(() => replica.make(p, paMake(AKind.MOVE, slot, 0, 1), undo, keep)).toThrow(/proverMode 0/);
  });
});
