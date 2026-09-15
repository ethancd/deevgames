// @vitest-environment node
/**
 * `Replica.make` / `unmake` (DESIGN §3.4, §4.4).
 *
 * The bulk test is a differential in miniature: over a few thousand random
 * positions, EVERY legal action is made, compared against `applyAction`'s own
 * packed form, and unmade — so `make` is checked for what it produces and
 * `unmake` for restoring the exact bits it started from, including the
 * incremental `Kpos`/`Kturn`/`occHash` keys and the `materialCc`/`pstSumCc`
 * sums. The named tests underneath pin the individual mutation tables of
 * DESIGN §3.4 so a regression says which row broke.
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import type { AIAction } from '../../../src/ai/types';
import { createInitialGameState } from '../../../src/game/board';
import { applyAction } from '../../../src/ai/simulate';
import { generateAllActions } from '../../../src/ai/moves';
import { seededRandom } from '../../../src/ai/runtime';
import { MAX_SLOTS, Reason, Result } from '../../../src/ai/hard/types';
import { AKind, fromAIAction, newKeepSetTable, paMake, toAIAction } from '../../../src/ai/hard/core/action';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { buildState, randomState } from './game-fixture';

const replica = new Replica();
const CORPUS_DIR = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions');
const GEN = new Int32Array(4 + MAX_SLOTS * 104);

function defId(id: string): number {
  return DEF_INDEX.get(id) as number;
}

describe('make / unmake', () => {
  it('every legal action of 1,200 positions matches applyAction and unmakes exactly', () => {
    const rng = seededRandom(0x4d414b45);
    const undo = newUndo();
    const keep = newKeepSetTable();
    const expected = allocState();
    const kinds = new Int32Array(8);
    let applied = 0;

    const positions = [
      ...readPositions(path.join(CORPUS_DIR, 'authored.jsonl')).map(s => s.state),
      ...readPositions(path.join(CORPUS_DIR, 'fuzz-1000.jsonl')).map(s => s.state),
      ...Array.from({ length: 200 }, () =>
        randomState(rng, 2 + Math.floor(rng() * 8), {
          phase: rng() < 0.5 ? 'place' : 'action',
          actions: 1 + Math.floor(rng() * 4),
          white: Math.floor(rng() * 20),
          black: Math.floor(rng() * 20),
          current: rng() < 0.5 ? 'white' : 'black',
          upkeepPending: rng() < 0.25,
        }),
      ),
    ];
    expect(positions.length).toBe(1211);

    for (const state of positions) {
      if (state.phase !== 'playing') continue;
      const p = replica.pack(state);
      const digestBefore = replica.digest(p);
      // `authored.jsonl#endgame-dry` is a hand-authored position whose reserves
      // do not conserve, so `check` cannot run on its descendants.
      let conserves = true;
      try {
        replica.check(p);
      } catch {
        conserves = false;
      }
      const actions: AIAction[] = state.upkeepPending
        ? upkeepCandidates(p, keep)
        : generateAllActions(state, state.turn.currentPlayer);

      for (const action of actions) {
        const pa = fromAIAction(p, action, keep);
        expect(replica.isLegal(p, pa, keep)).toBe(true);
        kinds[pa & 0x7]++;
        undo.top = 0;
        replica.resetUndoScratch();
        replica.make(p, pa, undo, keep);
        replica.pack(applyAction(state, action), expected);
        expect(replica.digest(p)).toBe(replica.digest(expected));
        if (conserves) replica.check(p);
        replica.unmake(p, undo);
        expect(replica.digest(p)).toBe(digestBefore);
        applied++;
      }
    }
    expect(applied).toBeGreaterThan(20_000);
    // Every action kind must actually have been exercised.
    for (const kind of [AKind.MOVE, AKind.ATTACK, AKind.BUY, AKind.PROMOTE, AKind.END_PLACE, AKind.END_ACTION, AKind.PAY_UPKEEP]) {
      expect(kinds[kind]).toBeGreaterThan(0);
    }
    // 1,200 positions x every legal action is ~3.5 s alone and the vitest
    // default is 5 s, so this test failed on CPU CONTENTION rather than on
    // anything it measured whenever the rest of `tests/ai/hard` ran beside it.
    // An explicit budget, not a faster test. (Touched by M14; see DEVIATIONS.)
  }, 120_000);

  it('a whole turn made and unmade action by action restores the root exactly', () => {
    const rng = seededRandom(0x5455524e);
    const undo = newUndo();
    const keep = newKeepSetTable();
    for (let trial = 0; trial < 300; trial++) {
      const state = randomState(rng, 3 + Math.floor(rng() * 6), {
        phase: 'place',
        white: Math.floor(rng() * 18),
        black: Math.floor(rng() * 18),
      });
      const p = replica.pack(state);
      const root = replica.digest(p);
      undo.top = 0;
      replica.resetUndoScratch();

      const stack: string[] = [];
      for (let depth = 0; depth < 8; depth++) {
        let n: number;
        if (p.upkeepPending === 1) {
          n = replica.genKeepSets(p, keep);
          for (let i = 0; i < n; i++) GEN[i] = paMake(AKind.PAY_UPKEEP, i);
        } else if (p.phase === 0) {
          n = replica.genPlace(p, GEN);
        } else {
          n = replica.genActions(p, GEN);
        }
        if (n === 0) break;
        stack.push(replica.digest(p));
        replica.make(p, GEN[Math.floor(rng() * n)], undo, keep);
        if (p.result !== Result.ONGOING) break;
      }
      while (stack.length > 0) {
        replica.unmake(p, undo);
        expect(replica.digest(p)).toBe(stack.pop());
      }
      expect(replica.digest(p)).toBe(root);
      expect(undo.top).toBe(0);
    }
  });

  it('MOVE: the mover changes square, pays its BFS cost and nothing else moves', () => {
    const state = buildState({
      units: [
        { def: 'lightning_1', owner: 'white', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      actions: 4,
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const pstBefore = p.pstSumCc[0];
    replica.make(p, paMake(AKind.MOVE, 0, 60), undo);
    expect(p.sq[0]).toBe(60);
    expect(p.pieceAt[0]).toBe(255);
    expect(p.pieceAt[60]).toBe(0);
    expect(p.actions).toBe(2); // distance 6 at speed 3
    expect(p.materialCc[0]).toBe(300);
    expect(p.pstSumCc[0]).toBe(pstBefore); // lightning never mines
    replica.unmake(p, undo);
    expect(p.sq[0]).toBe(0);
    expect(p.actions).toBe(4);
  });

  it('ATTACK: damage accumulates, a kill removes material, sets progress and zeroes the clock', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 0, y: 0 },
        { def: 'metal_3', owner: 'black', x: 1, y: 0 },
      ],
      inactivityPlies: 5,
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const attack = paMake(AKind.ATTACK, 0, 1);

    // Hi (ATK 2, fire) vs Kinzoku (DEF 5, metal): fire beats metal, so 3 damage.
    replica.make(p, attack, undo);
    expect(p.damage[1]).toBe(3);
    expect(p.atkCount[0]).toBe(1);
    expect(p.uflags[0] & 2).toBe(0); // F_LAST_KILLED not set
    expect(p.clock).toBe(5);
    expect(p.progress).toBe(0);
    expect(p.actions).toBe(3);
    // A tier-1 unit whose attack did not kill cannot attack again.
    expect(replica.isLegal(p, attack)).toBe(false);
    replica.unmake(p, undo);
    expect(p.damage[1]).toBe(0);
    expect(p.clock).toBe(5);

    const wounded = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 0, y: 0 },
          { def: 'metal_3', owner: 'black', x: 1, y: 0, damage: 3 },
          { def: 'plant_1', owner: 'black', x: 9, y: 9 },
        ],
        inactivityPlies: 5,
      }),
      allocState(),
    );
    const materialBefore = wounded.materialCc[1];
    replica.make(wounded, attack, undo);
    expect(wounded.sq[1]).toBe(255);
    expect(wounded.materialCc[1]).toBe(materialBefore - defCost('metal_3') * 100);
    expect(wounded.uflags[0] & 2).toBe(2);
    expect(wounded.clock).toBe(0);
    expect(wounded.progress).toBe(1);
    expect(wounded.result).toBe(Result.ONGOING);
    replica.unmake(wounded, undo);
    expect(wounded.sq[1]).toBe(1);
    expect(wounded.damage[1]).toBe(3);
    expect(wounded.clock).toBe(5);
    expect(wounded.progress).toBe(0);
    expect(wounded.materialCc[1]).toBe(materialBefore);
  });

  it('ATTACK: killing the last enemy unit ends the game as ELIMINATION at the action', () => {
    const state = buildState({
      units: [
        { def: 'fire_3', owner: 'white', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 1, y: 0 },
      ],
    });
    const p = replica.pack(state);
    const undo = newUndo();
    replica.make(p, paMake(AKind.ATTACK, 0, 1), undo);
    expect(p.result).toBe(Result.WHITE_WIN);
    expect(p.reason).toBe(Reason.ELIMINATION);
    const canonical = applyAction(state, { type: 'ATTACK', unitId: 'u0', targetPosition: { x: 1, y: 0 } });
    expect(canonical.phase).toBe('victory');
    expect(canonical.victoryReason).toBe('elimination');
    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
  });

  it('BUY: the lowest dead slot is reused, and the placement auto-advances when nothing is left to do', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 3,
      phase: 'place',
    });
    const p = replica.pack(state);
    const undo = newUndo();
    expect(p.slotCount).toBe(2);
    replica.make(p, paMake(AKind.BUY, defId('fire_1'), 0), undo);
    expect(p.slotCount).toBe(3);
    expect(p.sq[2]).toBe(0);
    expect(p.bank[0]).toBe(0);
    expect(p.uflags[2]).toBe(1 | 4); // F_CAN_ACT | F_PLACED
    // 0 crystals left, nothing promotable -> Place auto-advances (simulate.ts:118-120).
    expect(p.phase).toBe(1);
    expect(p.actions).toBe(4);
    replica.unmake(p, undo);
    expect(p.slotCount).toBe(2);
    expect(p.sq[2]).toBe(255);
    expect(p.phase).toBe(0);
    expect(p.bank[0]).toBe(3);

    // A dead slot is reused before the high-water mark grows.
    const withHole = replica.pack(state, allocState());
    withHole.sq[0] = 255;
    replica.rehash(withHole);
    withHole.bank[0] = 3;
    replica.rehash(withHole);
    replica.make(withHole, paMake(AKind.BUY, defId('fire_1'), 0), undo);
    expect(withHole.sq[0]).toBe(0);
    expect(withHole.slotCount).toBe(2);
  });

  it('PROMOTE: definition, material, tier lane and bank all move, and F_PROMOTED blocks a second one', () => {
    const state = buildState({
      units: [
        { def: 'water_1', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 12,
      phase: 'place',
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const promote = paMake(AKind.PROMOTE, 0);
    expect(replica.isLegal(p, promote)).toBe(true);
    replica.make(p, promote, undo);
    expect(p.defId[0]).toBe(defId('water_2'));
    expect(p.bank[0]).toBe(12 - 4);
    expect(p.materialCc[0]).toBe(defCost('water_2') * 100);
    expect(p.uflags[0] & 8).toBe(8);
    expect(replica.isLegal(p, promote)).toBe(false);
    replica.unmake(p, undo);
    expect(p.defId[0]).toBe(defId('water_1'));
    expect(p.bank[0]).toBe(12);
    expect(p.uflags[0] & 8).toBe(0);
  });

  it('END_PLACE and END_ACTION move the phase and the boundary exactly as the canonical engine does', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'black', x: 9, y: 8 },
      ],
      phase: 'place',
      white: 0,
      turnNumber: 4,
    });
    const p = replica.pack(state);
    const undo = newUndo();
    replica.make(p, paMake(AKind.END_PLACE), undo);
    expect(p.phase).toBe(1);
    expect(p.actions).toBe(4);
    replica.unmake(p, undo);
    expect(p.phase).toBe(0);

    const acting = replica.pack({ ...state, turn: { ...state.turn, phase: 'action' } }, allocState());
    const reserveBefore = acting.reserve[10];
    replica.make(acting, paMake(AKind.END_ACTION), undo);
    // White's Muju mines 3 from A2, then the turn hands over to Black.
    expect(acting.reserve[10]).toBe(reserveBefore - 3);
    expect(acting.bank[0]).toBe(3);
    expect(acting.gained[0]).toBe(3);
    expect(acting.side).toBe(1);
    expect(acting.turnNumber).toBe(4); // bumped only when White comes back
    expect(acting.clock).toBe(1);
    const canonical = replica.pack(applyAction({ ...state, turn: { ...state.turn, phase: 'action' } }, { type: 'END_ACTION_PHASE' }), allocState());
    expect(replica.digest(acting)).toBe(replica.digest(canonical));
    replica.unmake(acting, undo);
    expect(acting.reserve[10]).toBe(reserveBefore);
    expect(acting.side).toBe(0);
    expect(acting.clock).toBe(0);
    expect(acting.gained[0]).toBe(0);
  });

  it('END_ACTION: the incoming side pays affordable upkeep automatically, or the node stays pending', () => {
    const rich = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 1 },
        { def: 'water_2', owner: 'black', x: 9, y: 8 },
      ],
      black: 4,
      turnNumber: 6,
    });
    const p = replica.pack(rich);
    const undo = newUndo();
    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.upkeepPending).toBe(0);
    expect(p.bank[1]).toBe(3); // 4 - 1 rent
    expect(p.side).toBe(1);
    replica.unmake(p, undo);
    expect(p.bank[1]).toBe(4);
    expect(p.upkeepPending).toBe(0);

    const broke = replica.pack({ ...rich, players: { ...rich.players, black: { ...rich.players.black, resources: 0 } } }, allocState());
    replica.make(broke, paMake(AKind.END_ACTION), undo);
    expect(broke.upkeepPending).toBe(1);
    expect(broke.phase).toBe(0);
    expect(broke.actions).toBe(4);
    replica.unmake(broke, undo);
    expect(broke.upkeepPending).toBe(0);

    const reviewing = replica.pack({ ...rich, reviewUpkeep: { white: false, black: true } }, allocState());
    replica.make(reviewing, paMake(AKind.END_ACTION), undo);
    expect(reviewing.upkeepPending).toBe(1);
    expect(reviewing.bank[1]).toBe(4);
    replica.unmake(reviewing, undo);
    expect(reviewing.upkeepPending).toBe(0);
  });

  it('PAY_UPKEEP: releases the unkept tier-2+, pays the kept rent, heals and resets the keeper', () => {
    const state = buildState({
      units: [
        { def: 'water_2', owner: 'white', x: 0, y: 1, damage: 2, atkCount: 1, lastAttackKilled: true },
        { def: 'metal_2', owner: 'white', x: 1, y: 0 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 1,
      phase: 'place',
      upkeepPending: true,
    });
    const p = replica.pack(state);
    const keep = newKeepSetTable();
    const undo = newUndo();
    const n = replica.genKeepSets(p, keep);
    // Rent-bearing: two tier-2 units at 1 each, bank 1 -> {}, {a}, {b} are affordable.
    expect(n).toBe(3);

    // Find the set that keeps only the Straumr (slot 0).
    let index = -1;
    for (let i = 0; i < n; i++) {
      const action = toAIAction(p, paMake(AKind.PAY_UPKEEP, i), keep);
      if (action.type === 'PAY_UPKEEP' && action.keepUnitIds.length === 1 && action.keepUnitIds[0] === 'u0') index = i;
    }
    expect(index).toBeGreaterThanOrEqual(0);

    const before = replica.digest(p);
    const canonical = replica.pack(applyAction(state, toAIAction(p, paMake(AKind.PAY_UPKEEP, index), keep)), allocState());
    replica.make(p, paMake(AKind.PAY_UPKEEP, index), undo, keep);
    expect(replica.digest(p)).toBe(replica.digest(canonical));
    expect(p.upkeepPending).toBe(0);
    expect(p.bank[0]).toBe(0);
    expect(p.sq[1]).toBe(255); // the unkept Kurogane is released
    expect(p.damage[0]).toBe(0); // healed at the turn start
    expect(p.atkCount[0]).toBe(0);
    expect(p.uflags[0]).toBe(1); // F_CAN_ACT only
    replica.unmake(p, undo);
    expect(replica.digest(p)).toBe(before);
    expect(p.sq[1]).toBe(1);
    expect(p.damage[0]).toBe(2);
  });

  it('PAY_UPKEEP: releasing your last unit is UPKEEP_ELIMINATION', () => {
    const state = buildState({
      units: [
        { def: 'water_2', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 0,
      phase: 'place',
      upkeepPending: true,
    });
    const p = replica.pack(state);
    const keep = newKeepSetTable();
    const undo = newUndo();
    expect(replica.genKeepSets(p, keep)).toBe(1); // only the empty keep-set is affordable
    replica.make(p, paMake(AKind.PAY_UPKEEP, 0), undo, keep);
    expect(p.result).toBe(Result.BLACK_WIN);
    expect(p.reason).toBe(Reason.UPKEEP_ELIMINATION);
    const canonical = applyAction(state, toAIAction(p, paMake(AKind.PAY_UPKEEP, 0), keep));
    expect(canonical.victoryReason).toBe('upkeep-elimination');
    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.sq[0]).toBe(10);
  });

  it('RESIGN hands the win to the opponent', () => {
    const p = replica.pack(createInitialGameState());
    const undo = newUndo();
    replica.make(p, paMake(AKind.RESIGN), undo);
    expect(p.result).toBe(Result.BLACK_WIN);
    expect(p.reason).toBe(Reason.RESIGNATION);
    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
  });

  it('the undo stack stays bounded across a full turn', () => {
    const undo = newUndo();
    const keep = newKeepSetTable();
    const p = replica.pack(createInitialGameState());
    undo.top = 0;
    for (let i = 0; i < 6; i++) {
      const n = p.phase === 0 ? replica.genPlace(p, GEN) : replica.genActions(p, GEN);
      if (n === 0) break;
      replica.make(p, GEN[0], undo, keep);
    }
    expect(undo.top).toBeLessThan(undo.w.length);
    expect(undo.top).toBeGreaterThan(0);
  });
});

function upkeepCandidates(p: ReturnType<Replica['pack']>, keep: ReturnType<typeof newKeepSetTable>): AIAction[] {
  const n = replica.genKeepSets(p, keep);
  const out: AIAction[] = [];
  for (let i = 0; i < n; i++) out.push(toAIAction(p, paMake(AKind.PAY_UPKEEP, i), keep));
  return out;
}

function defCost(id: string): number {
  return replica.cat.cost[defId(id)];
}
