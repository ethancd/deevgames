// @vitest-environment node
/**
 * Terminal ordering inside `Replica.make` under PHASING (SU §8.1; DESIGN §3.4,
 * §5.11.1; `docs/PHASING-2026-09-16.md`).
 *
 * Phasing splits the old boundary in two, and every terminal moved with it.
 * Standard adjudicated a home checkmate at the instant of the move; Phasing
 * does not, because "an invading piece must survive its own end-of-action
 * upkeep before Phasing can award immediate home-checkmate"
 * (`homeCheckmate.ts:44-47, 168-170`): `resolveHomeCheckmate` refuses to run
 * outside `turn.phase === 'place'`. And the quiet-turn clock, the draw, the home
 * occupation and the turn-start elimination all belong to `END_PLACE` now, not
 * to `END_ACTION` (`turn.ts:103-131`).
 *
 * The full order `make` reproduces:
 *
 *   ACT        1. elimination, at the attack that empties a side's board
 *              (no home checkmate here: the phase forbids it)
 *   END_ACTION 2. income
 *              3. Prepare, four actions spent
 *              4. the mover's own upkeep — automatic, or pending
 *              5. home checkmate, now that the phase is Prepare and the
 *                 invader has paid its rent
 *   PREPARE    5'. the same gate after every BUY, PROMOTE and PAY_UPKEEP
 *   END_PLACE  6. the quiet-turn clock, then the inactivity draw
 *              7. home occupation, at the incoming side's `startTurn`
 *              8. elimination, at `startTurn`
 *              9. the incoming side's commitments, then heal/reset
 *
 * Every expectation is stated twice — once for the canonical engine and once for
 * the replica — so the test pins the ORDER rather than one engine's opinion of
 * it. The one exception is marked: the mate VERDICT is Standard's until a later
 * milestone repacks the prover, so the cases below use positions where the
 * Phasing and Standard rescue sets coincide (a lone defender with an empty bank
 * can neither promote nor release, so `prepare` collapses to `act`).
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { Reason, Result } from '../../../src/ai/hard/types';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();

/**
 * Black Hi one step from White's corner, ten-quiet-turn clock at 9. Black's Hi
 * is tier 1, so it owes no rent and its `END_ACTION` always settles; White's
 * defender has an empty bank, so its Phasing rescue set (act only) and its
 * Standard one (upkeep + promotion + act) are the same.
 */
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

describe('terminal order under Phasing (SU §8.1)', () => {
  it('a home checkmate is NOT adjudicated in ACT, however unanswerable it is', () => {
    const state = clock9('lone-muju');
    const move = { type: 'MOVE' as const, unitId: 'b0', to: { x: 0, y: 0 } };

    // Standard would end the game right here. Phasing does not: the invader has
    // not yet survived its own end-of-action upkeep.
    const canonical = applyAction(state, move);
    expect(canonical.phase).toBe('playing');
    expect(canonical.turn.phase).toBe('action');

    const p = replica.pack(state);
    const undo = newUndo();
    expect(replica.needsProof(p)).toBe(false); // nobody is on a corner yet
    replica.make(p, paMake(AKind.MOVE, 0, 0), undo);
    expect(p.result).toBe(Result.ONGOING);
    // The occupation is real and the corner is held — but the PHASE closes the
    // gate, so no proof is even attempted.
    expect(p.phase).toBe(1);
    expect(replica.needsProof(p)).toBe(false);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    expect(p.clock).toBe(9);

    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.sq[0]).toBe(1);
  });

  it('...and IS adjudicated at END_ACTION, once the invader has paid its rent', () => {
    const state = clock9('lone-muju');
    const moved = applyAction(state, { type: 'MOVE', unitId: 'b0', to: { x: 0, y: 0 } });
    const canonical = applyAction(moved, { type: 'END_ACTION_PHASE' });
    expect(canonical.phase).toBe('victory');
    expect(canonical.winner).toBe('black');
    expect(canonical.victoryReason).toBe('home-checkmate');
    // The mate beat the tenth quiet ply, which END_PLACE would have drawn: the
    // clock never advanced, because END_ACTION does not touch it.
    expect(canonical.inactivityPlies).toBe(9);

    const p = replica.pack(moved);
    const undo = newUndo();
    expect(p.phase).toBe(1);
    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.phase).toBe(0);
    expect(p.result).toBe(Result.BLACK_WIN);
    expect(p.reason).toBe(Reason.HOME_CHECKMATE);
    expect(p.clock).toBe(9);
    expect(p.side).toBe(1); // END_ACTION never hands off
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));

    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
    expect(p.phase).toBe(1);
  });

  it('an invader that cannot pay its own upkeep is not awarded the mate', () => {
    // A tier-2 invader with an empty bank. It reaches Prepare `upkeepPending`,
    // and `resolveHomeCheckmate` bails on an upkeep-pending node — the piece may
    // be about to be released.
    const state = buildState({
      units: [
        { def: 'water_2', owner: 'black', x: 1, y: 0, id: 'b0' },
        { def: 'fire_1', owner: 'black', x: 9, y: 9, id: 'b1' },
        { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
      ],
      current: 'black',
      phase: 'action',
      actions: 4,
      black: 0,
      turnNumber: 12,
      reserves: new Array<number>(100).fill(0),
    });
    const moved = applyAction(state, { type: 'MOVE', unitId: 'b0', to: { x: 0, y: 0 } });
    expect(moved.phase).toBe('playing');
    const canonical = applyAction(moved, { type: 'END_ACTION_PHASE' });
    expect(canonical.phase).toBe('playing');
    expect(canonical.upkeepPending).toBe(true);
    expect(canonical.turn.phase).toBe('place');

    const p = replica.pack(moved);
    const undo = newUndo();
    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.upkeepPending).toBe(1);
    expect(p.phase).toBe(0);
    expect(p.result).toBe(Result.ONGOING);
    expect(replica.needsProof(p)).toBe(false);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    replica.unmake(p, undo);
    expect(p.upkeepPending).toBe(0);
  });

  it('END_ACTION does not hand off, so the draw waits for END_PLACE', () => {
    const state = clock9('rescuer');
    const move = { type: 'MOVE' as const, unitId: 'b0', to: { x: 0, y: 0 } };

    const canonicalMoved = applyAction(state, move);
    expect(canonicalMoved.phase).toBe('playing');

    const p = replica.pack(state);
    const undo = newUndo();
    replica.make(p, paMake(AKind.MOVE, 0, 0), undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonicalMoved, allocState())));

    // END_ACTION: income and upkeep only. The clock does NOT advance, so the
    // draw does not fire — that alone is the Standard/Phasing split.
    const canonicalPrepared = applyAction(canonicalMoved, { type: 'END_ACTION_PHASE' });
    expect(canonicalPrepared.phase).toBe('playing');
    expect(canonicalPrepared.inactivityPlies).toBe(9);
    expect(canonicalPrepared.turn.currentPlayer).toBe('black');
    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.clock).toBe(9);
    expect(p.side).toBe(1);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonicalPrepared, allocState())));

    // END_PLACE advances the tenth quiet ply and draws.
    const canonicalEnded = applyAction(canonicalPrepared, { type: 'END_PLACE_PHASE' });
    expect(canonicalEnded.phase).toBe('victory');
    expect(canonicalEnded.winner).toBeNull();
    expect(canonicalEnded.victoryReason).toBe('inactivity');
    expect(canonicalEnded.inactivityPlies).toBe(10);

    replica.make(p, paMake(AKind.END_PLACE), undo);
    expect(p.result).toBe(Result.DRAW);
    expect(p.reason).toBe(Reason.INACTIVITY);
    expect(p.clock).toBe(10);
    // The draw resolves BEFORE the handover, so the side to move is unchanged.
    expect(p.side).toBe(1);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonicalEnded, allocState())));

    for (let i = 0; i < 3; i++) replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.clock).toBe(9);
    expect(p.sq[0]).toBe(1);
  });

  it('the draw at END_PLACE beats an occupation that would win at the next startTurn', () => {
    // White already sits on Black's corner; Black ends a quiet tenth ply.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 5, id: 'b0' },
        { def: 'fire_1', owner: 'white', x: 9, y: 9, id: 'w0' },
        { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'w1' },
      ],
      current: 'black',
      phase: 'place',
      actions: 0,
      inactivityPlies: 9,
      turnNumber: 8,
    });
    const canonical = applyAction(state, { type: 'END_PLACE_PHASE' });
    expect(canonical.victoryReason).toBe('inactivity');
    expect(canonical.winner).toBeNull();

    const p = replica.pack(state);
    replica.make(p, paMake(AKind.END_PLACE), newUndo());
    expect(p.result).toBe(Result.DRAW);
    expect(p.reason).toBe(Reason.INACTIVITY);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
  });

  it('home occupation at END_PLACE beats the arrivals of the side it hands off to', () => {
    // White holds Black's corner, and Black is the mover: the occupation is
    // awarded at the OCCUPIER's own `startTurn` (`getHomeOccupier(board, player)`
    // reads the incoming player's units, victory.ts:103-106). White's commitment
    // on A1 would otherwise arrive on that same turn start, but `startTurn`
    // awards the occupation FIRST (turn.ts:22-27), so it stays pending and
    // unrefunded.
    const occupying = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 5, id: 'b0' },
        { def: 'fire_1', owner: 'white', x: 9, y: 9, id: 'w0' },
        { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'w1' },
      ],
      current: 'black',
      phase: 'place',
      actions: 0,
      white: 4,
      turnNumber: 8,
      pendingSummons: [{ def: 'plant_1', owner: 'white', x: 0, y: 0, id: 'never-arrives' }],
    });
    const canonical = applyAction(occupying, { type: 'END_PLACE_PHASE' });
    expect(canonical.victoryReason).toBe('home-occupation');
    expect(canonical.winner).toBe('white');
    expect(canonical.upkeepPending).toBe(false);
    expect(canonical.turn.currentPlayer).toBe('white');
    expect(canonical.turn.phase).toBe('place');
    // Nothing resolved and nothing refunded.
    expect(canonical.lastSummoning).toBeUndefined();
    expect(canonical.pendingSummons?.map(s => s.id)).toEqual(['never-arrives']);
    expect(canonical.players.white.resources).toBe(4);

    const p = replica.pack(occupying);
    const undo = newUndo();
    const before = replica.digest(p);
    replica.make(p, paMake(AKind.END_PLACE), undo);
    expect(p.result).toBe(Result.WHITE_WIN);
    expect(p.reason).toBe(Reason.HOME_OCCUPATION);
    expect(p.upkeepPending).toBe(0);
    // `startTurn`'s occupation branch sets the incoming side, Prepare and four
    // actions — even though the turn it names never happens.
    expect(p.side).toBe(0);
    expect(p.phase).toBe(0);
    expect(p.actions).toBe(4);
    expect([...p.pendCount]).toEqual([1, 0]);
    expect(p.bank[0]).toBe(4);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    replica.unmake(p, undo);
    expect(replica.digest(p)).toBe(before);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.side).toBe(1);

    // Move the occupier off the corner and the SAME position hands off normally,
    // commitment and all.
    const notOccupying = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 5, id: 'b0' },
        { def: 'fire_1', owner: 'white', x: 8, y: 9, id: 'w0' },
        { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'w1' },
      ],
      current: 'black',
      phase: 'place',
      actions: 0,
      white: 4,
      turnNumber: 8,
      pendingSummons: [{ def: 'plant_1', owner: 'white', x: 0, y: 0, id: 'arrives' }],
    });
    const q = replica.pack(notOccupying, allocState());
    replica.make(q, paMake(AKind.END_PLACE), undo);
    expect(q.result).toBe(Result.ONGOING);
    expect(q.side).toBe(0);
    expect(q.phase).toBe(1);
    expect([...q.pendCount]).toEqual([0, 0]);
    expect(replica.digest(q)).toBe(replica.digest(replica.pack(applyAction(notOccupying, { type: 'END_PLACE_PHASE' }), allocState())));
  });

  it('elimination at END_PLACE leaves the turn state untouched, side included', () => {
    // Black's last unit was released for upkeep earlier in the turn, so the
    // board is already empty for Black when White ends its Prepare.
    const state = buildState({
      units: [{ def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'w0' }],
      current: 'white',
      phase: 'place',
      actions: 0,
      turnNumber: 8,
    });
    const canonical = applyAction(state, { type: 'END_PLACE_PHASE' });
    expect(canonical.phase).toBe('victory');
    expect(canonical.winner).toBe('white');
    expect(canonical.victoryReason).toBe('elimination');
    // `startTurn` returns before it touches the turn: still White, still Prepare.
    expect(canonical.turn.currentPlayer).toBe('white');
    expect(canonical.turn.phase).toBe('place');
    // ...but the turn NUMBER was already bumped by the handover (turn.ts:128-130).
    expect(canonical.turn.turnNumber).toBe(8);

    const p = replica.pack(state);
    const undo = newUndo();
    const before = replica.digest(p);
    replica.make(p, paMake(AKind.END_PLACE), undo);
    expect(p.result).toBe(Result.WHITE_WIN);
    expect(p.reason).toBe(Reason.ELIMINATION);
    expect(p.side).toBe(0);
    expect(p.phase).toBe(0);
    expect(p.actions).toBe(0);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
    replica.unmake(p, undo);
    expect(replica.digest(p)).toBe(before);
  });

  it('elimination resolves at the attack, not at either boundary', () => {
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

  it('PAY_UPKEEP: releasing your last unit is still UPKEEP_ELIMINATION in Prepare', () => {
    const state = buildState({
      units: [
        { def: 'water_2', owner: 'white', x: 0, y: 1, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b0' },
      ],
      white: 0,
      phase: 'place',
      actions: 0,
      upkeepPending: true,
    });
    const p = replica.pack(state);
    const undo = newUndo();
    const keep = newKeepSetTable();
    expect(replica.genKeepSets(p, keep)).toBe(1); // only the empty keep-set is affordable
    replica.make(p, paMake(AKind.PAY_UPKEEP, 0), undo, keep);
    expect(p.result).toBe(Result.BLACK_WIN);
    expect(p.reason).toBe(Reason.UPKEEP_ELIMINATION);
    replica.unmake(p, undo);
    expect(p.result).toBe(Result.ONGOING);
  });

  it('needsProof is exactly the resolveHomeCheckmate short-circuit, PHASE included', () => {
    // The gate now has a phase clause, so every one of these is stated in
    // Prepare — which is the only place Phasing adjudicates at all.
    const occupied = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'black',
        phase: 'place',
        actions: 0,
      }),
    );
    expect(replica.needsProof(occupied)).toBe(true);

    // The SAME position in ACT: Phasing will not adjudicate it.
    const acting = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'black',
        phase: 'action',
      }),
      allocState(),
    );
    expect(replica.needsProof(acting)).toBe(false);

    // The other side to move: the occupier is not the mover, so no proof runs.
    const otherMover = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'white',
        phase: 'place',
        actions: 0,
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
        phase: 'place',
        actions: 0,
      }),
      allocState(),
    );
    expect(replica.needsProof(counter)).toBe(false);

    // An upkeep-pending invader has not yet survived its own rent.
    const pending = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'water_2', owner: 'black', x: 9, y: 9, id: 'b1' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'black',
        phase: 'place',
        actions: 0,
        upkeepPending: true,
      }),
      allocState(),
    );
    expect(replica.needsProof(pending)).toBe(false);

    // `victoryRule: 'elimination'` turns the whole rule off.
    const eliminationOnly = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b0' },
          { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'w0' },
        ],
        current: 'black',
        phase: 'place',
        actions: 0,
        victoryRule: 'elimination',
      }),
      allocState(),
    );
    expect(replica.needsProof(eliminationOnly)).toBe(false);
  });

  it('victoryRule "elimination" suppresses both home terminals', () => {
    const state = { ...clock9('lone-muju'), victoryRule: 'elimination' as const };
    const moved = applyAction(state, { type: 'MOVE', unitId: 'b0', to: { x: 0, y: 0 } });
    expect(moved.phase).toBe('playing');
    const canonical = applyAction(moved, { type: 'END_ACTION_PHASE' });
    expect(canonical.phase).toBe('playing');

    const p = replica.pack(state);
    const undo = newUndo();
    replica.make(p, paMake(AKind.MOVE, 0, 0), undo);
    replica.make(p, paMake(AKind.END_ACTION), undo);
    expect(p.result).toBe(Result.ONGOING);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(canonical, allocState())));
  });

  it('proverMode gates the checkmate call at END_ACTION: 2 proves, 1 under-claims, 0 asserts', () => {
    const state = clock9('lone-muju');
    const moved = applyAction(state, { type: 'MOVE', unitId: 'b0', to: { x: 0, y: 0 } });

    const full = replica.pack(moved);
    full.proverMode = 2;
    replica.make(full, paMake(AKind.END_ACTION), newUndo());
    expect(full.result).toBe(Result.BLACK_WIN);

    // Mode 1 is the admissible damage bound alone (`enoughPossibleDamage`,
    // homeCheckmate.ts:27-49): its FAILURE proves the mate, so it may only ever
    // UNDER-claim one. Here the bound is already decisive — a lone Muju ten
    // squares away at speed 1 cannot reach A1 in four actions — so modes 1 and 2
    // agree.
    const bound = replica.pack(moved, allocState());
    bound.proverMode = 1;
    replica.make(bound, paMake(AKind.END_ACTION), newUndo());
    expect(bound.result).toBe(Result.BLACK_WIN);

    // With a rescuer beside the corner the bound is satisfied, so mode 1 claims
    // nothing; the full prover searches and finds the rescue, so mode 2 claims
    // nothing either.
    const answerableMoved = applyAction(clock9('rescuer'), { type: 'MOVE', unitId: 'b0', to: { x: 0, y: 0 } });
    for (const mode of [1, 2] as const) {
      const answerable = replica.pack(answerableMoved, allocState());
      answerable.proverMode = mode;
      // Suppress the draw so only the mate question is on the table.
      answerable.clock = 0;
      replica.rehash(answerable);
      replica.make(answerable, paMake(AKind.END_ACTION), newUndo());
      expect(answerable.result, `proverMode ${mode}`).toBe(Result.ONGOING);
    }

    // Mode 0 is only legal while no enemy corner is held; ending an action phase
    // with one held asserts. (In ACT the MOVE itself no longer consults the
    // prover at all, so the assertion moved to the boundary with the gate.)
    const off = replica.pack(moved, allocState());
    off.proverMode = 0;
    expect(() => replica.make(off, paMake(AKind.END_ACTION), newUndo())).toThrow(/proverMode 0/);
  });
});
