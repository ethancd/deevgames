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
 *
 * PHASING (M2 round 4). This file left the `vitest.config.ts` quarantine when the
 * packed prover was ported to Phasing's ACT-ONLY home defence, and its
 * expectations were rewritten FROM THE CANONICAL PHASING ENGINE rather than
 * relaxed. What moved, and why:
 *
 *   - the damage bound no longer consults the defender's bank at all
 *     (`enoughPossibleDamage(ready, target, !isPhasing(state))`,
 *     homeCheckmate.ts:78), so the old "the bound flips at exactly 9 crystals"
 *     case now measures the opposite property: it flips at NO cash level;
 *   - the witness is the ACT LINE alone — no `PAY_UPKEEP`, no promotion prefix,
 *     no `END_PLACE` — so it replays from canonical `ready` (defender to move,
 *     ACTION phase, four actions, army healed and reset) and not from the
 *     defender's upkeep;
 *   - `resolveHomeCheckmate` adjudicates only in Prepare under Phasing
 *     (homeCheckmate.ts:179), so the `make` gate tests step onto the corner and
 *     then play `END_ACTION`, which is where the verdict lands;
 *   - the 28 `lab/ai/fixtures.ts` boards are ruleset-agnostic and `pack` is
 *     Phasing-only, so they are read through `asPhasing`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AIAction, } from '../../../src/ai/types';
import type { GameState, PlayerId } from '../../../src/game/types';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { getHomeOccupier } from '../../../src/game/victory';
import { isLegalAction } from '../../../src/game/legality';
import { applyAction, transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { seededRandom } from '../../../src/ai/runtime';
import { resetUnitActions } from '../../../src/game/board';
import { MAX_TURN_ACTIONS, Reason, Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { CORNER } from '../../../src/ai/hard/core/tables';
import { AKind, newKeepSetTable, paMake, toAIAction } from '../../../src/ai/hard/core/action';
import { INACTIVITY_LIMIT, Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import {
  HomeVerdict,
  PROOF_NODES,
  damageBound,
  homeVerdict,
  homeWitness,
  needsProof,
  proverStats,
} from '../../../src/ai/hard/tactics/prover';
import { tacticalFixtures } from '../../../lab/ai/fixtures';
import { asPhasing, buildState, type StateSpec, type UnitSpec } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const scratch = new Scratch(1, 0, 0, 1);
const witnessBuffer = new Int32Array(MAX_TURN_ACTIONS);
/** The Phasing witness is MOVEs and ATTACKs only, so nothing indexes this. */
const witnessKeep = newKeepSetTable();
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

/**
 * Canonical `ready` (homeCheckmate.ts:74-75) — the position Phasing's
 * `act(ready, [])` searches, and therefore the one a witness line replays from:
 * the defender to move in its ACTION phase with four actions, its army healed and
 * reset, no upkeep pending. Standard's witness began at the defender's upkeep.
 */
function replyStart(state: GameState, invader: PlayerId): GameState {
  const defender: PlayerId = invader === 'white' ? 'black' : 'white';
  return {
    ...state,
    board: resetUnitActions(state.board, defender),
    upkeepPending: false,
    turn: { ...state.turn, currentPlayer: defender, phase: 'action', actionsRemaining: 4 },
  };
}

function decodeWitness(p: PackedState, length: number): AIAction[] {
  const out: AIAction[] = new Array<AIAction>(length);
  for (let i = 0; i < length; i++) out[i] = toAIAction(p, witnessBuffer[i], witnessKeep);
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

  it('charges NO rent and admits NO promotion: the bound ignores the bank (homeCheckmate.ts:78)', () => {
    // This case used to read "the bound flips at exactly 9 crystals", because
    // Standard's `enoughPossibleDamage(_, _, true)` charged rent at the old tier
    // (1) plus the promotion's cost difference (15 - 7 = 8) and let the defender
    // fight as a promoted body. Phasing passes `preparing: false`: a White Ho II
    // beside the corner cannot out-damage a Metal III (DEF 5) in two hits, and no
    // bank lets it try as a Ho III, so the bound FAILS at every cash level and the
    // mate is proved at `method: damage_bound` with zero nodes.
    const spec = (cash: number): GameState =>
      buildState({
        units: [
          { def: 'metal_3', owner: 'black', x: 0, y: 0 },
          { def: 'fire_2', owner: 'white', x: 1, y: 0 },
        ],
        current: 'black',
        white: cash,
      });
    for (const cash of [0, 8, 9, 30]) {
      expect(damageBound(replica.pack(spec(cash), allocState()), 1, scratch, 0), `cash ${cash}`).toBe(false);
      // ... which is the canonical prover's own answer, node for node.
      const both = bothProvers(spec(cash), 'black');
      expect(both.replica, `cash ${cash}`).toBe(both.canonical);
      expect(both.canonical, `cash ${cash}`).toBe('mate/0/damage_bound');
    }
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
      const { canonical, replica: mine } = bothProvers(asPhasing(fixture.state), invader as PlayerId);
      expect(mine, fixture.name).toBe(canonical);
      compared++;
    }
    expect(compared).toBe(28);
  });

  it('agrees on 1,500 random occupier positions, a third of them at a squeezed node cap', () => {
    const rng = seededRandom(0x50524f56);
    let capped = 0;
    let exhausted = 0;
    let maxNodes = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      const invader: PlayerId = rng() < 0.5 ? 'white' : 'black';
      const state = randomOccupierPosition(rng, invader);
      // RE-TUNED FOR PHASING, not relaxed. Standard's prover spent a node per
      // `prepare` entry as well as per `act` node, so a tree could run to
      // thousands of nodes and a cap drawn from 1..48 bit constantly. Phasing is
      // act-only: the deepest tree over these 1,500 positions is 22 nodes, so the
      // same 1..48 cap almost never bites (10 exhaustions instead of the 60+ it
      // used to produce) and the exhaustion regime — which is the ONLY regime
      // where search ORDER can change the answer — would go untested. A 1..12 cap
      // restores it: 38 exhaustions, and the assertion below keeps its old
      // threshold rather than being lowered to fit.
      const cap = rng() < 0.34 ? 1 + ((rng() * 12) | 0) : PROOF_NODES;
      if (cap < PROOF_NODES) capped++;
      const { canonical, replica: mine } = bothProvers(state, invader, cap);
      expect(mine, `case ${i} (maxNodes ${cap})`).toBe(canonical);
      seen.add(canonical.split('/')[0]);
      const nodes = Number(canonical.split('/')[1]);
      if (nodes > maxNodes) maxNodes = nodes;
      if (canonical.startsWith('unknown')) exhausted++;
    }
    // The run is only meaningful if it covered all three verdicts and actually
    // hit the node cap: a differential that never exhausts never tests the
    // ordering the cap exposes.
    expect([...seen].sort()).toEqual(['mate', 'rescue', 'unknown']);
    expect(capped).toBeGreaterThan(400);
    expect(exhausted).toBeGreaterThan(20);
    // ...and it compared trees with real interior structure, not only one-node
    // bounds. This is the node-for-node claim's own coverage check, and it is what
    // makes the transposition-set comparison below more than a spot check.
    expect(maxNodes).toBeGreaterThan(15);
  });

  it('matches the canonical node count when the transposition set must fire', () => {
    // Regression for a signed/unsigned bug in the prover's `failed` set: keys
    // whose lane had the high bit set were stored as negative and never
    // matched again, so the replica silently re-expanded transpositions and
    // burned more nodes than the canonical prover. This position needs the set:
    // the same node is reached down two different move orders, and the canonical
    // prover expands it once.
    //
    // RE-PINNED FROM CANONICAL. Under Standard this position was
    // `rescue/22/search`, and the rescue was one of `prepare`'s promotions — White
    // holds 24 crystals. Phasing's act-only search on the same board is
    // `mate/9/search`, at every node budget from 24 upward, because no promotion is
    // available and the present army cannot clear a damaged Metal III. The node
    // count is what the test is for, and 9 is the canonical engine's.
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
    expect(canonical).toBe('mate/9/search');
    // The whole tree fits inside the budget, so the count is the search's own and
    // not a cutoff: a re-expanded transposition would raise it above 9.
    expect(bothProvers(state, 'black', PROOF_NODES).canonical).toBe('mate/9/search');
  });
});

describe('tactics/prover.ts homeWitness', () => {
  it('reproduces the canonical rescuing line on every fixture that has one', () => {
    let witnesses = 0;
    for (const fixture of tacticalFixtures()) {
      const state = asPhasing(fixture.state);
      const invader = invaderOf(state) as PlayerId;
      const evidence = analyzeHomeDefenseEvidence(state, invader, transitionWithoutCheckmate, PROOF_NODES);
      const p = replica.pack(state, allocState());
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

  /**
   * ...and then ends the invader's action phase, which is where PHASING
   * adjudicates. `resolveHomeCheckmate` returns the state untouched outside
   * Prepare (`homeCheckmate.ts:179`: "an invading piece must survive its own
   * end-of-action upkeep before Phasing can award immediate home-checkmate"), and
   * `Replica.provesHomeCheckmate` mirrors that gate. Standard decided at the MOVE,
   * which is what these cases used to assert.
   */
  function stepThenEndAction(state: GameState): { packed: PackedState; canonical: GameState; atMove: GameState } {
    const stepped = stepOntoCorner(state);
    // Neither engine has decided anything yet: that is the gate, not an accident.
    expect(stepped.packed.result).toBe(Result.ONGOING);
    expect(stepped.canonical.phase).toBe('playing');
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(stepped.packed, paMake(AKind.END_ACTION), undo, keep);
    return {
      packed: stepped.packed,
      canonical: applyAction(stepped.canonical, { type: 'END_ACTION_PHASE' }),
      atMove: stepped.canonical,
    };
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

  it('the MOVE onto the corner adjudicates NOTHING: Phasing decides in Prepare', () => {
    // The Phasing phase gate, stated on its own. `needsProof` is false in the
    // action phase however unanswerable the occupation is.
    const { packed, canonical } = stepOntoCorner(invasion([]));
    expect(packed.result).toBe(Result.ONGOING);
    expect(packed.reason).toBe(Reason.NONE);
    expect(replica.needsProof(packed)).toBe(false);
    expect(canonical.phase).toBe('playing');
  });

  it('adjudicates a proven mate at END_ACTION, exactly as applyAction does', () => {
    const { packed, canonical } = stepThenEndAction(invasion([]));
    expect(packed.result).toBe(Result.BLACK_WIN);
    expect(packed.reason).toBe(Reason.HOME_CHECKMATE);
    expect(canonical.phase).toBe('victory');
    expect(canonical.winner).toBe('black');
    expect(canonical.victoryReason).toBe('home-checkmate');
  });

  it('leaves an answerable occupation running, exactly as applyAction does', () => {
    const { packed, canonical } = stepThenEndAction(invasion([{ def: 'lightning_1', owner: 'white', x: 0, y: 1, id: 'u2' }]));
    expect(packed.result).toBe(Result.ONGOING);
    expect(canonical.phase).toBe('playing');
  });

  it('SU §8.1: a proven mate beats the inactivity draw, an unproven occupation does not', () => {
    // Under Phasing the mate lands at the invader's own END_ACTION, which is
    // strictly before the hand-off where the LAST quiet ply would draw — so the
    // ordering SU §8.1 asserts still holds, one action later than it used to.
    // The clock is set one ply short of the LIMIT rather than to a literal 9, so
    // the case still straddles the boundary after A4 moved it to twenty.
    const mate = stepThenEndAction(invasion([], { inactivityPlies: INACTIVITY_LIMIT - 1 }));
    expect(mate.packed.reason).toBe(Reason.HOME_CHECKMATE);
    expect(mate.canonical.victoryReason).toBe('home-checkmate');

    const rescued = stepThenEndAction(
      invasion([{ def: 'lightning_1', owner: 'white', x: 0, y: 1, id: 'u2' }], { inactivityPlies: INACTIVITY_LIMIT - 1 }),
    );
    expect(rescued.packed.result).toBe(Result.ONGOING);

    // The hand-off is END_PLACE now that END_ACTION has already been played.
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(rescued.packed, paMake(AKind.END_PLACE), undo, keep);
    const canonicalEnd = applyAction(rescued.canonical, { type: 'END_PLACE_PHASE' });
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
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(bound, paMake(AKind.END_ACTION), undo, keep);
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
    for (const p of [full, under]) {
      for (const pa of [paMake(AKind.MOVE, s, 0, 1), paMake(AKind.END_ACTION)]) {
        undo.top = 0;
        replica.resetUndoScratch();
        replica.make(p, pa, undo, keep);
      }
    }
    // Whatever the full prover decides, the bound may never be the stronger
    // claim: mode 1 mates are a subset of mode 2 mates. Under Phasing the two
    // modes run the SAME bound (`preparing` is gone), so mode 1 mates are exactly
    // the `method: damage_bound` mates of mode 2.
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
