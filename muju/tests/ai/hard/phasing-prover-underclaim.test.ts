// @vitest-environment node
/**
 * M2 DEBT, PINNED (second of two): the packed prover MISSES a Phasing home
 * checkmate because Standard's rescue may promote and Phasing's may not.
 *
 * This is the twin of `phasing-prover-debt.test.ts`. That file pins the BOUND
 * half of the same out-of-scope file and the replica OVER-claims there; this file
 * pins the SEARCH half, where the replica UNDER-claims. Both are
 * `src/ai/hard/tactics/prover.ts`, which design item H places outside M2, and M4
 * fixes them together. As always the canonical engine is right and the replica is
 * wrong.
 *
 * WHAT HAPPENS
 *
 * Canonical Phasing gives the defender its PRESENT army and four actions:
 * `rescued = isPhasing(state) ? act(ready, []) : prepare(0, cash, [], [])`
 * (`src/game/homeCheckmate.ts:159`). Standard's `prepare` is the larger search.
 * Per owned unit it offers three arms (`homeCheckmate.ts:146-158`):
 *
 *   1. keep it, when `rent <= cash`;
 *   2. keep it PROMOTED, when `rent + promoCost <= cash`;
 *   3. DROP it entirely — at any cash, but only for tier 2+ ("Tier 1 is
 *      mandatory, even when it blocks a rescuing attacker").
 *
 * The packed prover implements `prepare`, so it finds rescues Phasing forbids and
 * reports "no mate" where canonical awards one. Arms 2 and 3 are different
 * mechanisms and both are pinned below — arm 3 is the one the fuzzer actually hit,
 * and it is not about money at all: releasing a tier-2+ unit removes a FRIENDLY
 * BLOCKER from the attacker's path.
 *
 * HOW IT WAS FOUND
 *
 * `npm run hard:fuzz -- --actions 250000 --seed 38` (differential transition
 * surface), game 675, ply 286, on `PAY_UPKEEP`: one `result` field divergence,
 * canonical `2.4` (Black wins, home-checkmate) against the replica's `0.0`
 * (ongoing), with every other digest field byte-identical. Round 1's twenty seeds
 * never hit this direction, and the round-1 build report had reasoned it was
 * harmless precisely because Standard's rescue set is larger — which is why it
 * was never measured. It is harmless to search SOUNDNESS and still a divergence
 * from canonical, so the M2 gate must see it.
 *
 * That position had 27 units; greedy minimisation reduced it to the THREE of
 * `releasePosition` below, which still diverges, and whose mechanism is arm 3.
 * Its defender has cash 1 and no promotion within reach (`plant_2` needs 1 + 8,
 * `water_1` 0 + 4), so money cannot explain it: what Standard buys is permission
 * to take its own blocker off the board.
 *
 * The fuzzer's `classifyKnownProverGap` refused to excuse it as the over-claim
 * debt, which is how it surfaced as `unclassifiedDivergences: 1` rather than
 * being silently folded into the known count.
 *
 * WHY THIS POSITION IS THE WHOLE MECHANISM
 *
 * Black's `water_1` (defense 2) sits on White's home corner. White's only
 * defender is a `fire_1`: attack 2, which does NOT kill a defense-2 unit, so
 * Phasing's four actions cannot clear the corner and canonical awards the mate.
 * Promoted to `fire_2` it has attack 3, which does. The promotion costs exactly
 * 4 (`fire_2.cost - fire_1.cost`) and tier-1 rent is 0, so Standard's `prepare`
 * can afford it at cash 4 and not at cash 3 — and that is exactly where the two
 * engines start to disagree. The cash sweep below is therefore the experiment,
 * not decoration: 0-3 agree, 4+ diverge.
 *
 * THE FIX, WHEN M4 PORTS THE PROVER
 *
 * The same three-line change `phasing-prover-debt.test.ts` describes: pass
 * `preparing: false` at `prover.ts:720` and `prover.ts:738` and replace
 * `prepare(0, defenderCash)` at `prover.ts:750` with the act search alone. That
 * removes the promotion and keep-set arms from the rescue, which is this
 * divergence, and the rent term from the bound, which is the other one.
 *
 * WHEN THAT LANDS, the third test below starts FAILING, which is the point:
 * delete this file together with `phasing-prover-debt.test.ts` and take
 * `tests/ai/hard/prover.test.ts` out of the `vitest.config.ts` quarantine.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { getNextTierDefinition, getUnitDefinition } from '../../../src/game/units';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Reason, Result } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.3 s measured on this box under load; 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();

/** `fire_1` -> `fire_2`, the promotion the whole divergence turns on. */
const PROMO_COST = getNextTierDefinition('fire_1')!.cost - getUnitDefinition('fire_1').cost;

/**
 * Black's `water_1` occupies White's home corner (0,0). White's only defender is
 * a `fire_1` at (1,0); Black keeps a second unit in its own corner so it is not
 * eliminated. Black is the mover, so `END_ACTION_PHASE` takes it to Prepare,
 * where the Phasing mate gate runs against White.
 */
function position(whiteCash: number): GameState {
  return buildState({
    units: [
      { def: 'water_1', owner: 'black', x: 0, y: 0 },
      { def: 'fire_1', owner: 'black', x: 9, y: 9 },
      { def: 'fire_1', owner: 'white', x: 1, y: 0 },
    ],
    phase: 'action',
    actions: 0,
    current: 'black',
    white: whiteCash,
    black: 20,
    inactivityRule: 'off',
  });
}

function canonicalEndAction(state: GameState): GameState {
  return applyAction(state, { type: 'END_ACTION_PHASE' });
}

function replicaEndAction(state: GameState) {
  const p = replica.pack(state, allocState());
  replica.make(p, paMake(AKind.END_ACTION), newUndo(), newKeepSetTable());
  return p;
}

describe('Phasing home-checkmate: the promotion rescue Phasing forbids (M2 debt, M4 fix)', () => {
  it('canonical awards the mate at every cash level: a Phasing rescue cannot promote', () => {
    // The defender's wallet is irrelevant under Phasing — the rescue is act-only
    // with the present army, and attack 2 never kills defense 2.
    for (const cash of [0, 3, 4, 8]) {
      const post = canonicalEndAction(position(cash));
      expect(post.phase).toBe('victory');
      expect(post.winner).toBe('black');
      expect(post.victoryReason).toBe('home-checkmate');
    }

    // And the evidence says 'mate' rather than merely running out of budget.
    const gate = canonicalEndAction(position(0));
    expect(gate.phase).toBe('victory');
    const probe = analyzeHomeDefenseEvidence(position(4), 'black', applyAction);
    expect(probe.result).toBe('mate');
  });

  it('the replica agrees while the defender cannot afford the promotion', () => {
    // The control, and the boundary. Below the promotion cost Standard's rescue
    // set collapses onto Phasing's, and the two engines match exactly.
    expect(PROMO_COST).toBe(4);
    for (let cash = 0; cash < PROMO_COST; cash++) {
      const p = replicaEndAction(position(cash));
      expect(p.result).toBe(Result.BLACK_WIN);
      expect(p.reason).toBe(Reason.HOME_CHECKMATE);
    }
  });

  it('DEBT: the replica misses the mate once the defender can afford a promotion', () => {
    // This assertion records a BUG, not a rule. Canonical (first test above)
    // awards Black the win on this exact position at every cash level; the
    // replica stops doing so the moment White holds `PROMO_COST` crystals,
    // because the packed prover searches Standard's `prepare` and buys a
    // promotion Phasing does not allow it to buy.
    //
    // DO NOT relax this to make a change pass. When M4 makes the prover
    // Phasing-correct this test FAILS, which is the tripwire: delete this file
    // and `phasing-prover-debt.test.ts`, and take
    // `tests/ai/hard/prover.test.ts` out of the vitest.config.ts quarantine.
    for (const cash of [PROMO_COST, PROMO_COST + 1, PROMO_COST + 4]) {
      const p = replicaEndAction(position(cash));
      expect(p.result).toBe(Result.ONGOING);
      expect(p.reason).toBe(Reason.NONE);
    }
  });
});

/**
 * The seed-38 position itself, minimised from 27 units to three. Black's
 * `lightning_1` (defense 1) holds White's home corner. White's `water_1`
 * (speed 1, attack 2) could walk (4,0) -> (3,0) -> (2,0) -> (1,0) and kill it in
 * exactly four actions — but White's own `plant_2` stands on (3,0) and blocks the
 * only route reachable at speed 1. White has 1 crystal, so no promotion is
 * affordable to anything. The one thing Standard can do and Phasing cannot is
 * DROP the tier-2 `plant_2` (arm 3) and walk through the square it vacated.
 */
function releasePosition(): GameState {
  return buildState({
    units: [
      { def: 'lightning_1', owner: 'black', x: 0, y: 0 },
      { def: 'plant_2', owner: 'white', x: 3, y: 0 },
      { def: 'water_1', owner: 'white', x: 4, y: 0 },
    ],
    phase: 'action',
    actions: 0,
    current: 'black',
    white: 1,
    black: 2,
    inactivityRule: 'off',
  });
}

describe('Phasing home-checkmate: the blocker release Phasing forbids (M2 debt, M4 fix)', () => {
  it('canonical mates with the blocker on the board and rescues without it', () => {
    // This pair IS the mechanism, measured on the canonical engine alone, so it
    // stands whatever the replica does. Phasing keeps the blocker, so: mate.
    const withBlocker = applyAction(releasePosition(), { type: 'END_ACTION_PHASE' });
    expect(withBlocker.phase).toBe('victory');
    expect(withBlocker.winner).toBe('black');
    expect(withBlocker.victoryReason).toBe('home-checkmate');

    // Take the tier-2 unit off the board — exactly what Standard's arm 3 does —
    // and the same defender rescues in four actions.
    const freed = buildState({
      units: [
        { def: 'lightning_1', owner: 'black', x: 0, y: 0 },
        { def: 'water_1', owner: 'white', x: 4, y: 0 },
      ],
      phase: 'action',
      actions: 0,
      current: 'black',
      white: 1,
      black: 2,
      inactivityRule: 'off',
    });
    const evidence = analyzeHomeDefenseEvidence(freed, 'black', applyAction);
    expect(evidence.result).toBe('rescue');
    expect(evidence.witness?.map(a => a.type)).toEqual(['MOVE', 'MOVE', 'MOVE', 'ATTACK']);
  });

  it('the defender cannot afford any promotion here, so money cannot explain it', () => {
    // Guards the reading of the test above: if a future catalogue made a
    // promotion affordable at cash 1, this file would silently start testing
    // arm 2 twice instead of covering arm 3 at all.
    const plant2 = getUnitDefinition('plant_2');
    const water1 = getUnitDefinition('water_1');
    expect(getNextTierDefinition('plant_2')!.cost - plant2.cost + 1).toBeGreaterThan(1);
    expect(getNextTierDefinition('water_1')!.cost - water1.cost).toBeGreaterThan(1);
    expect(plant2.tier).toBe(2);
  });

  it('DEBT: the replica misses this mate because it may release its own blocker', () => {
    // Records a BUG. Canonical awards Black the win on this exact position (first
    // test above); the replica reports ongoing because the packed prover searches
    // Standard's `prepare` and drops the `plant_2` that Phasing requires it to
    // keep. This is the shape the differential fuzzer found at seed 38.
    //
    // DO NOT relax this to make a change pass. When M4 makes the prover
    // Phasing-correct this test FAILS — that is the tripwire.
    const p = replicaEndAction(releasePosition());
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
  });
});
