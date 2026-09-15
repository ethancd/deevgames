/**
 * The macro transposition table and the prover's proof cache
 * (DESIGN §4.16 `tt.ts`, §5.11.3).
 *
 * ENTRY (16 bytes, four `Int32Array` words): `keyHi | scoreCc | bestEndLo |
 * depth u8 · bound u2 · age u6`. The low half of `Kpos` selects the bucket, so
 * it is not stored; `keyHi` is the verification tag. Buckets hold four entries.
 * Replacement: an entry from an older generation always loses; otherwise the
 * shallowest loses; and `store` never replaces an EXACT entry of GREATER depth
 * with a bound (DESIGN §5.11.3).
 *
 * Only `bestEndLo` is stored, never an action list (ET §4.3): on a hit the
 * candidate whose `endLo` matches is searched first, and if none matches the
 * hit still supplies its bound.
 *
 * SCORE TRANSPARENCY. `probe` is the only place a stored score can re-enter the
 * search. DESIGN §5.11.2's rule is the classical one — `if tt.depth >= depth
 * and bound usable: return scoreFromTT` — and that is what the SHIPPED search
 * does: a deeper EXACT value is a better number than the one this depth would
 * have computed, and refusing it throws away the largest single source of TT
 * cutoffs (§5.11.6 counts on them for "depth 5-6 with LMR/TT").
 *
 * M14's gate also asserts `bench.ttOnOffScoreMismatch === 0` — the same
 * FIXED-DEPTH search with the table on and off returns the same score — and
 * `hard:bench --calibrate` measures it on the SHIPPED search, both arms. (An
 * earlier revision narrowed EXACT hits to `e.depth === depth` on both arms, on
 * the theory that a deeper EXACT value is no longer a depth-`d` value;
 * measured over the bench's own 200-position corpus the shipped semantics
 * mismatch on nothing, so the narrowing bought nothing and cost the gate its
 * meaning. `exactSameDepthOnly` survives as a diagnostic knob that nothing in
 * the shipped path or the gate turns on.)
 *
 * PROVER MODE IS PART OF THE VALUE. DESIGN §5.11.4 runs the prover `full` at
 * the root and at PV nodes and in `bound` (admissible) mode inside quiescence
 * and at scout nodes, and a corner entry is adjudicated by whichever mode was
 * in force when `Replica.make` applied it. A value computed under the bound is
 * therefore a DIFFERENT quantity from one computed under the full prover — the
 * bound can only under-claim a mate — and handing a scout node's entry to a PV
 * node that §5.11.4 says must re-adjudicate is how a corner mate goes missing
 * across a transposition. Every entry records the mode it was computed under
 * (`boundProver`, bit 1 of the meta word) and `search/pvs.ts` refuses a
 * bound-mode entry at a PV node whose position has a live corner threat. See
 * DEVIATIONS under M14.
 *
 *   - EXACT at depth ≥ `d` is the value of a search at least as deep.
 *   - LOWER at depth ≥ `d` with `score ≥ beta`, and UPPER at depth ≥ `d` with
 *     `score ≤ alpha`, are cutoffs the deeper search already proved; the value
 *     handed back sits on the far side of the window, exactly where the
 *     re-search would have left it.
 *
 * Mate scores are stored ply-independently (`scoreToTT`) and re-based on the
 * way out (`scoreFromTT`), so a mate found at ply 5 and re-read at ply 2 still
 * says "mate in 3 more plies" (DESIGN §5.11.1, F21).
 */
import { MATE_PLY_CC, WIN_CC, type Centi } from '../types';

export const Bound = { EXACT: 0, LOWER: 1, UPPER: 2 } as const;
export type Bound = (typeof Bound)[keyof typeof Bound];

export interface TTEntry {
  keyHi: number;
  scoreCc: Centi;
  depth: number;
  bound: number;
  bestEndLo: number;
  age: number;
  /** The value was computed with the prover in `bound` (admissible) mode —
   * DESIGN §5.11.4's scout/quiescence mode. Additive to §4.16's entry (see the
   * module header); it rides in a spare bit of the meta word. */
  boundProver: boolean;
}

export function newTTEntry(): TTEntry {
  return { keyHi: 0, scoreCc: 0, depth: 0, bound: Bound.EXACT, bestEndLo: 0, age: 0, boundProver: false };
}

/** Words per entry: `keyHi`, `scoreCc`, `bestEndLo`, packed meta. */
const WORDS = 4;
/** Entries per bucket (DESIGN §5.11.3). */
const BUCKET = 4;
/** `age` is six bits (DESIGN §5.11.3's entry layout). */
const AGE_MASK = 63;

/**
 * Scores at least this large in magnitude are mate scores and are re-based by
 * ply on the way in and out. The evaluator's own range is bounded well under
 * it: M12's gate pins `maxAbsScore ≤ 600,000`, and `MAX_MATE_PLY` (64) is far
 * beyond `SearchConfig.maxDepth` (12) plus quiescence.
 */
export const MAX_MATE_PLY = 64;
export const MATE_BOUND_CC = WIN_CC - MAX_MATE_PLY * MATE_PLY_CC;

/** Ply-independent form of a score about to be stored (DESIGN §4.16). */
export function scoreToTT(score: Centi, ply: number): Centi {
  if (score >= MATE_BOUND_CC) return score + ply * MATE_PLY_CC;
  if (score <= -MATE_BOUND_CC) return score - ply * MATE_PLY_CC;
  return score;
}

/** Inverse of `scoreToTT` (DESIGN §4.16). */
export function scoreFromTT(score: Centi, ply: number): Centi {
  if (score >= MATE_BOUND_CC) return score - ply * MATE_PLY_CC;
  if (score <= -MATE_BOUND_CC) return score + ply * MATE_PLY_CC;
  return score;
}

/** True when `e` (already `scoreFromTT`-adjusted) may be returned as the value
 * of a depth-`depth` search inside `(alpha, beta)`. `exactSameDepthOnly` is the
 * TT-on/off comparison arm's narrowing (see the module header); the shipped
 * search leaves it false and takes DESIGN §5.11.2's rule as written. */
export function usable(
  e: TTEntry,
  depth: number,
  alpha: Centi,
  beta: Centi,
  exactSameDepthOnly = false,
): boolean {
  if (e.depth < depth) return false;
  switch (e.bound) {
    case Bound.EXACT:
      return !exactSameDepthOnly || e.depth === depth;
    case Bound.LOWER:
      return e.scoreCc >= beta;
    case Bound.UPPER:
      return e.scoreCc <= alpha;
    default:
      return false;
  }
}

export class TranspositionTable {
  readonly bits: number;
  private readonly words: Int32Array;
  private readonly buckets: number;
  private generation = 0;
  private probeCount = 0;
  private hitCount = 0;

  /** `2^bits` entries in `2^bits / 4` four-entry buckets. */
  constructor(bits: number) {
    if (!Number.isInteger(bits) || bits < 2 || bits > 26) throw new RangeError(`TranspositionTable: bad bits ${bits}`);
    this.bits = bits;
    this.buckets = (1 << bits) / BUCKET;
    this.words = new Int32Array((1 << bits) * WORDS);
  }

  get probes(): number {
    return this.probeCount;
  }

  get hits(): number {
    return this.hitCount;
  }

  /** New generation: every entry written before this call is now "old" and
   * loses every replacement contest (DESIGN §5.11.3). */
  newSearch(): void {
    this.generation = (this.generation + 1) & AGE_MASK;
  }

  clear(): void {
    this.words.fill(0);
    this.generation = 0;
    this.probeCount = 0;
    this.hitCount = 0;
  }

  private bucketBase(lo: number): number {
    // `Kpos` is a well-mixed 64-bit hash, so the low bits index directly.
    return ((lo >>> 0) % this.buckets) * BUCKET * WORDS;
  }

  /** Reads the entry for `(lo, hi)` into `out`; false when the table has none.
   * A hit leaves `out.scoreCc` in its STORED (ply-independent) form — callers
   * re-base it with `scoreFromTT`. */
  probe(lo: number, hi: number, out: TTEntry): boolean {
    this.probeCount++;
    const base = this.bucketBase(lo);
    const w = this.words;
    for (let i = 0; i < BUCKET; i++) {
      const at = base + i * WORDS;
      const meta = w[at + 3];
      if (meta === 0) continue; // never written
      if (w[at] !== (hi | 0)) continue;
      out.keyHi = w[at];
      out.scoreCc = w[at + 1];
      out.bestEndLo = w[at + 2] >>> 0;
      out.depth = (meta >>> 8) & 0xff;
      out.bound = (meta >>> 16) & 0x3;
      out.age = (meta >>> 18) & AGE_MASK;
      out.boundProver = (meta & 2) !== 0;
      this.hitCount++;
      return true;
    }
    return false;
  }

  /** DESIGN §4.16. `ply` re-bases a mate score before it is written. */
  store(
    lo: number,
    hi: number,
    scoreCc: Centi,
    depth: number,
    bound: number,
    bestEndLo: number,
    ply: number,
    boundProver = false,
  ): void {
    const base = this.bucketBase(lo);
    const w = this.words;
    const tag = hi | 0;
    let victim = -1;
    let victimRank = 0x7fffffff;
    for (let i = 0; i < BUCKET; i++) {
      const at = base + i * WORDS;
      const meta = w[at + 3];
      if (meta === 0) {
        victim = at;
        break;
      }
      const eDepth = (meta >>> 8) & 0xff;
      const eBound = (meta >>> 16) & 0x3;
      const eAge = (meta >>> 18) & AGE_MASK;
      if (w[at] === tag) {
        // Same position: refuse to demote a deeper EXACT entry to a bound.
        if (eBound === Bound.EXACT && bound !== Bound.EXACT && eDepth > depth && eAge === this.generation) return;
        victim = at;
        break;
      }
      // An entry from an older generation always loses; otherwise the
      // shallowest does. Rank is "how much we want to keep it".
      const rank = eAge === this.generation ? 1024 + eDepth : eDepth;
      if (rank < victimRank) {
        victimRank = rank;
        victim = at;
      }
    }
    if (victim < 0) return;
    w[victim] = tag;
    w[victim + 1] = scoreToTT(scoreCc, ply) | 0;
    w[victim + 2] = bestEndLo | 0;
    // Bit 0 is the "written" marker, so a freshly zeroed slot never reads as
    // an entry of depth 0 / bound EXACT / age 0.
    w[victim + 3] =
      1 |
      (boundProver ? 2 : 0) |
      ((depth & 0xff) << 8) |
      ((bound & 0x3) << 16) |
      ((this.generation & AGE_MASK) << 18);
  }
}

/** `ProofCache` verdicts (DESIGN §4.16: "0 unknown, 1 mate, 2 rescue,
 * 3 disproven-force"). Named `ProofValue` rather than `Proof` so it cannot be
 * confused with `tactics/dfpn.ts`'s own `Proof` enum, which is a different
 * three-valued verdict. */
export const ProofValue = { UNKNOWN: 0, MATE: 1, RESCUE: 2, DISPROVEN: 3 } as const;
export type ProofValue = (typeof ProofValue)[keyof typeof ProofValue];

/**
 * The prover/df-pn verdict store (DESIGN §4.16, §5.11.3: "the prover verdict
 * lives in `ProofCache` (2^15), never in the TT"). Direct-mapped, two words
 * per slot: the `keyHi` tag and the verdict.
 */
export class ProofCache {
  private readonly words: Int32Array;
  private readonly slots: number;

  constructor(bits: number) {
    if (!Number.isInteger(bits) || bits < 1 || bits > 24) throw new RangeError(`ProofCache: bad bits ${bits}`);
    this.slots = 1 << bits;
    this.words = new Int32Array(this.slots * 2);
  }

  get(lo: number, hi: number): number {
    const at = ((lo >>> 0) % this.slots) * 2;
    if (this.words[at + 1] === 0) return ProofValue.UNKNOWN;
    return this.words[at] === (hi | 0) ? this.words[at + 1] & 0x3 : ProofValue.UNKNOWN;
  }

  put(lo: number, hi: number, v: number): void {
    const at = ((lo >>> 0) % this.slots) * 2;
    this.words[at] = hi | 0;
    // Bit 2 marks the slot written, so `UNKNOWN` (0) is distinguishable from
    // "nothing here".
    this.words[at + 1] = v === ProofValue.UNKNOWN ? 0 : 4 | (v & 0x3);
  }

  clear(): void {
    this.words.fill(0);
  }
}
