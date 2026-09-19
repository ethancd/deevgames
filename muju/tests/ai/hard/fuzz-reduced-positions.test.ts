// @vitest-environment node
/**
 * THERE IS NO KNOWN GAP ANY MORE. This file used to pin
 * `classifyKnownProverGap` — the fuzzer's narrow classifier for the two prover
 * divergence classes M2 knowingly carried — from both sides. Round 4 ported
 * `tactics/prover.ts` to Phasing's ACT-ONLY home defence, so both classes are
 * closed, the classifier is deleted and `--allow-known-prover-gap` is gone with
 * it: every divergence fails every run.
 *
 * The file was kept rather than removed, because the POSITIONS in it are the
 * evidence. Each one was reduced from a real fuzz divergence and each one used to
 * produce a verdict split; every case below now asserts that the replica and the
 * canonical engine agree on the whole packed state, field for field, on that same
 * position. What was a classifier's positive case is a regression test, and what
 * was a classifier's REFUSAL case — "a mate over-claim against a solvent
 * defender must never be excused" — is now simply a position on which no
 * over-claim happens at all.
 *
 * The three positions, and what each used to break:
 *
 *   - `position(blackCash)` — the seed-7 over-claim (the BOUND). The replica
 *     claimed `WHITE_WIN`/`HOME_CHECKMATE` where canonical played on, because
 *     `damageBoundCore` dropped a defender unit whose rent exceeded its cash.
 *     `blackCash` is the whole experiment: 0 was broke, 1 was solvent, and the
 *     verdict must now be the same at both.
 *   - `underclaimPair(whiteCash)` — the promotion arm of the under-claim (the
 *     SEARCH). The replica missed canonical's mate as soon as the defender could
 *     afford `fire_1 -> fire_2`.
 *   - `releasePair()` — the blocker-release arm, minimised from the real seed-38
 *     position to three units. No promotion is affordable there at all; what
 *     Standard bought was permission to drop its own tier-2 blocker.
 *
 * `tests/ai/hard/phasing-prover-{debt,underclaim}.test.ts` carry the same
 * positions with the canonical-engine reasoning spelled out. This file is the
 * packed-state-equality half: not "the verdicts agree" but "nothing at all
 * differs".
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { NO_SLOT, Reason, Result, type PackedState } from '../../../src/ai/hard/types';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { getNextTierDefinition, getUnitDefinition } from '../../../src/game/units';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s measured on this box under load; 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();

/**
 * The same three-unit position `phasing-prover-debt.test.ts` reduces the seed-7
 * fuzz divergence to. `blackCash` is the whole experiment: 0 means Black cannot
 * pay the rent Standard would have charged it before it fights, which was the
 * exact precondition of the hardcoded `preparing: true`.
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

/** The replica's END_ACTION result, and the canonical engine's, as packed states. */
function bothEngines(blackCash: number): { replicaP: PackedState; canonicalP: PackedState } {
  return endActionPair(position(blackCash));
}

function endActionPair(start: GameState): { replicaP: PackedState; canonicalP: PackedState } {
  const replicaP = replica.pack(start, allocState());
  replica.make(replicaP, paMake(AKind.END_ACTION), newUndo(), newKeepSetTable());
  const canonicalP = replica.pack(applyAction(start, { type: 'END_ACTION_PHASE' }), allocState());
  return { replicaP, canonicalP };
}

/** `fire_1` -> `fire_2`: the promotion the under-claim class turned on. */
const PROMO_COST = getNextTierDefinition('fire_1')!.cost - getUnitDefinition('fire_1').cost;

/**
 * The under-claim position of `phasing-prover-underclaim.test.ts`: Black's
 * `water_1` (defense 2) on White's home corner, White's lone `fire_1` (attack 2)
 * unable to kill it in four actions unless Standard lets it promote first.
 */
function underclaimPair(whiteCash: number): { replicaP: PackedState; canonicalP: PackedState } {
  return endActionPair(
    buildState({
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
    }),
  );
}

/**
 * The arm-3 position, minimised from the real seed-38 divergence: White's own
 * tier-2 `plant_2` blocks the `water_1` that would otherwise reach Black's
 * occupier in four steps, and White's 1 crystal affords no promotion at all.
 */
function releasePair(): { replicaP: PackedState; canonicalP: PackedState } {
  return endActionPair(
    buildState({
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
    }),
  );
}

/** Total rent the given side owes on the board, from the live catalogue. */
function rentOf(p: PackedState, side: number): number {
  const cat = activeCatalog();
  let rent = 0;
  for (let s = 0; s < 100; s++) {
    const slot = p.pieceAt[s];
    if (slot === NO_SLOT || p.owner[slot] !== side) continue;
    rent += cat.upkeep[p.defId[slot]];
  }
  return rent;
}

describe('the over-claim half (the bound) no longer diverges', () => {
  it('a BROKE defender: the whole packed state agrees, verdict included', () => {
    const { replicaP, canonicalP } = bothEngines(0);
    // The precondition that used to cause the over-claim is still in force: the
    // defender really cannot pay the rent Standard would have charged it.
    expect(rentOf(canonicalP, 1)).toBeGreaterThan(canonicalP.bank[1]);
    // And it no longer matters. `digest` is the 25-field comparison surface, so
    // this is stronger than "the verdicts match".
    expect(replica.digest(replicaP)).toBe(replica.digest(canonicalP));
    expect(replicaP.result).toBe(Result.ONGOING);
    expect(replicaP.reason).toBe(Reason.NONE);
  });

  it('a SOLVENT defender: the same, which it always did', () => {
    const { replicaP, canonicalP } = bothEngines(1);
    expect(rentOf(canonicalP, 1)).toBeLessThanOrEqual(canonicalP.bank[1]);
    expect(replica.digest(replicaP)).toBe(replica.digest(canonicalP));
    expect(replicaP.result).toBe(Result.ONGOING);
  });

  it('the defender bank is not an input to Phasing home defence at all', () => {
    // The over-claim WAS a dependence on the defender's bank. With the rent term
    // gone, the verdict has to be constant in it — the sharpest statement of the
    // fix that this position can make.
    const verdicts = new Set<string>();
    for (const cash of [0, 1, 2, 3, 7, 19]) {
      const { replicaP, canonicalP } = bothEngines(cash);
      expect(replica.digest(replicaP)).toBe(replica.digest(canonicalP));
      verdicts.add(`${replicaP.result}.${replicaP.reason}`);
    }
    expect([...verdicts]).toEqual([`${Result.ONGOING}.${Reason.NONE}`]);
  });
});

describe('the under-claim half (the search) no longer diverges', () => {
  it('the promotion arm: the replica awards canonical mate at and above the promotion cost', () => {
    for (const cash of [PROMO_COST, PROMO_COST + 1, PROMO_COST + 4]) {
      const { replicaP, canonicalP } = underclaimPair(cash);
      expect(canonicalP.result).toBe(Result.BLACK_WIN);
      expect(canonicalP.reason).toBe(Reason.HOME_CHECKMATE);
      expect(replica.digest(replicaP)).toBe(replica.digest(canonicalP));
    }
  });

  it('the promotion arm: below the cost too, where the two rescue sets always coincided', () => {
    const { replicaP, canonicalP } = underclaimPair(PROMO_COST - 1);
    expect(canonicalP.result).toBe(Result.BLACK_WIN);
    expect(replica.digest(replicaP)).toBe(replica.digest(canonicalP));
  });

  it('the RELEASE arm, which no amount of cash explains', () => {
    // The seed-38 mechanism: the defender holds 1 crystal and no promotion is
    // within reach, so the Standard-only resource was permission to drop its own
    // tier-2 blocker. Phasing keeps the blocker, and so now does the replica.
    const { replicaP, canonicalP } = releasePair();
    expect(canonicalP.result).toBe(Result.BLACK_WIN);
    expect(canonicalP.reason).toBe(Reason.HOME_CHECKMATE);
    expect(replica.digest(replicaP)).toBe(replica.digest(canonicalP));
  });

  it('the release position really does afford no promotion, so the arm is arm 3', () => {
    // Guards the reading of the case above: if a future catalogue made a promotion
    // affordable at cash 1, this file would silently start covering the promotion
    // arm twice instead of covering the release arm at all.
    const plant2 = getUnitDefinition('plant_2');
    const water1 = getUnitDefinition('water_1');
    expect(getNextTierDefinition('plant_2')!.cost - plant2.cost + 1).toBeGreaterThan(1);
    expect(getNextTierDefinition('water_1')!.cost - water1.cost).toBeGreaterThan(1);
    expect(plant2.tier).toBe(2);
  });
});
