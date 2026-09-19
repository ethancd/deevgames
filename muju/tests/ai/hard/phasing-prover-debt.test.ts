// @vitest-environment node
/**
 * M2 DEBT, PINNED: the packed prover over-claims a Phasing home checkmate when
 * the defender cannot afford its own upkeep.
 *
 * This file exists to make one known divergence impossible to forget. It is the
 * only place in the replica layer where a test records the replica DISAGREEING
 * with the canonical engine, and it says exactly why, exactly where, and what
 * deletes it. Everything here is a reproduction, not a licence: the canonical
 * engine is right, the replica is wrong, and the fix is out of M2's scope
 * (`tactics/prover.ts` belongs to M4 along with gen/** and PVS).
 *
 * WHAT HAPPENS
 *
 * Under Phasing the defender's rescue is act-only against its PRESENT army:
 * `searchHomeDefense` takes `rescued = isPhasing(state) ? act(ready, []) : prepare(...)`
 * (`src/game/homeCheckmate.ts:159`), and its admissible damage bound is
 * `enoughPossibleDamage(ready, target, !isPhasing(state))` — third argument
 * FALSE under Phasing (`homeCheckmate.ts:79`). Under Standard that third
 * argument is true, which means "the defender must pay upkeep before it can
 * fight, so a unit whose rent it cannot afford is released and contributes no
 * damage".
 *
 * The packed prover hardcodes the Standard answer. `damageBoundCore(dp, preparing)`
 * skips any defender unit with `rent > cash` (`src/ai/hard/tactics/prover.ts:418`),
 * and both entry points the replica reaches pass `preparing: true`
 * unconditionally — `damageBound` at `prover.ts:720` and `runProver` at
 * `prover.ts:738`. So a BROKE defender is treated as having no army, the
 * admissible bound reports "not enough possible damage", and `runProver` returns
 * MATE at `method: 1` with ZERO search nodes. It never reaches the rescue search
 * that would have found the line.
 *
 * WHY THIS IS THE DANGEROUS DIRECTION
 *
 * The M2 build report reasoned that the Standard prover could only ever
 * UNDER-claim a Phasing mate, because Standard's rescue set (upkeep releases
 * plus pre-action promotions) is strictly larger than Phasing's four actions.
 * That is true of the SEARCH and false of the BOUND: Standard's upkeep release
 * SHRINKS a broke defender's army, so the bound prunes rescues that exist. The
 * replica therefore OVER-claims, which is the unsound direction — a search that
 * believes in a mate it does not have.
 *
 * HOW IT WAS FOUND
 *
 * `npm run hard:fuzz -- --actions 250000 --seed 7` (differential transition
 * surface), game 932, ply 90, on `END_ACTION_PHASE`: one `result` field
 * divergence, `1.4` (win, home-checkmate) against canonical's `0.0` (ongoing).
 * Rate over eight seeds x 250,000 actions: 1 in 2,000,000 applied actions.
 * The repro below is that position reduced to three units.
 *
 * THE FIX, WHEN M4 PORTS THE PROVER
 *
 * Pass `preparing: false` at `prover.ts:720` and `prover.ts:738` (the replica is
 * Phasing-only, so `!isPhasing(state)` is constantly false), and replace
 * `prepare(0, defenderCash)` at `prover.ts:750` with the act search alone. The
 * `preparing: true` branch and `prepare` itself then become dead code.
 *
 * WHEN THAT LANDS, the third test below starts FAILING, which is the point:
 * delete this whole file and let `tests/ai/hard/prover.test.ts` out of
 * quarantine instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Reason, Result } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s measured on this box under load; 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();

/**
 * White's lightning_1 sits on Black's home corner. Black's ONLY unit is a
 * tier-2 fire_2 at (7,5), whose upkeep is 1. It rescues in exactly four
 * actions — (7,7), (7,9), (8,9), then ATTACK (9,9) — so whether a mate exists
 * turns entirely on whether that unit is on the board when the defence is
 * adjudicated. `blackCash` is the whole experiment: 0 means Black cannot pay
 * the rent that Standard would charge it before it fights.
 */
function position(blackCash: number): GameState {
  return buildState({
    units: [
      { def: 'lightning_1', owner: 'white', x: 9, y: 9 },
      { def: 'fire_1', owner: 'white', x: 0, y: 0 },
      { def: 'fire_2', owner: 'black', x: 7, y: 5 },
    ],
    phase: 'action',
    actions: 0,
    current: 'white',
    white: 6,
    black: blackCash,
    inactivityRule: 'off',
  });
}

/** `END_ACTION_PHASE` through the canonical engine, which is where the Phasing
 * mate gate runs (`resolveHomeCheckmate`, phase 'place', no upkeep pending). */
function canonicalEndAction(state: GameState): GameState {
  return applyAction(state, { type: 'END_ACTION_PHASE' });
}

/** The same transition through the replica. */
function replicaEndAction(state: GameState) {
  const p = replica.pack(state, allocState());
  replica.make(p, paMake(AKind.END_ACTION), newUndo(), newKeepSetTable());
  return p;
}

describe('Phasing home-checkmate: the broke defender (M2 debt, M4 fix)', () => {
  it('canonical does not award a mate: Phasing rescues act-only with the present army', () => {
    for (const cash of [0, 1]) {
      const post = canonicalEndAction(position(cash));
      // The gate ran — phase 'place', no upkeep pending — and found a rescue.
      expect(post.turn.phase).toBe('place');
      expect(post.upkeepPending ?? false).toBe(false);
      expect(post.phase).toBe('playing');
      expect(post.winner).toBeNull();
      expect(post.victoryReason).toBeUndefined();

      const evidence = analyzeHomeDefenseEvidence(post, 'white', applyAction);
      expect(evidence.result).toBe('rescue');
      // Four actions, the last of them the kill: Black's rent never came up.
      expect(evidence.witness?.map(a => a.type)).toEqual(['MOVE', 'MOVE', 'MOVE', 'ATTACK']);
    }
  });

  it('the replica agrees as soon as the defender can afford its upkeep', () => {
    // The control. One crystal is the whole difference: with it, Standard's
    // release term does not fire, the bound admits the fire_2, the rescue search
    // runs and finds the same line the canonical engine did.
    const p = replicaEndAction(position(1));
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
  });

  it('DEBT: the replica over-claims a mate when the defender is broke', () => {
    // This assertion records a BUG, not a rule. See the file header: the cause
    // is `preparing: true` at prover.ts:720/738 feeding prover.ts:418, which
    // drops a defender unit whose rent exceeds its cash — Standard's rule, not
    // Phasing's. Canonical (first test above) says ONGOING on this exact
    // position, so the replica is wrong here and the canonical engine is right.
    //
    // DO NOT relax this to make a change pass. When M4 makes the prover
    // Phasing-correct this test FAILS, which is the tripwire: delete this file
    // and take `tests/ai/hard/prover.test.ts` out of the vitest.config.ts
    // quarantine list instead.
    const p = replicaEndAction(position(0));
    expect(p.result).toBe(Result.WHITE_WIN);
    expect(p.reason).toBe(Reason.HOME_CHECKMATE);

    // ...and it is reached by the admissible bound with no search at all, which
    // is why no amount of node budget hides it.
    const post = canonicalEndAction(position(0));
    expect(analyzeHomeDefenseEvidence(post, 'white', applyAction).nodes).toBeGreaterThan(0);
  });
});
