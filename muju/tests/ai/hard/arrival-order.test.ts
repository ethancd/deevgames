/**
 * Canonical unit ORDER survives an incremental arrival (M2-STATUS §2.6).
 *
 * Canonical `board.units` is a BIRTH SEQUENCE: `resolveSummons` appends the
 * arrivals in `pendingSummons` order (`summoning.ts:24`) and every removal is a
 * `filter`, so survivors keep their relative order. The packed replica allocates
 * the LOWEST DEAD SLOT to an arrival, so the slot index stops agreeing with that
 * sequence the moment a slot is reused — and `analyzeHomeDefense` reads the
 * sequence through three stable, non-total sorts (`homeCheckmate.ts:104,114,126`)
 * under a node cap, which makes it RESULT-bearing and not merely cosmetic.
 *
 * Round 4 took board order from the slot index. These are the two minimal legal
 * reproductions an independent runtime review (Codex) supplied for that defect,
 * as tests: nine legal actions each, applied action by action to BOTH engines,
 * then verdict AND node count compared at a tight cap and at the production cap.
 *
 * The two are not redundant. The first needs only two commitments arriving in a
 * different order than ascending square; the second needs only ONE commitment,
 * and gets its permutation from a `PAY_UPKEEP` release opening a dead slot BELOW
 * an existing unit — so preserving pending order alone would not fix it.
 *
 * Each also carries a FRESH-PACK control. A fresh pack always agreed with
 * canonical (that is why the prover fuzz surface, which packs every case fresh,
 * never saw this), so a test that only compares the fresh pack proves nothing:
 * the incremental state is the subject.
 */
import { describe, expect, it } from 'vitest';
import { Replica, newUndo, orderKey, DEAD, MAX_SLOTS } from '../../../src/ai/hard/core/state';
import { fromAIAction, newKeepSetTable } from '../../../src/ai/hard/core/action';
import { PROOF_NODES, homeVerdict, proverStats } from '../../../src/ai/hard/tactics/prover';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { applyAction, transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { AIAction } from '../../../src/ai/types';
import type { GameState } from '../../../src/game/types';
import type { PackedState } from '../../../src/ai/hard/types';
import { buildState, type StateSpec } from './game-fixture';

const VERDICT_NAME = ['rescue', 'mate', 'unknown'] as const;

/** Square of a unit id in the canonical array, and its position in that array. */
function canonicalOrder(state: GameState): string {
  return state.board.units.map(u => u.position.x + 10 * u.position.y).join(',');
}

interface Walked {
  state: GameState;
  p: PackedState;
  replica: Replica;
}

/** Applies every action to BOTH engines, asserting legality in both. */
function walk(spec: StateSpec, actions: readonly AIAction[]): Walked {
  const replica = new Replica();
  const keep = newKeepSetTable();
  const undo = newUndo();
  let state = buildState(spec);
  const p = replica.pack(state);
  for (const action of actions) {
    expect(isLegalAction(state, action), `canonical rejected ${JSON.stringify(action)}`).toBe(true);
    if (p.upkeepPending === 1) replica.genKeepSets(p, keep);
    const pa = fromAIAction(p, action, keep);
    expect(replica.isLegal(p, pa, keep), `replica rejected ${JSON.stringify(action)}`).toBe(true);
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(p, pa, undo, keep);
    state = applyAction(state, action);
  }
  return { state, p, replica };
}

/**
 * The shared assertions. `caps` always includes 3 — where the round-4 defect
 * split canonical UNKNOWN from packed RESCUE — and `PROOF_NODES`, the cap
 * adjudication actually uses (`homeCheckmate.ts:23`, `analyzeHomeDefense`'s
 * default, mirrored by `tactics/prover.ts PROOF_NODES`).
 */
function expectOrderExact(walked: Walked, caps: readonly number[]): void {
  const { state, p, replica } = walked;
  const sc = new Scratch(1, 0, 0, 1);

  // 1. ORDER. `unpack` must emit the canonical array, in the canonical order.
  expect(canonicalOrder(replica.unpack(p))).toBe(canonicalOrder(state));
  const fresh = replica.pack(state);
  expect(orderKey(p)).toBe(orderKey(fresh));

  // 2. The keys are the same for both, which is the reason order may NOT be
  //    hashed into them and must be carried as state instead: hashing it would
  //    make two genuinely transposing positions distinct.
  expect([p.kposLo, p.kposHi, p.kturnLo, p.kturnHi]).toEqual([fresh.kposLo, fresh.kposHi, fresh.kturnLo, fresh.kturnHi]);

  // 3. VERDICT AND NODE COUNT, incrementally reached and freshly packed.
  for (const cap of caps) {
    const canonical = analyzeHomeDefenseEvidence(state, 'white', transitionWithoutCheckmate, cap);
    const incremental = homeVerdict(p, 0, cap, sc, 0);
    const incrementalNodes = proverStats().nodes;
    const repacked = homeVerdict(fresh, 0, cap, sc, 0);
    const repackedNodes = proverStats().nodes;
    expect({ cap, verdict: VERDICT_NAME[incremental], nodes: incrementalNodes }).toEqual({
      cap,
      verdict: canonical.result,
      nodes: canonical.nodes,
    });
    expect({ cap, verdict: VERDICT_NAME[repacked], nodes: repackedNodes }).toEqual({
      cap,
      verdict: canonical.result,
      nodes: canonical.nodes,
    });
  }
}

/** Slot of the living unit on `square`, or -1. */
function slotOn(p: PackedState, square: number): number {
  for (let slot = 0; slot < MAX_SLOTS; slot++) if (p.sq[slot] !== DEAD && p.sq[slot] === square) return slot;
  return -1;
}

const CAPS = [1, 2, 3, 4, 5, PROOF_NODES] as const;

describe('canonical unit order through an incremental arrival', () => {
  // White PlantIII next to its target corner, Black's anchor up the file; Black
  // commits Fire at 89 THEN Lightning at 79, so buy order is the reverse of
  // ascending square order. Hand the turn back twice, then invade 98 -> 99 and
  // END_ACTION, which opens the gate in Prepare.
  const arrivalSpec: StateSpec = {
    units: [
      { id: 'invader', def: 'plant_3', owner: 'white', x: 8, y: 9 },
      { id: 'anchor', def: 'plant_1', owner: 'black', x: 9, y: 6 },
    ],
    phase: 'place',
    current: 'black',
    white: 50,
    black: 50,
    reviewUpkeep: { white: false, black: false },
  };
  const arrivalActions: AIAction[] = [
    { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 9, y: 8 } },
    { type: 'BUY_UNIT', definitionId: 'lightning_1', position: { x: 9, y: 7 } },
    { type: 'END_PLACE_PHASE' },
    { type: 'END_ACTION_PHASE' },
    { type: 'END_PLACE_PHASE' },
    { type: 'END_ACTION_PHASE' },
    { type: 'END_PLACE_PHASE' },
    { type: 'MOVE', unitId: 'invader', to: { x: 9, y: 9 } },
    { type: 'END_ACTION_PHASE' },
  ];

  // One commitment only. `PAY_UPKEEP` releases the WaterII in slot 2, so the
  // LightningI arrival reuses slot 2 — ahead of the FireI that was always in
  // slot 3 — while canonical appends it at the tail.
  const deadSlotSpec: StateSpec = {
    units: [
      { id: 'invader', def: 'plant_3', owner: 'white', x: 8, y: 9 },
      { id: 'anchor', def: 'plant_1', owner: 'black', x: 9, y: 6 },
      { id: 'released', def: 'water_2', owner: 'black', x: 5, y: 5 },
      { id: 'fire-existing', def: 'fire_1', owner: 'black', x: 9, y: 8 },
    ],
    phase: 'place',
    current: 'black',
    white: 50,
    black: 50,
    upkeepPending: true,
    reviewUpkeep: { white: false, black: false },
  };
  const deadSlotActions: AIAction[] = [
    { type: 'PAY_UPKEEP', keepUnitIds: ['anchor', 'fire-existing'] },
    { type: 'BUY_UNIT', definitionId: 'lightning_1', position: { x: 9, y: 7 } },
    { type: 'END_PLACE_PHASE' },
    { type: 'END_ACTION_PHASE' },
    { type: 'END_PLACE_PHASE' },
    { type: 'END_ACTION_PHASE' },
    { type: 'END_PLACE_PHASE' },
    { type: 'MOVE', unitId: 'invader', to: { x: 9, y: 9 } },
    { type: 'END_ACTION_PHASE' },
  ];

  it('two commitments arriving in the reverse of ascending square order', () => {
    expectOrderExact(walk(arrivalSpec, arrivalActions), CAPS);
  });

  it('one commitment reusing a dead slot below an existing unit', () => {
    expectOrderExact(walk(deadSlotSpec, deadSlotActions), CAPS);
  });

  // The mechanism itself, so a future "fix" that quietly reorders SLOT
  // allocation instead of carrying the order cannot make these tests vacuous:
  // in both positions the slot order really is the reverse of the birth order,
  // and everything above still has to hold.
  it('slot order and canonical order genuinely disagree in both positions', () => {
    for (const [spec, actions] of [
      [arrivalSpec, arrivalActions],
      [deadSlotSpec, deadSlotActions],
    ] as const) {
      const { p } = walk(spec, actions);
      const lightning = slotOn(p, 79);
      const fire = slotOn(p, 89);
      expect(lightning).toBeGreaterThanOrEqual(0);
      expect(fire).toBeGreaterThanOrEqual(0);
      // Lightning arrived LAST in canonical order but holds the LOWER slot.
      expect(lightning).toBeLessThan(fire);
      expect(p.ord[lightning]).toBeGreaterThan(p.ord[fire]);
    }
  });

  // §2.6.5's key-soundness argument, at unit level: the lab measures it over a
  // million positions, and this states it where a reader meets it. Order is NOT
  // hashed into Kpos/Kturn, which is only sound because a MATE verdict cannot
  // depend on order — it is returned only by a search that ran to completion.
  it('reversing the birth sequence never moves the MATE classification', () => {
    const sc = new Scratch(1, 0, 0, 1);
    for (const [spec, actions] of [
      [arrivalSpec, arrivalActions],
      [deadSlotSpec, deadSlotActions],
    ] as const) {
      const { p } = walk(spec, actions);
      const slots: number[] = [];
      for (let slot = 0; slot < MAX_SLOTS; slot++) if (p.sq[slot] !== DEAD) slots.push(slot);
      const byOrd = [...slots].sort((a, b) => p.ord[a] - p.ord[b]);
      const values = byOrd.map(slot => p.ord[slot]);
      for (const cap of CAPS) {
        const before = homeVerdict(p, 0, cap, sc, 0);
        const beforeNodes = proverStats().nodes;
        for (let k = 0; k < byOrd.length; k++) p.ord[byOrd[k]] = values[values.length - 1 - k];
        const after = homeVerdict(p, 0, cap, sc, 0);
        const afterNodes = proverStats().nodes;
        for (let k = 0; k < byOrd.length; k++) p.ord[byOrd[k]] = values[k];
        // MATE is order-independent, and so is a mate's node count.
        expect(VERDICT_NAME[after] === 'mate', `cap ${cap}`).toBe(VERDICT_NAME[before] === 'mate');
        if (VERDICT_NAME[before] === 'mate') expect(afterNodes, `cap ${cap}`).toBe(beforeNodes);
        // Reversal really did permute something, so this is not vacuous.
        expect(byOrd.length).toBeGreaterThan(1);
      }
    }
  });

  it('unmake restores the order plane and both sequence counters', () => {
    const replica = new Replica();
    const keep = newKeepSetTable();
    const undo = newUndo();
    let state = buildState(arrivalSpec);
    const p = replica.pack(state);
    for (const action of arrivalActions) {
      const pa = fromAIAction(p, action, keep);
      const before = { order: orderKey(p), ordNext: p.ordNext, pendOrdNext: p.pendOrdNext, ord: Int32Array.from(p.ord), pendOrd: Int32Array.from(p.pendOrd) };
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, pa, undo, keep);
      replica.unmake(p, undo);
      expect(undo.top).toBe(0);
      expect(orderKey(p)).toBe(before.order);
      expect(p.ordNext).toBe(before.ordNext);
      expect(p.pendOrdNext).toBe(before.pendOrdNext);
      expect(Array.from(p.ord)).toEqual(Array.from(before.ord));
      expect(Array.from(p.pendOrd)).toEqual(Array.from(before.pendOrd));
      replica.check(p);
      // ...then advance for real.
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, pa, undo, keep);
      state = applyAction(state, action);
    }
    expect(canonicalOrder(replica.unpack(p))).toBe(canonicalOrder(state));
  });
});
