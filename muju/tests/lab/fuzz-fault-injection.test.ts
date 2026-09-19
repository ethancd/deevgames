// @vitest-environment node
/**
 * PROVE THE DETECTORS DETECT.
 *
 * Every surface of `lab/hard-ai/fuzz` reports a counter, and a run is called
 * clean when the counters are zero. That is only evidence if the counter CAN
 * move: a comparison that is structurally incapable of seeing a fault reports
 * zero for the same reason a working one does.
 *
 * Round 5 exists because an independent reviewer found a counter that could
 * not move. The differential's immediate `unmake` identity check compared
 * `fuzzDigest`, which walks `pieceAt` and therefore cannot see `occ`, `occBy`
 * or `occTier`; the occupancy comparisons in `firstDifference` run only after
 * the action is made AGAIN, and re-making repairs any lane `make` overwrites
 * unconditionally. A 400-action probe that replaced `unmake`'s restored
 * `occTier` with the post-action values produced 164 incorrect restorations
 * while divergences, unmake, legality, rehash, round-trip and invariant
 * counters all stayed 0, at `--legality-every 1`.
 *
 * So this file injects a fault into each surface and asserts the matching
 * counter moves, within a deliberately small walk. The production `Replica`
 * carries NO hooks: the faults are a SUBCLASS passed through the lab-only
 * `replica` option, or a vitest module mock over `tactics/prover.ts` that is
 * inert until a test arms it.
 *
 * | surface | what it compares | this file's fault |
 * |---|---|---|
 * | unmake identity | every field of `PackedState`, byte for byte, between the capture before `make` and the state after `unmake` | `unmake` leaves `occTier` / `occBy` / `pendBB` / a `uflags` bit wrong |
 * | transition | `firstDifference(replica, pack(applyAction(...)))` | the second `make` of each action corrupts `occTier` |
 * | rehash | `recompute{Kpos,Kturn,OccHash}` against the incrementally maintained keys, every 64 actions | `make` flips a bit of `kposLo` that survives the re-make |
 * | round trip | `firstDifference(p, pack(unpack(p)))`, every 64 actions | `unpack` reports one crystal too many |
 * | legality multiset | the replica's generated set against `generateAllActions` + expanded MOVEs | `genActions` drops its last candidate |
 * | prover verdict / nodes | `homeVerdict` against `analyzeHomeDefenseEvidence`, and the node count against `evidence.nodes` | the mock flips the verdict / adds one node |
 * | gate preservation | `replicaOutcome(p)` against `canonicalOutcome(next)` after every action | `make` awards a draw on the 50th call |
 */
import { describe, expect, it, vi } from 'vitest';
import { DEAD, MAX_SLOTS, Replica, type Undo } from '../../src/ai/hard/core/state';
import type { KeepSetTable, PA } from '../../src/ai/hard/core/action';
import { PEND_STRIDE, Result, type PackedState } from '../../src/ai/hard/types';
import type { GameState } from '../../src/game/types';
import { createInitialGameState } from '../../src/game/board';
import { PackedSnapshot } from '../../lab/hard-ai/fuzz/statesnap';
import { fuzzDigest, runArrivalSurface, runFuzz, type Surface } from '../../lab/hard-ai/fuzz/differential';
import { runGatePreservation, runProverSurface } from '../../lab/hard-ai/fuzz/prover-surface';

const fault = vi.hoisted(() => ({ verdict: false, nodes: false, calls: 0 }));

// Inert unless a test arms it: `runProverSurface` calls the real prover for
// every other test in this file and for the whole rest of the suite.
vi.mock('../../src/ai/hard/tactics/prover', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/ai/hard/tactics/prover')>();
  return {
    ...actual,
    homeVerdict: (...args: Parameters<typeof actual.homeVerdict>): number => {
      const real = actual.homeVerdict(...args);
      fault.calls++;
      if (!fault.verdict || fault.calls <= 40) return real;
      return real === actual.HomeVerdict.MATE ? actual.HomeVerdict.RESCUE : actual.HomeVerdict.MATE;
    },
    proverStats: (): ReturnType<typeof actual.proverStats> => {
      const real = actual.proverStats();
      if (!fault.nodes || fault.calls <= 40) return real;
      return { ...real, nodes: real.nodes + 1 };
    },
  };
});

function options(actions: number, surfaces: Surface[], replica: Replica, legalityEvery = 10_000): Parameters<typeof runFuzz>[0] {
  return {
    seed: 4242,
    actions,
    surfaces: new Set<Surface>(surfaces),
    legalityEvery,
    plies: 500,
    reproDir: null,
    sample: 0,
    resignRate: 0,
    replica,
  };
}

/** Corrupts one lane of the state `unmake` restored, the way the probe did. */
class UnmakeFault extends Replica {
  constructor(private readonly lane: 'occTier' | 'occBy' | 'pendBB' | 'uflags') {
    super();
  }

  override unmake(p: PackedState, u: Undo): void {
    super.unmake(p, u);
    if (this.lane === 'occTier') p.occTier[0] = (p.occTier[0] ^ 1) >>> 0;
    else if (this.lane === 'occBy') p.occBy[4] = (p.occBy[4] ^ 0x80) >>> 0;
    else if (this.lane === 'pendBB') p.pendBB[1] = (p.pendBB[1] ^ 2) >>> 0;
    else p.uflags[0] = p.uflags[0] ^ 8;
  }
}

/**
 * Corrupts the SECOND `make` of each action — the fuzzer makes every action
 * twice, once for the unmake identity and once to advance — so the fault
 * reaches the transition comparison rather than tripping the unmake check.
 */
class SecondMakeFault extends Replica {
  private calls = 0;

  constructor(private readonly lane: 'occTier' | 'kposLo') {
    super();
  }

  override make(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void {
    super.make(p, a, u, keep);
    this.calls++;
    if (this.calls % 2 !== 0) return;
    if (this.lane === 'occTier') p.occTier[0] = (p.occTier[0] ^ 1) >>> 0;
    else p.kposLo = (p.kposLo ^ 1) >>> 0;
  }
}

class UnpackFault extends Replica {
  override unpack(p: PackedState): GameState {
    const state = super.unpack(p);
    return { ...state, players: { ...state.players, white: { ...state.players.white, resources: state.players.white.resources + 1 } } };
  }
}

class GenFault extends Replica {
  override genActions(p: PackedState, out: Int32Array): number {
    const n = super.genActions(p, out);
    return n > 3 ? n - 1 : n;
  }
}

/**
 * THE ROUND-5 DEFECT ITSELF, through the public seam: canonical `board.units`
 * order taken from the SLOT INDEX instead of from the birth sequence. Round 4
 * wrote exactly this into `tactics/prover.ts buildOwned`, and 28.55M fuzzed
 * actions did not notice, because the only surface that ran the prover packed
 * every case fresh and so could not tell the two orders apart.
 *
 * `unmake` does NOT restore this, which is deliberate: the gate-preservation
 * walk never unmakes, and a fault that also tripped the unmake check would prove
 * the wrong detector.
 */
class SlotOrderFault extends Replica {
  override make(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void {
    super.make(p, a, u, keep);
    for (let slot = 0; slot < MAX_SLOTS; slot++) if (p.sq[slot] !== DEAD) p.ord[slot] = slot;
  }
}

/** Swaps the birth sequence of the two lowest living slots on the SECOND `make`
 * of each action, so the fault reaches the transition comparison (which now
 * includes canonical ORDER) rather than the unmake check. */
class OrderSwapFault extends Replica {
  private calls = 0;

  override make(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void {
    super.make(p, a, u, keep);
    if (++this.calls % 2 !== 0) return;
    let x = -1;
    let y = -1;
    for (let slot = 0; slot < MAX_SLOTS && y < 0; slot++) {
      if (p.sq[slot] === DEAD) continue;
      if (x < 0) x = slot;
      else y = slot;
    }
    if (y < 0) return;
    const t = p.ord[x];
    p.ord[x] = p.ord[y];
    p.ord[y] = t;
  }
}

/** Replaces an id plane with a fresh copy, which the id lanes of
 * `PackedSnapshot` used to compare past (they read the CACHED array). */
class IdArrayReplaceFault extends Replica {
  constructor(private readonly lane: 'originIds' | 'pendIds') {
    super();
  }

  override unmake(p: PackedState, u: Undo): void {
    super.unmake(p, u);
    if (this.lane === 'originIds') p.originIds = [...p.originIds];
    else p.pendIds = [...p.pendIds];
  }
}

class GateFault extends Replica {
  private calls = 0;

  override make(p: PackedState, a: PA, u: Undo, keep?: KeepSetTable): void {
    super.make(p, a, u, keep);
    if (++this.calls === 50) p.result = p.result === Result.ONGOING ? Result.DRAW : Result.ONGOING;
  }
}

describe('the fuzz surfaces can fail', () => {
  it('the OLD digest-only unmake check is blind to eight fields the snapshot sees', () => {
    // The blind spot itself, as a measurement rather than as prose. `blind`
    // says whether `fuzzDigest` — what the unmake check compared until round 5
    // — can see the corruption at all; the snapshot must see every one of them.
    const replica = new Replica();
    const p = replica.pack(createInitialGameState(undefined, 4, 0, 'phasing'));
    // A commitment on the plane, so `pendBB` has something to be wrong about
    // and `fuzzDigest`'s pending restatement is not trivially empty.
    p.pendDef[0 * PEND_STRIDE + 3] = 1;
    p.pendBB[0] = (p.pendBB[0] | 8) >>> 0;
    p.pendCount[0] = 1;
    const cases: [string, boolean, (q: PackedState) => void][] = [
      ['occ', true, q => void (q.occ[0] = (q.occ[0] ^ 1) >>> 0)],
      ['occBy', true, q => void (q.occBy[4] = (q.occBy[4] ^ 0x80) >>> 0)],
      ['occTier', true, q => void (q.occTier[0] = (q.occTier[0] ^ 1) >>> 0)],
      ['pendBB', true, q => void (q.pendBB[1] = (q.pendBB[1] ^ 2) >>> 0)],
      ['initialReserve', true, q => void (q.initialReserve[7] = q.initialReserve[7] + 1)],
      ['slotCount', true, q => void (q.slotCount = q.slotCount + 1)],
      ['proverMode', true, q => void (q.proverMode = q.proverMode === 2 ? 1 : 2)],
      ['catalogSignature', true, q => void (q.catalogSignature = q.catalogSignature ^ 1)],
      // The canonical ORDER plane (round 6). `digest` is order-BLIND on purpose —
      // the search is entitled to transpose buy-order permutations — so these
      // four are blind here and seen by the snapshot, exactly like the lanes above.
      ['ord', true, q => void (q.ord[0] = q.ord[0] + 1)],
      ['ordNext', true, q => void (q.ordNext = q.ordNext + 1)],
      ['pendOrd', true, q => void (q.pendOrd[0] = q.pendOrd[0] + 1)],
      ['pendOrdNext', true, q => void (q.pendOrdNext = q.pendOrdNext + 1)],
      // The control group: fields the digest DOES carry, so the old check was
      // not blind to everything and this test is measuring a real boundary.
      ['gained', false, q => void (q.gained[0] = q.gained[0] + 1)],
      ['materialCc', false, q => void (q.materialCc[1] = q.materialCc[1] + 1)],
      ['bank', false, q => void (q.bank[0] = q.bank[0] + 1)],
    ];
    const snap = new PackedSnapshot();
    let blindCount = 0;
    for (const [name, blind, corrupt] of cases) {
      snap.capture(p);
      const digestBefore = fuzzDigest(replica, p);
      corrupt(p);
      if (blind) {
        expect(fuzzDigest(replica, p), name).toBe(digestBefore);
        blindCount++;
      } else {
        expect(fuzzDigest(replica, p), name).not.toBe(digestBefore);
      }
      expect(snap.firstDifference(p), name).not.toBeNull();
      snap.capture(p); // re-baseline, so each corruption is independent
    }
    expect(blindCount).toBe(12);
  });

  it.each(['occTier', 'occBy', 'pendBB', 'uflags'] as const)(
    'a walk whose unmake corrupts %s is caught by the unmake counter',
    lane => {
      const faulty = runFuzz(options(400, ['transition'], new UnmakeFault(lane)));
      expect(faulty.metrics.unmakeMismatches).toBeGreaterThan(0);
    },
  );

  it('the ARRIVAL surface catches a corrupt unmake too', () => {
    const clean = runArrivalSurface({ seed: 7, cases: 40, plies: 30, reproDir: null });
    expect(clean.unmakeMismatches).toBe(0);
    expect(clean.transitionMismatches).toBe(0);
    const faulty = runArrivalSurface({ seed: 7, cases: 40, plies: 30, reproDir: null, replica: new UnmakeFault('occTier') });
    expect(faulty.unmakeMismatches).toBeGreaterThan(0);
  });

  it('an UNCORRUPTED walk of the same length reports zero on every counter', () => {
    const clean = runFuzz(options(400, ['transition', 'legality'], new Replica(), 1)).metrics;
    expect(clean.unmakeMismatches).toBe(0);
    expect(clean.divergences).toBe(0);
    expect(clean.rehashMismatches).toBe(0);
    expect(clean.roundTripMismatches).toBe(0);
    expect(clean.legalitySetMismatches).toBe(0);
    expect(clean.invariantViolations).toBe(0);
    expect(clean.actions).toBe(400);
  });

  it('the TRANSITION surface catches a corrupt occTier that survives the re-make', () => {
    const faulty = runFuzz(options(400, ['transition'], new SecondMakeFault('occTier')));
    expect(faulty.metrics.divergences).toBeGreaterThan(0);
  });

  it('the REHASH sweep catches an incremental key that drifts from the recompute', () => {
    // Transition OFF: a wrong `kposLo` is a scalar `firstDifference` compares,
    // so with it on the walk would stop at the transition surface long before
    // the 64-action rehash cadence came round.
    const faulty = runFuzz(options(600, [], new SecondMakeFault('kposLo')));
    expect(faulty.metrics.rehashMismatches).toBeGreaterThan(0);
  });

  it('the ROUND TRIP catches an unpack that loses a crystal', () => {
    const faulty = runFuzz(options(600, [], new UnpackFault()));
    expect(faulty.metrics.roundTripMismatches).toBeGreaterThan(0);
  });

  it('the LEGALITY multiset catches a generator that drops a candidate', () => {
    const faulty = runFuzz(options(200, ['legality'], new GenFault(), 1));
    expect(faulty.metrics.legalitySetMismatches).toBeGreaterThan(0);
  });

  it('the GATE PRESERVATION surface catches a wrongly adjudicated result', () => {
    const clean = runGatePreservation({ seed: 11, actions: 2000, plies: 200, reproDir: null });
    expect(clean.mismatches).toBe(0);
    const faulty = runGatePreservation({ seed: 11, actions: 2000, plies: 200, reproDir: null, replica: new GateFault() });
    expect(faulty.mismatches).toBeGreaterThan(0);
  });

  it('the transition comparison catches a perturbed canonical ORDER', () => {
    const clean = runFuzz(options(400, ['transition'], new Replica()));
    expect(clean.metrics.divergences).toBe(0);
    const faulty = runFuzz(options(400, ['transition'], new OrderSwapFault()));
    expect(faulty.metrics.divergences).toBeGreaterThan(0);
    // ...and it is the ORDER that was reported, not some collateral field.
    expect(faulty.metrics.unmakeMismatches).toBe(0);
  });

  it('the INCREMENTAL PROVER surface catches board order taken from the slot index', () => {
    // The clean run also proves the surface is not vacuous: it must reach states
    // whose slot order really differs from canonical order.
    const clean = runGatePreservation({ seed: 11, actions: 8000, plies: 200, reproDir: null });
    expect(clean.incrementalProverVerdictMismatches).toBe(0);
    expect(clean.incrementalProverNodeMismatches).toBe(0);
    expect(clean.freshPackProverMismatches).toBe(0);
    expect(clean.incrementalProverCases).toBeGreaterThan(1000);
    expect(clean.proverOrderPermuted).toBeGreaterThan(0);
    // No gate proof inside `make` reached the cap, which is what makes the zeros
    // above an order-INDEPENDENCE claim rather than a coincidence.
    expect(clean.gateProverCapHits).toBe(0);

    const faulty = runGatePreservation({ seed: 11, actions: 8000, plies: 200, reproDir: null, replica: new SlotOrderFault() });
    expect(faulty.incrementalProverVerdictMismatches + faulty.incrementalProverNodeMismatches).toBeGreaterThan(0);
    // The FRESH-PACK control stays clean, which is the whole point: a fresh pack
    // restores canonical order by construction, so the surface that only ever
    // packed fresh could not have seen this.
    expect(faulty.freshPackProverMismatches).toBe(0);
  });

  it.each(['originIds', 'pendIds'] as const)('the snapshot catches %s being replaced wholesale', lane => {
    const faulty = runFuzz(options(400, ['transition'], new IdArrayReplaceFault(lane)));
    expect(faulty.metrics.unmakeMismatches).toBeGreaterThan(0);
  });

  it('the PROVER surface catches a flipped verdict and a wrong node count', () => {
    const clean = runProverSurface({ seed: 3, cases: 120, reproDir: null });
    expect(clean.fuzzVerdictMismatch).toBe(0);
    expect(clean.nodeMismatch).toBe(0);
    expect(clean.fuzzCases).toBe(120);

    fault.verdict = true;
    fault.calls = 0;
    try {
      expect(runProverSurface({ seed: 3, cases: 120, reproDir: null }).fuzzVerdictMismatch).toBeGreaterThan(0);
    } finally {
      fault.verdict = false;
    }

    fault.nodes = true;
    fault.calls = 0;
    try {
      expect(runProverSurface({ seed: 3, cases: 120, reproDir: null }).nodeMismatch).toBeGreaterThan(0);
    } finally {
      fault.nodes = false;
    }
  });
});
