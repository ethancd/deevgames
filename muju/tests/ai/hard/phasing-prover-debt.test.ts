// @vitest-environment node
/**
 * REGRESSION, FIXED: the packed prover used to over-claim a Phasing home
 * checkmate when the defender could not afford its own upkeep.
 *
 * This file was written as a TRIPWIRE — its last case asserted the replica's
 * wrong answer on purpose, so that porting the prover would break it. Round 4
 * ported the prover, so the tripwire has been turned round: every case now
 * asserts that the replica gives the CANONICAL answer on the same positions, and
 * the positions themselves are unchanged. Nothing was deleted; the file is the
 * regression test for the bug it used to record.
 *
 * WHAT USED TO HAPPEN
 *
 * Under Phasing the defender's rescue is act-only against its PRESENT army:
 * `searchHomeDefense` takes `rescued = isPhasing(state) ? act(ready, []) : prepare(...)`
 * (`src/game/homeCheckmate.ts:160`), and its admissible damage bound is
 * `enoughPossibleDamage(ready, target, !isPhasing(state))` — third argument
 * FALSE under Phasing (`homeCheckmate.ts:78`). Under Standard that third
 * argument is true, which means "the defender must pay upkeep before it can
 * fight, so a unit whose rent it cannot afford is released and contributes no
 * damage".
 *
 * The packed prover hardcoded the Standard answer: `damageBoundCore(dp, preparing)`
 * skipped any defender unit with `rent > cash`, and both entry points passed
 * `preparing: true` unconditionally. A BROKE defender was therefore treated as
 * having no army, the admissible bound reported "not enough possible damage", and
 * `runProver` returned MATE at `method: 1` with ZERO search nodes — never reaching
 * the rescue search that would have found the line.
 *
 * WHY IT WAS THE DANGEROUS DIRECTION
 *
 * The original M2 build report reasoned that the Standard prover could only ever
 * UNDER-claim a Phasing mate, because Standard's rescue set (upkeep releases plus
 * pre-action promotions) is strictly larger than Phasing's four actions. That is
 * true of the SEARCH and false of the BOUND: Standard's upkeep release SHRINKS a
 * broke defender's army, so the bound pruned rescues that exist. The replica
 * OVER-claimed, which is the unsound direction — a search that believes in a mate
 * it does not have — at roughly 1 position in 750,000 applied actions.
 *
 * HOW IT WAS FOUND
 *
 * `npm run hard:fuzz -- --actions 250000 --seed 7` (differential transition
 * surface), game 932, ply 90, on `END_ACTION_PHASE`: one `result` field
 * divergence, `1.4` (win, home-checkmate) against canonical's `0.0` (ongoing).
 * The repro below is that position reduced to three units.
 *
 * THE FIX
 *
 * `preparing` is gone from `tactics/prover.ts`: the bound is written for
 * `preparing === false` only, and `runProver` calls `act(0)` where it used to
 * call `prepare(0, defenderCash)`. Standard's `prepare`, its promotion arm, its
 * release arm and the witness keep-set went with it.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { HomeVerdict, PROOF_NODES, damageBound, homeVerdict, proverStats } from '../../../src/ai/hard/tactics/prover';
import { Reason, Result } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s measured on this box under load; 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const scratch = new Scratch(1, 0, 0, 1);

/**
 * White's lightning_1 sits on Black's home corner. Black's ONLY unit is a
 * tier-2 fire_2 at (7,5), whose upkeep is 1. It rescues in exactly four
 * actions — (7,7), (7,9), (8,9), then ATTACK (9,9) — so whether a mate exists
 * turns entirely on whether that unit is on the board when the defence is
 * adjudicated. `blackCash` was the whole experiment: 0 means Black cannot pay
 * the rent that Standard would charge it before it fights, and Phasing never
 * charges.
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

describe('Phasing home-checkmate: the broke defender (fixed in round 4)', () => {
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

  it('the replica agrees when the defender can afford its upkeep', () => {
    const p = replicaEndAction(position(1));
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
  });

  it('the replica agrees when the defender is BROKE — the bug this file recorded', () => {
    // This assertion used to record the opposite, and to say so in the loudest
    // terms available: with `blackCash === 0` the replica claimed
    // `WHITE_WIN`/`HOME_CHECKMATE` where canonical (first case above) says
    // ONGOING. The rent term is gone from the bound, so the two agree.
    const p = replicaEndAction(position(0));
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
  });

  it('the defender cash makes NO difference to the bound, the verdict or the node count', () => {
    // The sharper statement of the same fix: under Phasing the defender's bank is
    // not an input to home defence at all, so every observable of the prover is
    // constant in it — and equals canonical's, node for node.
    const seen = new Set<string>();
    for (const cash of [0, 1, 2, 5, 20]) {
      const post = canonicalEndAction(position(cash));
      const evidence = analyzeHomeDefenseEvidence(post, 'white', applyAction);
      const p = replica.pack(post, allocState());
      expect(damageBound(p, 0, scratch, 0)).toBe(true);
      const verdict = homeVerdict(p, 0, PROOF_NODES, scratch, 0);
      const stats = proverStats();
      expect(verdict).toBe(HomeVerdict.RESCUE);
      expect(evidence.result).toBe('rescue');
      expect(stats.nodes).toBe(evidence.nodes);
      expect(stats.method === 1).toBe(evidence.method === 'damage_bound');
      seen.add(`${verdict}/${stats.nodes}/${stats.method}`);
    }
    expect(seen.size).toBe(1);
  });
});
