// @vitest-environment node
/**
 * `progressThisTurn` is in `Kturn` (`core/zobrist.ts`'s `progress` plane).
 *
 * THE ALIAS THIS FILE EXISTS FOR. `progress` is set by a capture and cleared at
 * the hand-off, and until round 4 it was in NO key. Under Standard that was
 * survivable: the capture that sets it leaves `atkCount` and `F_LAST_KILLED`
 * evidence on the killer, and `Kturn` hashes both, so two states that differed in
 * `progress` differed in `Kturn` too. Under PHASING the evidence can be ERASED
 * inside the same turn — `END_ACTION` settles the mover's own upkeep and
 * `PAY_UPKEEP` can RELEASE the very body that made the capture, taking its square,
 * its attack count and its kill flag off the board with it.
 *
 * What is left is two reachable Prepare-phase states that agree on `Kpos` and on
 * every `Kturn` extra and differ only in `progress`, whose `END_PLACE` successors
 * differ: one hands off with the inactivity clock reset to 0 (a capture happened
 * this turn), the other with it INCREMENTED (a quiet turn). A within-turn
 * transposition table that shared an entry between them would answer with the
 * wrong clock — and the inactivity draw is a terminal, so that is a wrong game
 * result, not a wrong heuristic.
 *
 * The line below is that alias, played through both engines:
 *
 *   A. White's `fire_2` on (1,1) ATTACKs Black's `water_1` on (1,2) and kills it
 *      -> `progress = 1`, clock 0. Then `END_ACTION`, then `PAY_UPKEEP` RELEASING
 *      the `fire_2`.
 *   B. The same board with no `water_1` at all: `END_ACTION`, then the same
 *      `PAY_UPKEEP` releasing the same `fire_2`.
 *
 * Both end in Prepare with the same units on the same squares, the same banks,
 * the same reserves and the same clock. Only `progress` differs.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction, } from '../../../src/ai/types';
import type { GameState } from '../../../src/game/types';
import { AKind, newKeepSetTable, paMake, toAIAction } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Z, recomputeKpos, recomputeKturn } from '../../../src/ai/hard/core/zobrist';
import { INACTIVITY_LIMIT } from '../../../src/game/inactivity';
import type { PackedState } from '../../../src/ai/hard/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s measured on this box under load; 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const undo = newUndo();
const keep = newKeepSetTable();

/**
 * The shared board. `withVictim` is the only difference between the two branches:
 * a Black `water_1` on (1,2), adjacent to White's `fire_2`, which the `fire_2`
 * kills in one hit. Each side keeps a spare body in its own corner so neither is
 * eliminated. `reviewUpkeep` is on for White so `END_ACTION` stops for an explicit
 * `PAY_UPKEEP` instead of settling automatically — the release has to be a
 * decision for the alias to exist.
 */
function board(withVictim: boolean): GameState {
  return buildState({
    units: [
      { def: 'fire_2', owner: 'white', x: 1, y: 1, id: 'killer' },
      { def: 'fire_1', owner: 'white', x: 8, y: 8, id: 'spare' },
      { def: 'lightning_1', owner: 'black', x: 9, y: 9, id: 'bspare' },
      ...(withVictim ? [{ def: 'water_1', owner: 'black' as const, x: 1, y: 2, id: 'victim' }] : []),
    ],
    current: 'white',
    phase: 'action',
    actions: 4,
    white: 0,
    black: 0,
    reviewUpkeep: { white: true, black: true },
  });
}

interface Branch {
  p: PackedState;
  state: GameState;
}

/**
 * Plays the branch in BOTH engines, step by step, asserting after every action
 * that the replica's whole packed state still equals the canonical engine's and
 * that `check` (which recomputes `Kturn` from scratch, `progress` included) is
 * happy. An unmake identity check follows each action, so a `setProgress` that
 * forgot to XOR on the way back out fails here.
 */
function play(withVictim: boolean): Branch {
  let state = board(withVictim);
  const p = replica.pack(state, allocState());
  const killer = p.pieceAt[11];

  const step = (pa: number, action: AIAction): void => {
    const before = replica.digest(p);
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(p, pa, undo, keep);
    replica.unmake(p, undo);
    expect(replica.digest(p), 'unmake identity').toBe(before);
    undo.top = 0;
    replica.resetUndoScratch();
    replica.make(p, pa, undo, keep);
    state = applyAction(state, action);
    expect(replica.digest(p)).toBe(replica.digest(replica.pack(state, allocState())));
    replica.check(p);
  };

  if (withVictim) {
    step(paMake(AKind.ATTACK, killer, 21, 0), { type: 'ATTACK', unitId: 'killer', targetPosition: { x: 1, y: 2 } });
    expect(p.progress).toBe(1);
  }
  step(paMake(AKind.END_ACTION), { type: 'END_ACTION_PHASE' });
  expect(p.upkeepPending).toBe(1);

  // The keep-set that RELEASES the killer, which is what erases the evidence.
  const count = replica.genKeepSets(p, keep);
  let releasing = -1;
  for (let i = 0; i < count; i++) {
    const action = toAIAction(p, paMake(AKind.PAY_UPKEEP, i), keep);
    if (action.type === 'PAY_UPKEEP' && !action.keepUnitIds.includes('killer')) releasing = i;
  }
  expect(releasing, 'a keep-set releasing the killer must be on offer').toBeGreaterThanOrEqual(0);
  step(paMake(AKind.PAY_UPKEEP, releasing), toAIAction(p, paMake(AKind.PAY_UPKEEP, releasing), keep));
  expect(p.pieceAt[11]).toBe(255);

  return { p, state };
}

/** The one `progress` key, as a `{lo, hi}` pair. */
const PROGRESS_KEY = { lo: Z.progress[0], hi: Z.progress[1] };

describe('the progress plane: the Phasing Kturn alias', () => {
  it('two reachable Prepare states share Kpos and every other Kturn extra, and differ only in progress', () => {
    const a = play(true);
    const b = play(false);

    // Same position, by every surface that is not the key itself.
    expect(a.p.kposLo).toBe(b.p.kposLo);
    expect(a.p.kposHi).toBe(b.p.kposHi);
    expect(a.p.phase).toBe(b.p.phase);
    expect(a.p.actions).toBe(b.p.actions);
    expect(a.p.upkeepPending).toBe(b.p.upkeepPending);
    expect(a.p.clock).toBe(b.p.clock);
    expect(a.p.side).toBe(b.p.side);
    for (let s = 0; s < 100; s++) expect(a.p.pieceAt[s], `square ${s}`).toBe(b.p.pieceAt[s]);

    // ...and `progress` is the ONLY thing that differs.
    expect(a.p.progress).toBe(1);
    expect(b.p.progress).toBe(0);

    // THE FIX. Before the plane existed these two shared `Kturn` exactly, so a
    // within-turn TT would have served one's entry for the other.
    expect(a.p.kturnLo === b.p.kturnLo && a.p.kturnHi === b.p.kturnHi).toBe(false);

    // And they differ by EXACTLY the progress key — nothing else moved, which is
    // what makes this a one-plane change rather than a re-keying.
    expect((a.p.kturnLo ^ PROGRESS_KEY.lo) >>> 0).toBe(b.p.kturnLo);
    expect((a.p.kturnHi ^ PROGRESS_KEY.hi) >>> 0).toBe(b.p.kturnHi);
  });

  it('the alias was MEANINGFUL: the two successors hand off with different clocks', () => {
    // If the successors agreed, sharing a TT entry would have been harmless and
    // the plane would be dead weight. They do not: the capture branch resets the
    // inactivity clock, the quiet branch advances it, and the canonical engine
    // agrees with the replica on both.
    for (const [withVictim, expectedClock] of [[true, 0], [false, 1]] as const) {
      const branch = play(withVictim);
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(branch.p, paMake(AKind.END_PLACE), undo, keep);
      const canonical = applyAction(branch.state, { type: 'END_PLACE_PHASE' });
      expect(branch.p.clock).toBe(expectedClock);
      expect(canonical.inactivityPlies ?? 0).toBe(expectedClock);
      expect(replica.digest(branch.p)).toBe(replica.digest(replica.pack(canonical, allocState())));
      // And the hand-off cleared `progress`, which is the next point.
      expect(branch.p.progress).toBe(0);
    }
  });
});

describe('the progress plane: what it does NOT move', () => {
  it('Kpos is untouched by progress', () => {
    const p = replica.pack(board(true), allocState());
    const before = recomputeKpos(p);
    p.progress = p.progress === 1 ? 0 : 1;
    const after = recomputeKpos(p);
    expect(after.lo).toBe(before.lo);
    expect(after.hi).toBe(before.hi);
  });

  it('every MACRO-BOUNDARY key is bit-identical to the pre-plane one', () => {
    // The plane contributes nothing when `progress === 0`, and `progress` is 0 at
    // every hand-off by construction (`turn.ts:120-124` clears it). So no key that
    // the macro TT, the book or the perft fixtures ever store has moved — which is
    // why this could be an append-only plane rather than a re-keying. Walked over a
    // real game rather than asserted about one position.
    const rng = (() => {
      let x = 0x50524f47;
      return () => {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        return x / 0x100000000;
      };
    })();
    const p = replica.pack(board(true), allocState());
    const genBuffer = new Int32Array(4 + 128 * 104);
    let boundaries = 0;
    let progressSeen = 0;
    for (let ply = 0; ply < 400; ply++) {
      if (p.result !== 0) break;
      let count: number;
      if (p.upkeepPending === 1) {
        count = replica.genKeepSets(p, keep);
        for (let i = 0; i < count; i++) genBuffer[i] = paMake(AKind.PAY_UPKEEP, i);
      } else if (p.phase === 0) {
        count = replica.genPlace(p, genBuffer);
      } else {
        count = replica.genActions(p, genBuffer);
      }
      if (count === 0) break;
      // Biased towards ATTACK: `progress` is only ever set by a capture, and a
      // uniform walk over four units almost never captures, which would leave the
      // second half of this assertion vacuous.
      let chosen = genBuffer[Math.floor(rng() * count)];
      if (rng() < 0.7) {
        for (let i = 0; i < count; i++) {
          if ((genBuffer[i] & 0x7) === AKind.ATTACK) {
            chosen = genBuffer[i];
            break;
          }
        }
      }
      undo.top = 0;
      replica.resetUndoScratch();
      replica.make(p, chosen, undo, keep);
      if (p.progress === 1) progressSeen++;
      if ((chosen & 0x7) === AKind.END_PLACE) {
        boundaries++;
        // At a hand-off the plane contributed nothing, so `Kturn` is exactly the
        // XOR it was before the plane existed.
        expect(p.progress).toBe(0);
        const key = recomputeKturn(p);
        expect(p.kturnLo).toBe(key.lo);
        expect(p.kturnHi).toBe(key.hi);
        expect((key.lo ^ PROGRESS_KEY.lo) >>> 0).not.toBe(key.lo);
      }
    }
    // The walk has to have crossed several hand-offs AND set `progress` somewhere,
    // or it proves nothing about either half.
    expect(boundaries).toBeGreaterThan(3);
    expect(progressSeen).toBeGreaterThan(0);
    expect(INACTIVITY_LIMIT).toBeGreaterThan(0);
  });
});
