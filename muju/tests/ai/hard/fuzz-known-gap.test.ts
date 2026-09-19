// @vitest-environment node
/**
 * The fuzzer's known-gap classifier, pinned from both sides.
 *
 * M2 knowingly carries TWO divergence classes, both in the out-of-scope
 * `tactics/prover.ts`, failing in opposite directions:
 * `overclaim-broke-defender` (the bound — see
 * `tests/ai/hard/phasing-prover-debt.test.ts`) and
 * `underclaim-standard-rescue` (the search — see
 * `tests/ai/hard/phasing-prover-underclaim.test.ts`).
 * `docs/hard-ai/phasing/M2-STATUS.md` §2 is the ledger.
 *
 * `classifyKnownProverGap` (lab/hard-ai/fuzz/differential.ts) exists so that a
 * divergence which is NOT that debt can never hide behind it: `fuzz/run.ts`
 * splits `divergences` into `knownProverGapDivergences` and
 * `unclassifiedDivergences`, and `--allow-known-prover-gap` tolerates only the
 * former. That makes this predicate load-bearing for the M2 gate, so it is
 * tested in both directions — it must recognise the real debt, and it must
 * REFUSE anything else, including a mate over-claim against a solvent defender,
 * which would be a genuine new bug wearing the same shape.
 *
 * A classifier that is too generous silently converts a real regression into a
 * tolerated one. Every negative case below is therefore a case the M2 gate must
 * keep failing on.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { AKind, newKeepSetTable, paMake } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { NO_SLOT, Reason, Result, type PackedState } from '../../../src/ai/hard/types';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { getNextTierDefinition, getUnitDefinition } from '../../../src/game/units';
import { classifyKnownProverGap } from '../../../lab/hard-ai/fuzz/differential';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s measured on this box under load; 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();

/**
 * The same three-unit position `phasing-prover-debt.test.ts` reduces the seed-7
 * fuzz divergence to. `blackCash` is the whole experiment: 0 means Black cannot
 * pay the rent Standard would charge it before it fights, which is the exact
 * precondition of the hardcoded `preparing: true`.
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
  const start = position(blackCash);
  const replicaP = replica.pack(start, allocState());
  replica.make(replicaP, paMake(AKind.END_ACTION), newUndo(), newKeepSetTable());
  const canonicalP = replica.pack(applyAction(start, { type: 'END_ACTION_PHASE' }), allocState());
  return { replicaP, canonicalP };
}

/** `fire_1` -> `fire_2`: the promotion the under-claim class turns on. */
const PROMO_COST = getNextTierDefinition('fire_1')!.cost - getUnitDefinition('fire_1').cost;

/**
 * The under-claim position of `phasing-prover-underclaim.test.ts`: Black's
 * `water_1` (defense 2) on White's home corner, White's lone `fire_1` (attack 2)
 * unable to kill it in four actions unless Standard lets it promote first.
 */
function underclaimPair(whiteCash: number): { replicaP: PackedState; canonicalP: PackedState } {
  const start = buildState({
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
  const replicaP = replica.pack(start, allocState());
  replica.make(replicaP, paMake(AKind.END_ACTION), newUndo(), newKeepSetTable());
  const canonicalP = replica.pack(applyAction(start, { type: 'END_ACTION_PHASE' }), allocState());
  return { replicaP, canonicalP };
}

/**
 * The arm-3 position, minimised from the real seed-38 divergence: White's own
 * tier-2 `plant_2` blocks the `water_1` that would otherwise reach Black's
 * occupier in four steps, and White's 1 crystal affords no promotion at all.
 */
function releasePair(): { replicaP: PackedState; canonicalP: PackedState } {
  const start = buildState({
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
  const replicaP = replica.pack(start, allocState());
  replica.make(replicaP, paMake(AKind.END_ACTION), newUndo(), newKeepSetTable());
  const canonicalP = replica.pack(applyAction(start, { type: 'END_ACTION_PHASE' }), allocState());
  return { replicaP, canonicalP };
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

describe('classifyKnownProverGap: the over-claim half (the bound)', () => {
  it('recognises the real M2 debt: a mate over-claim against a broke defender', () => {
    const { replicaP, canonicalP } = bothEngines(0);

    // The divergence this classifier is for, still live.
    expect(replicaP.result).toBe(Result.WHITE_WIN);
    expect(replicaP.reason).toBe(Reason.HOME_CHECKMATE);
    expect(canonicalP.result).toBe(Result.ONGOING);
    // ...and the defender really is short of its rent, which is the cause.
    expect(rentOf(canonicalP, 1)).toBeGreaterThan(canonicalP.bank[1]);

    expect(classifyKnownProverGap(replicaP, canonicalP)).toBe('overclaim-broke-defender');
  });

  it('refuses a position where the two engines agree', () => {
    // No divergence at all: the classifier must not claim one is excused.
    const { replicaP, canonicalP } = bothEngines(1);
    expect(replicaP.result).toBe(Result.ONGOING);
    expect(canonicalP.result).toBe(Result.ONGOING);
    expect(classifyKnownProverGap(replicaP, canonicalP)).toBeNull();
  });

  it('REFUSES a mate over-claim against a SOLVENT defender', () => {
    // The case that matters. Same shape as the debt — identical position, the
    // replica claiming a home-checkmate win, the canonical engine still playing
    // — but the defender can pay its rent, so Standard's release term cannot be
    // the cause and this would be a NEW bug. The gate must keep failing on it.
    const { replicaP, canonicalP } = bothEngines(1);
    expect(rentOf(canonicalP, 1)).toBeLessThanOrEqual(canonicalP.bank[1]);

    replicaP.result = Result.WHITE_WIN;
    replicaP.reason = Reason.HOME_CHECKMATE;

    expect(classifyKnownProverGap(replicaP, canonicalP)).toBeNull();
  });

  it('refuses a verdict divergence that comes with any other difference', () => {
    // The debt is a verdict-only disagreement about one identical position. A
    // pair that also differs in a bank, a square or a key is a different bug and
    // must never be tolerated, however its verdict reads.
    const { replicaP, canonicalP } = bothEngines(0);
    expect(classifyKnownProverGap(replicaP, canonicalP)).toBe('overclaim-broke-defender');

    canonicalP.bank[0] += 1;
    expect(classifyKnownProverGap(replicaP, canonicalP)).toBeNull();
  });

  it('refuses a verdict divergence whose reason is not home-checkmate', () => {
    // Only the prover's mate claim is in scope. An elimination or occupation
    // verdict the replica invented would be a terminal-ordering bug in the
    // replica's own lane, which M2 owns and must fix rather than excuse.
    const { replicaP, canonicalP } = bothEngines(0);
    replicaP.reason = Reason.ELIMINATION;
    expect(classifyKnownProverGap(replicaP, canonicalP)).toBeNull();

    replicaP.reason = Reason.HOME_OCCUPATION;
    expect(classifyKnownProverGap(replicaP, canonicalP)).toBeNull();
  });
});

describe('classifyKnownProverGap: the under-claim half (the search)', () => {
  it('recognises the seed-38 class: canonical mates, the replica promotes its way out', () => {
    // The real divergence, from `phasing-prover-underclaim.test.ts`: canonical
    // awards Black the mate, the packed prover finds Standard's promotion rescue
    // and reports ongoing.
    const { replicaP, canonicalP } = underclaimPair(PROMO_COST);
    expect(canonicalP.result).toBe(Result.BLACK_WIN);
    expect(canonicalP.reason).toBe(Reason.HOME_CHECKMATE);
    expect(replicaP.result).toBe(Result.ONGOING);

    expect(classifyKnownProverGap(replicaP, canonicalP)).toBe('underclaim-standard-rescue');
  });

  it('recognises the RELEASE mechanism, which no amount of cash explains', () => {
    // The arm-3 case, minimised from the real seed-38 position: the defender has
    // 1 crystal and no promotion within reach, and the Standard-only resource is
    // permission to drop its own tier-2 blocker. A classifier keyed only on
    // affordability would call this unclassified and the M2 ledger would be wrong
    // about what it carries.
    const { replicaP, canonicalP } = releasePair();
    expect(canonicalP.result).toBe(Result.BLACK_WIN);
    expect(canonicalP.reason).toBe(Reason.HOME_CHECKMATE);
    expect(replicaP.result).toBe(Result.ONGOING);

    expect(classifyKnownProverGap(replicaP, canonicalP)).toBe('underclaim-standard-rescue');
  });

  it('refuses an under-claim by a defender with no Standard-only option at all', () => {
    // If every unit is tier 1 and no promotion is affordable, Standard's
    // `prepare` has exactly one leaf and it IS Phasing's, so a missed mate is a
    // real replica bug and must keep failing the gate. Built from the promotion
    // position below its cost threshold, where the two engines genuinely agree,
    // then forced into the under-claim shape.
    const { replicaP, canonicalP } = underclaimPair(PROMO_COST - 1);
    expect(canonicalP.result).toBe(Result.BLACK_WIN);
    // They agree here — that is the point of the boundary.
    expect(replicaP.result).toBe(Result.BLACK_WIN);

    replicaP.result = Result.ONGOING;
    replicaP.reason = Reason.NONE;
    expect(rentOf(canonicalP, 0)).toBeLessThanOrEqual(canonicalP.bank[0]);

    expect(classifyKnownProverGap(replicaP, canonicalP)).toBeNull();
  });

  it('refuses an under-claim whose reason is not home-checkmate', () => {
    // An elimination or occupation terminal the replica missed is a
    // terminal-ordering bug in the replica's own lane.
    const { replicaP, canonicalP } = underclaimPair(PROMO_COST);
    canonicalP.reason = Reason.ELIMINATION;
    expect(classifyKnownProverGap(replicaP, canonicalP)).toBeNull();
  });
});
