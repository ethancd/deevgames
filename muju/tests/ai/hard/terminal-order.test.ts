// @vitest-environment node
/**
 * Terminal ordering inside `Replica.make` (SU §8.1; DESIGN §3.4, §5.11.1).
 *
 * SU §8.1's ruling — verified against the shipped engine and re-verified here
 * on every case — is that a *proven* home checkmate resolves at the instant of
 * the move and beats the ten-quiet-turn draw, while an *unproven* occupation
 * (a rescue exists, or the prover ran out of nodes) is subject to the draw
 * before the next `startTurn`. Every expectation below is stated twice: once
 * for the canonical engine and once for the replica, so the test pins the
 * ORDER rather than one engine's opinion of it.
 *
 * The full order `make` reproduces, from `simulate.ts:25-34` and
 * `turn.ts:19-34, 92-104`:
 *
 *   1. home checkmate, adjudicated at the action (before the boundary runs)
 *   2. elimination, at the attack that empties a side's board
 *   3. income
 *   4. the inactivity draw, at the boundary
 *   5. home occupation, at the incoming side's `startTurn`
 *   6. elimination again, at `startTurn`
 *   7. upkeep (automatic, or pending), and upkeep-elimination
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { Reason, Result } from '../../../src/ai/hard/types';
import { AKind, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();

/** Black Hi one step from White's corner, ten-quiet-turn clock at 9. */
function clock9(defenders: 'lone-muju' | 'rescuer') {
  return buildState({
    units: [
      { def: 'fire_1', owner: 'black', x: 1, y: 0, id: 'b0' },
      defenders === 'lone-muju'
        ? { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' }
        : { def: 'fire_1', owner: 'white', x: 0, y: 1, id: 'w0' },
    ],
    current: 'black',
    phase: 'action',
    actions: 4,
    inactivityPlies: 9,
    turnNumber: 12,
  });
}

describe('terminal order (SU §8.1)', () => {
  it('a PROVEN home checkmate resolves at the move, beating the draw at clock 9', () => {
    const state = clock9('lone-muju');
    const move = { type: 'MOVE' as const, unitId: 'b0', to: { x: 0, y: 0 } };

    const canonical = applyAction(state, move);
    expect(canonical.phase).toBe('victory');
    expect(canonical.winner).toBe('black');
    expect(canonical.victoryReason).toBe('home-checkmate');

    const p = replica.pack(state);
    const undo = newUndo();
    expect(replica.needsProof(p)).toBe(false); // nobody is on a corner yet
    replica.make(p, paMake(AKind.MOVE, 0, 0), undo);
    expect(p.result).toBe(Result.BLACK_WIN);
    expect(p.reason).toBe(Reason.HOME_CHECKMATE);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    // The clock never advanced: the game ended at the action, not the boundary.
    expect(p.clock).toBe(9);

    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
    expect(p.sq[0]).toBe(1);
  });

  it('an UNPROVEN occupation leaves the game running, and the draw fires at the boundary', () => {
    const state = clock9('rescuer');
    const move = { type: 'MOVE' as const, unitId: 'b0', to: { x: 0, y: 0 } };

    const canonicalMoved = applyAction(state, move);
    expect(canonicalMoved.phase).toBe('playing');

    const p = replica.pack(state);
    const undo = newUndo();
    replica.make(p, paMake(AKind.MOVE, 0, 0), undo);
    expect(p.result).toBe(Result.ONGOING);
    // The occupation is real — the prover was consulted and said "rescue".
    expect(replica.needsProof(p)).toBe(true);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonicalMoved, allocState())));

    const canonicalEnded = applyAction(canonicalMoved, { type: 'END_ACTION_PHASE' });
    expect(canonicalEnded.phase).toBe('victory');
    expect(canonicalEnded.winner).toBeNull();
    expect(canonicalEnded.victoryReason).toBe('inactivity');
    expect(canonicalEnded.inactivityPlies).toBe(10);

    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.result).toBe(Result.DRAW);
    expect(p.reason).toBe(Reason.INACTIVITY);
    expect(p.clock).toBe(10);
    // The draw resolves BEFORE the handover, so the side to move is unchanged.
    expect(p.side).toBe(1);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonicalEnded, allocState())));
  });

  it('the draw at the boundary beats an occupation that would win at the next startTurn', () => {
    // White already sits on Black's corner; Black ends a quiet tenth ply.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 5, id: 'b0' },
        { def: 'fire_1', owner: 'white', x: 9, y: 9, id: 'w0' },
        { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'w1' },
      ],
      current: 'black',
      phase: 'action',
      actions: 4,
      inactivityPlies: 9,
      turnNumber: 8,
    });
    const canonical = applyAction(state, { type: 'END_ACTION_PHASE' });
    expect(canonical.victoryReason).toBe('inactivity');
    expect(canonical.winner).toBeNull();

    const p = replica.pack(state);
    replica.make(p, paMake(AKind.END_ACTION), newUndo());
    expect(p.result).toBe(Result.DRAW);
    expect(p.reason).toBe(Reason.INACTIVITY);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
  });

  it('home occupation at startTurn beats the upkeep the incoming side cannot pay', () => {
    const occupying = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 5, id: 'b0' },
        { def: 'fire_1', owner: 'white', x: 9, y: 9, id: 'w0' },
        { def: 'water_2', owner: 'white', x: 0, y: 1, id: 'w1' },
      ],
      current: 'black',
      phase: 'action',
      actions: 4,
      white: 0,
      turnNumber: 8,
    });
    const canonical = applyAction(occupying, { type: 'END_ACTION_PHASE' });
    expect(canonical.victoryReason).toBe('home-occupation');
    expect(canonical.winner).toBe('white');
    expect(canonical.upkeepPending).toBe(false);
    expect(canonical.turn.currentPlayer).toBe('white');
    expect(canonical.turn.phase).toBe('place');

    const p = replica.pack(occupying);
    const undo = newUndo();
    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.result).toBe(Result.WHITE_WIN);
    expect(p.reason).toBe(Reason.HOME_OCCUPATION);
    expect(p.upkeepPending).toBe(0);
    expect(p.side).toBe(0);
    expect(p.phase).toBe(0);
    expect(p.actions).toBe(4);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.side).toBe(1);

    // Move the occupier off the corner and the SAME position goes upkeep-pending.
    const notOccupying = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 5, id: 'b0' },
        { def: 'fire_1', owner: 'white', x: 8, y: 9, id: 'w0' },
        { def: 'water_2', owner: 'white', x: 0, y: 1, id: 'w1' },
      ],
      current: 'black',
      phase: 'action',
      actions: 4,
      white: 0,
      turnNumber: 8,
    });
    const q = replica.pack(notOccupying, allocState());
    replica.make(q, paMake(AKind.END_ACTION), undo);
    expect(q.result).toBe(Result.ONGOING);
    expect(q.upkeepPending).toBe(1);
    expect(q.side).toBe(0);
    expect(replica.digest(q)).toBe(replica.digest(replica.pack(applyAction(notOccupying, { type: 'END_ACTION_PHASE' }), allocState())));
  });

  it('elimination resolves at the attack, not at the boundary', () => {
    const state = buildState({
      units: [
        { def: 'fire_3', owner: 'white', x: 0, y: 0, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 1, y: 0, id: 'b0' },
      ],
      inactivityPlies: 3,
    });
    const canonical = applyAction(state, { type: 'ATTACK', unitId: 'w0', targetPosition: { x: 1, y: 0 } });
    expect(canonical.victoryReason).toBe('elimination');

    const p = replica.pack(state);
    replica.make(p, paMake(AKind.ATTACK, 0, 1), newUndo());
    expect(p.result).toBe(Result.WHITE_WIN);
    expect(p.reason).toBe(Reason.ELIMINATION);
    // The clock was zeroed by the kill and the side never changed hands.
    expect(p.clock).toBe(0);
    expect(p.side).toBe(0);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
  });

  it('needsProof is exactly the resolveHomeCheckmate short-circuit', () => {
    const occupied = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'black',
      }),
    );
    expect(replica.needsProof(occupied)).toBe(true);

    // The other side to move: the occupier is not the mover, so no proof runs.
    const otherMover = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'white',
      }),
      allocState(),
    );
    expect(replica.needsProof(otherMover)).toBe(false);

    // A counter-invasion freezes the adjudication (homeCheckmate.ts:176).
    const counter = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'fire_1', owner: 'white', x: 9, y: 9, id: 'w0' },
        ],
        current: 'black',
      }),
      allocState(),
    );
    expect(replica.needsProof(counter)).toBe(false);

    // `victoryRule: 'elimination'` turns the whole rule off.
    const eliminationOnly = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'black',
        victoryRule: 'elimination',
      }),
      allocState(),
    );
    expect(replica.needsProof(eliminationOnly)).toBe(false);
  });

  it('victoryRule "elimination" suppresses both home terminals', () => {
    const state = { ...clock9('lone-muju'), victoryRule: 'elimination' as const };
    const canonical = applyAction(state, { type: 'MOVE', unitId: 'b0', to: { x: 0, y: 0 } });
    expect(canonical.phase).toBe('playing');

    const p = replica.pack(state);
    replica.make(p, paMake(AKind.MOVE, 0, 0), newUndo());
    expect(p.result).toBe(Result.ONGOING);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
  });

  it('proverMode gates the checkmate call: 2 proves, 1 under-claims, 0 asserts', () => {
    const state = clock9('lone-muju');
    const undo = newUndo();

    const full = replica.pack(state);
    full.proverMode = 2;
    replica.make(full, paMake(AKind.MOVE, 0, 0), undo);
    expect(full.result).toBe(Result.BLACK_WIN);

    // Mode 1 is the admissible damage bound alone (`enoughPossibleDamage`,
    // homeCheckmate.ts:27-49, wired up at M10): its FAILURE proves the mate, so
    // it may only ever UNDER-claim one. Here the bound is already decisive — a
    // lone Muju ten squares away at speed 1 cannot reach A1 in four actions —
    // so modes 1 and 2 agree.
    const bound = replica.pack(state, allocState());
    bound.proverMode = 1;
    replica.make(bound, paMake(AKind.MOVE, 0, 0), newUndo());
    expect(bound.result).toBe(Result.BLACK_WIN);

    // With a rescuer beside the corner the bound is satisfied, so mode 1
    // claims nothing; the full prover searches and finds the rescue, so
    // mode 2 claims nothing either.
    for (const mode of [1, 2] as const) {
      const answerable = replica.pack(clock9('rescuer'), allocState());
      answerable.proverMode = mode;
      replica.make(answerable, paMake(AKind.MOVE, 0, 0), newUndo());
      expect(answerable.result, `proverMode ${mode}`).toBe(Result.ONGOING);
    }

    // Mode 0 is only legal while no enemy corner is held; entering one asserts.
    const off = replica.pack(state, allocState());
    off.proverMode = 0;
    expect(() => replica.make(off, paMake(AKind.MOVE, 0, 0), newUndo())).toThrow(/proverMode 0/);
  });
});
