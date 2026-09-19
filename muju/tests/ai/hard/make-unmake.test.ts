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
 *
 * PHASING ONLY (M2). The corpus stores no ruleset, so its positions are read
 * through `asPhasing`. The rows that moved are worth stating up front:
 *
 *   - BUY records a COMMITMENT and debits the bank; no unit appears, and the
 *     phase never auto-advances;
 *   - END_ACTION mines, settles the MOVER's own upkeep and stops in Prepare —
 *     it does not hand off;
 *   - END_PLACE is the hand-off: clock, draw, home occupation, elimination, then
 *     the incoming side's commitments against ONE arrival board, then heal/reset;
 *   - PAY_UPKEEP no longer heals or resets anything.
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { AIAction } from '../../../src/ai/types';
import { createInitialGameState } from '../../../src/game/board';
import { applyAction } from '../../../src/ai/simulate';
import { generateAllActions } from '../../../src/ai/moves';
import { isLegalAction } from '../../../src/game/legality';
import { seededRandom } from '../../../src/ai/runtime';
import { F_CAN_ACT, MAX_SLOTS, PEND_STRIDE, Reason, Result } from '../../../src/ai/hard/types';
import { AKind, fromAIAction, newKeepSetTable, paMake, toAIAction } from '../../../src/ai/hard/core/action';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { asPhasing, buildState, randomState } from './game-fixture';

// E0.5 timeout budget: slowest test 3.1 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 20 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 20_000 });

const replica = new Replica();
const CORPUS_DIR = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions');
const GEN = new Int32Array(4 + MAX_SLOTS * 104);

function defId(id: string): number {
  return DEF_INDEX.get(id) as number;
}

/**
 * `digest` equality, with NO exemption.
 *
 * Round 4 ported `tactics/prover.ts` to Phasing's ACT-ONLY home defence, so the
 * mate-verdict exemption this file used to carry is GONE, together with the
 * `classifyKnownProverGap` predicate that gated it. The history is worth keeping
 * because of how it failed: the exemption originally justified itself with "the
 * packed prover can only ever UNDER-claim a Phasing mate, because Standard's
 * rescue set is strictly larger". That is true of the rescue SEARCH and false of
 * the admissible damage BOUND — `damageBoundCore` skipped any defender unit whose
 * `rent > cash`, so a BROKE defender was treated as having no army and the
 * replica claimed mates the defender refuted, roughly 1 position in 750k. The
 * bound runs first, so the safety argument was backwards, and a 1%-of-actions
 * allowance had been absorbing an unsound verdict for two rounds.
 *
 * Every field of every digest now has to match, `result.reason` included.
 */

/** `canPromote` on the canonical board, by unit id. */
function isLegalActionPhasing(state: ReturnType<typeof buildState>, unitId: string): boolean {
  return isLegalAction(state, { type: 'PROMOTE_UNIT', unitId });
}

function paKindOf(pa: number): number {
  return pa & 0x7;
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
      ...readPositions(path.join(CORPUS_DIR, 'authored.jsonl')).map(s => asPhasing(s.state)),
      ...readPositions(path.join(CORPUS_DIR, 'fuzz-1000.jsonl')).map(s => asPhasing(s.state)),
      ...Array.from({ length: 200 }, () => {
        // Commitments on random squares: some are on a legal spawn square (and
        // will materialise at the next END_PLACE), some are not (and refund).
        const pendingSummons = Array.from({ length: Math.floor(rng() * 4) }, () => ({
          def: rng() < 0.5 ? 'fire_1' : 'plant_1',
          owner: (rng() < 0.5 ? 'white' : 'black') as 'white' | 'black',
          x: Math.floor(rng() * 10),
          y: Math.floor(rng() * 10),
        }));
        return randomState(rng, 2 + Math.floor(rng() * 8), {
          phase: rng() < 0.5 ? 'place' : 'action',
          actions: 1 + Math.floor(rng() * 4),
          white: Math.floor(rng() * 20),
          black: Math.floor(rng() * 20),
          current: rng() < 0.5 ? 'white' : 'black',
          upkeepPending: rng() < 0.25,
          pendingSummons: pendingSummons.filter(
            (a, k) => pendingSummons.findIndex(b => b.owner === a.owner && b.x === a.x && b.y === a.y) === k,
          ),
        });
      }),
    ];
    expect(positions.length).toBe(1211);
    let arrivals = 0;
    let refunds = 0;

    for (const state of positions) {
      if (state.phase !== 'playing') continue;
      // A Phasing turn ends in Prepare with no action budget left; a corpus
      // 'place' position carries the Standard four, which nothing here reads.
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
        if (paKindOf(pa) === AKind.END_PLACE) {
          const resolved = state.pendingSummons?.filter(s => s.owner !== state.turn.currentPlayer).length ?? 0;
          arrivals += (applyAction(state, action).lastSummoning?.summoned.length ?? 0);
          refunds += (applyAction(state, action).lastSummoning?.disrupted.length ?? 0);
          void resolved;
        }
        replica.unmake(p, undo);
        expect(replica.digest(p)).toBe(digestBefore);
        applied++;
      }
    }
    expect(applied).toBeGreaterThan(20_000);
    // Both arrival outcomes must actually have been crossed.
    expect(arrivals).toBeGreaterThan(0);
    expect(refunds).toBeGreaterThan(0);
    // Every action kind must actually have been exercised.
    for (const kind of [AKind.MOVE, AKind.ATTACK, AKind.BUY, AKind.PROMOTE, AKind.END_PLACE, AKind.END_ACTION, AKind.PAY_UPKEEP]) {
      expect(kinds[kind]).toBeGreaterThan(0);
    }
    // 1,200 positions x every legal action is ~3.5 s alone and the vitest
    // default is 5 s, so this test failed on CPU CONTENTION rather than on
    // anything it measured whenever the rest of `tests/ai/hard` ran beside it.
    // An explicit budget, not a faster test. (Touched by M14; see DEVIATIONS.)
  }, 120_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('a whole turn made and unmade action by action restores the root exactly', () => {
    const rng = seededRandom(0x5455524e);
    const undo = newUndo();
    const keep = newKeepSetTable();
    for (let trial = 0; trial < 300; trial++) {
      const state = randomState(rng, 3 + Math.floor(rng() * 6), {
        // A Phasing turn starts in ACT; eight plies is enough to cross
        // END_ACTION, the whole of Prepare and END_PLACE's arrival resolution.
        phase: 'action',
        white: Math.floor(rng() * 18),
        black: Math.floor(rng() * 18),
        pendingSummons: [
          { def: 'fire_1', owner: 'white', x: trial % 10, y: 0 },
          { def: 'fire_1', owner: 'black', x: 9, y: 9 - (trial % 9) },
        ],
      });
      const p = replica.pack(state);
      const root = replica.digest(p);
      undo.top = 0;
      replica.resetUndoScratch();

      const stack: string[] = [];
      for (let depth = 0; depth < 10; depth++) {
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

  it('BUY: a COMMITMENT is recorded and the bank debited — no unit, no phase change', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 0, y: 1, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b0' },
      ],
      white: 3,
      phase: 'place',
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const before = replica.digest(p);
    expect(p.slotCount).toBe(2);
    const buy = paMake(AKind.BUY, defId('fire_1'), 0);

    replica.make(p, buy, undo);
    // The commitment, square-keyed, at its exact paid cost.
    expect(p.pendDef[0 * PEND_STRIDE + 0]).toBe(defId('fire_1') + 1);
    expect(p.pendCost[0 * PEND_STRIDE + 0]).toBe(3);
    expect([...p.pendCount]).toEqual([1, 0]);
    expect([...p.pendCostSum]).toEqual([3, 0]);
    expect(p.bank[0]).toBe(0);
    // No unit: no slot taken, no occupancy, no material.
    expect(p.slotCount).toBe(2);
    expect(p.pieceAt[0]).toBe(255);
    expect(p.occ[0] & 1).toBe(0);
    expect(p.materialCc[0]).toBe(replica.cat.cost[defId('fire_1')] * 100);
    // "Preparation always ends explicitly": 0 crystals left and nothing
    // promotable, and the phase still does NOT auto-advance.
    expect(p.phase).toBe(0);
    expect(p.actions).toBe(state.turn.actionsRemaining);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(applyAction(state, toAIAction(p, buy, newKeepSetTable())), allocState())));
    replica.check(p);

    // A second commitment on the same square is not an action at this node.
    expect(replica.isLegal(p, paMake(AKind.BUY, defId('fire_1'), 0))).toBe(false);

    replica.unmake(p, undo);
    expect(replica.digest(p)).toBe(before);
    expect([...p.pendCount]).toEqual([0, 0]);
    expect(p.pendDef[0]).toBe(0);
    expect(p.bank[0]).toBe(3);
  });

  it('BUY: several commitments in either order reach the same position', () => {
    const spec = {
      units: [
        { def: 'plant_1', owner: 'white' as const, x: 1, y: 1, id: 'w0' },
        { def: 'plant_1', owner: 'black' as const, x: 8, y: 8, id: 'b0' },
      ],
      white: 12,
      phase: 'place' as const,
    };
    const forward = replica.pack(buildState(spec));
    const undo = newUndo();
    replica.make(forward, paMake(AKind.BUY, defId('fire_1'), 0), undo);
    replica.make(forward, paMake(AKind.BUY, defId('water_1'), 1), undo);
    const reversed = replica.pack(buildState(spec), allocState());
    const undo2 = newUndo();
    replica.make(reversed, paMake(AKind.BUY, defId('water_1'), 1), undo2);
    replica.make(reversed, paMake(AKind.BUY, defId('fire_1'), 0), undo2);
    expect(replica.digest(reversed)).toBe(replica.digest(forward));
    expect([reversed.kposLo, reversed.kposHi]).toEqual([forward.kposLo, forward.kposHi]);
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

  it('END_ACTION mines, settles the MOVER\'s upkeep and stops in Prepare without handing off', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 9, y: 8, id: 'b0' },
      ],
      phase: 'action',
      white: 0,
      turnNumber: 4,
      inactivityPlies: 3,
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const reserveBefore = p.reserve[10];
    replica.make(p, paMake(AKind.END_ACTION), undo);
    // White's Muju mines 3 from A2 into White's own bank...
    expect(p.reserve[10]).toBe(reserveBefore - 3);
    expect(p.bank[0]).toBe(3);
    expect(p.gained[0]).toBe(3);
    // ...and then White STANDS STILL in Prepare with no actions left. The clock,
    // the turn number and the side to move all belong to END_PLACE.
    expect(p.side).toBe(0);
    expect(p.phase).toBe(0);
    expect(p.actions).toBe(0);
    expect(p.clock).toBe(3);
    expect(p.turnNumber).toBe(4);
    expect(p.upkeepPending).toBe(0);
    const canonical = replica.pack(applyAction(state, { type: 'END_ACTION_PHASE' }), allocState());
    expect(canonical.side).toBe(0);
    expect(canonical.phase).toBe(0);
    expect(replica.digest(p)).toBe(replica.digest(canonical));
    replica.check(p);

    // The new income is spendable in the SAME Prepare — that is the whole point
    // of collecting it before the phase change.
    expect(replica.isLegal(p, paMake(AKind.BUY, defId('fire_1'), 0))).toBe(true);

    replica.unmake(p, undo);
    expect(p.reserve[10]).toBe(reserveBefore);
    expect(p.phase).toBe(1);
    expect(p.actions).toBe(4);
    expect(p.gained[0]).toBe(0);
    expect(p.bank[0]).toBe(0);
  });

  it('END_ACTION: the MOVER pays its own affordable upkeep, or the node goes upkeep-pending', () => {
    const rich = buildState({
      units: [
        { def: 'water_2', owner: 'white', x: 0, y: 1, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 9, y: 8, id: 'b0' },
      ],
      current: 'white',
      phase: 'action',
      white: 4,
      turnNumber: 6,
      // An exhausted map, so the affordability question is about the BANK alone.
      // (That income comes first, and can itself pay the rent, is the subject of
      // the END_ACTION mining test above.)
      reserves: new Array<number>(100).fill(0),
    });
    const p = replica.pack(rich);
    const undo = newUndo();
    replica.make(p, paMake(AKind.END_ACTION), undo);
    // White's own rent, out of White's own bank — Standard charged the INCOMING
    // side here; Phasing charges the mover, before it hands off at all.
    expect(p.upkeepPending).toBe(0);
    expect(p.bank[0]).toBe(3); // 4 - 1 rent, no income to be had
    expect(p.side).toBe(0);
    expect(p.phase).toBe(0);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(applyAction(rich, { type: 'END_ACTION_PHASE' }), allocState())));
    replica.unmake(p, undo);
    expect(p.bank[0]).toBe(4);
    expect(p.upkeepPending).toBe(0);
    expect(p.phase).toBe(1);

    // With an empty bank and an exhausted map the rent is unaffordable, so the
    // node stands in Prepare with the keep-set choice still to be made.
    const brokeState = { ...rich, players: { ...rich.players, white: { ...rich.players.white, resources: 0 } } };
    const broke = replica.pack(brokeState, allocState());
    replica.make(broke, paMake(AKind.END_ACTION), undo);
    expect(broke.upkeepPending).toBe(1);
    expect(broke.side).toBe(0);
    expect(broke.phase).toBe(0);
    // Prepare starts with the action budget already spent (turn.ts:107).
    expect(broke.actions).toBe(0);
    expect(replica.digest(broke)).toBe(replica.digest(replica.pack(applyAction(brokeState, { type: 'END_ACTION_PHASE' }), allocState())));
    replica.unmake(broke, undo);
    expect(broke.upkeepPending).toBe(0);
    expect(broke.actions).toBe(4);

    const reviewing = replica.pack({ ...rich, reviewUpkeep: { white: true, black: false } }, allocState());
    replica.make(reviewing, paMake(AKind.END_ACTION), undo);
    expect(reviewing.upkeepPending).toBe(1);
    expect(reviewing.bank[0]).toBe(4);
    replica.unmake(reviewing, undo);
    expect(reviewing.upkeepPending).toBe(0);
  });

  it('END_PLACE hands off, and resolves the incoming side\'s commitments on ONE arrival board', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 8, y: 9, id: 'b0' },
      ],
      current: 'white',
      phase: 'place',
      actions: 0,
      white: 0,
      black: 7,
      turnNumber: 6,
      // Black's Muju on (8,9) anchors the box (8,9)..(9,9): (9,9) is empty and
      // legal, while (0,0) lies outside every Black rectangle and is not.
      pendingSummons: [
        { def: 'fire_1', owner: 'black', x: 9, y: 9, id: 'arrives' },
        { def: 'plant_1', owner: 'black', x: 0, y: 0, id: 'refunded' },
      ],
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const before = replica.digest(p);
    expect([...p.pendCount]).toEqual([0, 2]);

    const canonical = applyAction(state, { type: 'END_PLACE_PHASE' });
    expect(canonical.turn.currentPlayer).toBe('black');
    expect(canonical.turn.phase).toBe('action');
    expect(canonical.lastSummoning?.summoned.map(x => x.id)).toEqual(['arrives']);
    expect(canonical.lastSummoning?.disrupted.map(x => x.id)).toEqual(['refunded']);

    replica.make(p, paMake(AKind.END_PLACE), undo);
    expect(p.side).toBe(1);
    expect(p.phase).toBe(1);
    expect(p.actions).toBe(4);
    expect(p.turnNumber).toBe(6); // bumped only when White comes back
    expect(p.clock).toBe(1);
    // The valid commitment became a real unit in the lowest dead slot...
    const arrival = p.pieceAt[99];
    expect(arrival).not.toBe(255);
    expect(p.defId[arrival]).toBe(defId('fire_1'));
    expect(p.owner[arrival]).toBe(1);
    // ...that may act AND promote this turn: `placedThisTurn` is false, so
    // `F_PLACED` is clear and `F_CAN_ACT` is set (summoning.ts:29-30).
    expect(p.uflags[arrival]).toBe(F_CAN_ACT);
    expect(p.originIds[arrival]).toBe('arrives');
    // ...and the disrupted one refunded its EXACT original cost (plant_1 = 5).
    expect(p.bank[1]).toBe(7 + 5);
    expect([...p.pendCount]).toEqual([0, 0]);
    expect([...p.pendCostSum]).toEqual([0, 0]);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    replica.check(p);

    // The arrival really can act, on the very turn it landed.
    expect(replica.isLegal(p, paMake(AKind.MOVE, arrival, 89))).toBe(true);

    replica.unmake(p, undo);
    expect(replica.digest(p)).toBe(before);
    expect(p.side).toBe(0);
    expect(p.bank[1]).toBe(7);
    expect([...p.pendCount]).toEqual([0, 2]);
  });

  it('END_PLACE: arrivals cannot anchor one another — one snapshot decides all of them', () => {
    // Black's only unit is on (9,8), whose rectangle is (9,8)..(9,9). A
    // commitment on (9,9) arrives; one on (8,8) does not, and is NOT rescued by
    // the (9,9) arrival, because every commitment is judged against the SAME
    // board (summoning.ts:14-16).
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 9, y: 8, id: 'b0' },
      ],
      current: 'white',
      phase: 'place',
      actions: 0,
      black: 0,
      pendingSummons: [
        { def: 'fire_1', owner: 'black', x: 9, y: 9, id: 'anchor-to-be' },
        { def: 'fire_1', owner: 'black', x: 8, y: 8, id: 'would-be-anchored' },
      ],
    });
    const canonical = applyAction(state, { type: 'END_PLACE_PHASE' });
    expect(canonical.lastSummoning?.summoned.map(x => x.id)).toEqual(['anchor-to-be']);
    expect(canonical.lastSummoning?.disrupted.map(x => x.id)).toEqual(['would-be-anchored']);

    const p = replica.pack(state);
    const undo = newUndo();
    const before = replica.digest(p);
    replica.make(p, paMake(AKind.END_PLACE), undo);
    expect(p.pieceAt[99]).not.toBe(255);
    expect(p.pieceAt[88]).toBe(255);
    expect(p.bank[1]).toBe(3); // the disrupted fire_1 refunded its 3
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    replica.unmake(p, undo);
    expect(replica.digest(p)).toBe(before);
  });

  it('END_PLACE: an arrival may promote on its arrival turn', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 8, y: 9, id: 'b0' },
      ],
      current: 'white',
      phase: 'place',
      actions: 0,
      black: 20,
      pendingSummons: [{ def: 'fire_1', owner: 'black', x: 9, y: 9, id: 'arrives' }],
    });
    const p = replica.pack(state);
    const undo = newUndo();
    replica.make(p, paMake(AKind.END_PLACE), undo);
    const arrival = p.pieceAt[99];
    // ACT first: promotion lives in Prepare, at the far end of the same turn.
    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.phase).toBe(0);
    const promote = paMake(AKind.PROMOTE, arrival);
    expect(replica.isLegal(p, promote)).toBe(true);
    // ...and the canonical engine agrees, which is the claim that matters:
    // Standard forbids this, because `placedThisTurn` would be set.
    const canonicalArrived = applyAction(applyAction(state, { type: 'END_PLACE_PHASE' }), { type: 'END_ACTION_PHASE' });
    expect(isLegalActionPhasing(canonicalArrived, 'arrives')).toBe(true);
    replica.make(p, promote, undo);
    expect(p.defId[arrival]).toBe(defId('fire_2'));
    replica.check(p);
    for (let i = 0; i < 3; i++) replica.unmake(p, undo);
    expect(p.pieceAt[99]).toBe(255);
  });

  it('END_PLACE: an arrival that reuses a dead slot unmakes exactly, resurrection and all', () => {
    // Black kills the White unit in slot 1, then hands off; WHITE is the
    // incoming side, so it is White's commitment that resolves — into the slot
    // the corpse left behind. Unmaking the END_PLACE must return that slot to
    // the corpse's own fields, so that unmaking the ATTACK underneath can still
    // resurrect it.
    const state = buildState({
      units: [
        { def: 'fire_3', owner: 'black', x: 9, y: 8, id: 'b0' },
        { def: 'plant_1', owner: 'white', x: 9, y: 7, id: 'w-doomed' },
        // Anchors the box (0,0)..(1,0), leaving White's own corner free.
        { def: 'plant_1', owner: 'white', x: 1, y: 0, id: 'w-safe' },
      ],
      current: 'black',
      phase: 'action',
      actions: 4,
      // Enough to settle the Hono's own rent at END_ACTION; otherwise the turn
      // stalls on a keep-set choice and never reaches END_PLACE.
      black: 5,
      pendingSummons: [{ def: 'fire_1', owner: 'white', x: 0, y: 0, id: 'arrives' }],
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const keep = newKeepSetTable();
    const root = replica.digest(p);
    replica.resetUndoScratch();
    expect(p.sq[1]).toBe(79);

    const line = [paMake(AKind.ATTACK, 0, 79), paMake(AKind.END_ACTION), paMake(AKind.END_PLACE)];
    const stack: string[] = [];
    let canonical = state;
    for (const pa of line) {
      expect(replica.isLegal(p, pa, keep), String(pa)).toBe(true);
      stack.push(replica.digest(p));
      canonical = applyAction(canonical, toAIAction(p, pa, keep));
      replica.make(p, pa, undo, keep);
      expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
      replica.check(p);
    }
    // Slot 1 held the killed Muju and now holds White's arrival on A1.
    expect(p.sq[1]).toBe(0);
    expect(p.defId[1]).toBe(defId('fire_1'));
    expect(p.owner[1]).toBe(0);
    expect(p.uflags[1]).toBe(F_CAN_ACT);
    expect(p.originIds[1]).toBe('arrives');

    while (stack.length > 0) {
      replica.unmake(p, undo);
      expect(replica.digest(p)).toBe(stack.pop());
    }
    expect(replica.digest(p)).toBe(root);
    expect(undo.top).toBe(0);
    // The corpse's own fields are back, so the ATTACK's own undo could still
    // have resurrected it.
    expect(p.sq[1]).toBe(79);
    expect(p.defId[1]).toBe(defId('plant_1'));
    expect(p.originIds[1]).toBe('w-doomed');
  });

  it('PAY_UPKEEP: releases the unkept tier-2+ and pays the kept rent — and heals NOTHING', () => {
    const state = buildState({
      units: [
        { def: 'water_2', owner: 'white', x: 0, y: 1, damage: 2, atkCount: 1, lastAttackKilled: true, id: 'u0' },
        { def: 'metal_2', owner: 'white', x: 1, y: 0, id: 'u1' },
        { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'u2' },
      ],
      white: 1,
      phase: 'place',
      actions: 0,
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
    // Under Phasing, settling upkeep is the END of the mover's turn, not the
    // start of it: the damage and the attack history stay until the NEXT own
    // turn start, and Prepare keeps its spent action budget.
    expect(p.damage[0]).toBe(2);
    expect(p.atkCount[0]).toBe(1);
    expect(p.uflags[0] & F_CAN_ACT).toBe(F_CAN_ACT);
    expect(p.phase).toBe(0);
    expect(p.actions).toBe(0);
    // ...and Prepare goes on, to be ended explicitly.
    expect(replica.isLegal(p, paMake(AKind.END_PLACE))).toBe(true);
    replica.check(p);
    replica.unmake(p, undo);
    expect(replica.digest(p)).toBe(before);
    expect(p.sq[1]).toBe(1);
    expect(p.damage[0]).toBe(2);
    expect(p.upkeepPending).toBe(1);
  });

  it('PAY_UPKEEP: releasing your last unit is UPKEEP_ELIMINATION', () => {
    const state = buildState({
      units: [
        { def: 'water_2', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 0,
      phase: 'place',
      actions: 0,
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
    const p = replica.pack(createInitialGameState(undefined, 4, 0, 'phasing'));
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
    const p = replica.pack(createInitialGameState(undefined, 4, 0, 'phasing'));
    undo.top = 0;
    // Six plies covers ACT, END_ACTION, Prepare and END_PLACE — including an
    // END_PLACE whose record carries one undo row per resolved commitment.
    for (let i = 0; i < 6; i++) {
      const n = p.upkeepPending === 1 ? 0 : p.phase === 0 ? replica.genPlace(p, GEN) : replica.genActions(p, GEN);
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
