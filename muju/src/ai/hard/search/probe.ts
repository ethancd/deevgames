/**
 * The root instrument (E2 lane 1): an OPT-IN record of the root's candidate
 * list, of what the root actually searched, and of the ply-1 candidate list
 * each searched root candidate led to.
 *
 * WHY. `RootResult` is `{actions, scoreCc, depth, work, stats, source, endKey}`
 * and `HardSearchStats` is aggregate counters, so an analyser outside the
 * engine cannot tell "the turn was in the candidate list and the root never
 * searched it" from "the root searched it and scored it below the move it
 * played" (`docs/hard-ai/e1/ANALYZE.md`, "Discarded and misjudged are one
 * class"). Both arrive as one label. Splitting them needs a per-candidate
 * `searched` flag and a per-candidate score, which is what this file records.
 *
 * COST WHEN OFF. `SearchContext.probe` is `null` in every production path and
 * every existing test. The hooks are `if (s.probe !== null)` at four sites —
 * once per root candidate and once per generation — never inside `pvs`'s
 * per-node work, and nothing here is allocated unless a caller asked for it.
 * With the instrument off the search is byte-identical: this file is pure
 * observation, it never reads the clock, never spends the meter, and never
 * changes a score, an ordering or a bound (`tests/ai/hard/root-exposure.test.ts`
 * pins that on real positions).
 *
 * COST WHEN ON. One `RootProbe` per instrumented search, sized from the root
 * candidate capacity. Inside the search only typed-array stores happen; the
 * `RootCandidate` objects and the hex `endKey` strings are materialised once,
 * in `searchRoot`, after the search has returned.
 *
 * WHICH LIST. `rootIteration` REGENERATES the candidate list every iteration
 * and `scoreTurns` re-sorts it, so "the root's candidate list" is a per
 * iteration object. The probe therefore keeps three buffers: the list
 * `searchRoot` generated before iterative deepening (`gen`, the one the
 * must-answer scan, the book probe and the `pickUnsearched` salvage read), the
 * iteration in progress (`live`), and the last COMPLETED iteration (`done`).
 * `searchRoot` publishes the one that produced the move it is returning.
 */
import type { Centi } from '../types';
import type { Turn } from '../gen/turn';

/** Which generator a node used, as recorded by `generateAt`. */
export type GeneratorId = 'root' | 'interior' | 'quiesce';

/** Index into `GENERATORS`; stored as a small int in the typed arrays. */
export const GENERATORS: readonly GeneratorId[] = ['root', 'interior', 'quiesce'];

/** Most ply-1 end keys kept per root candidate. `kInterior` is 16 at
 * `hard@desktop` and the forced injections can push a list past it, so 32
 * covers the real lists with room to spare; `truncatedKeys` says when it did
 * not. */
export const PLY1_MAX_KEYS = 32;

export interface RootCandidate {
  /** Position in the list the root walked (0 = first searched). */
  index: number;
  /** `Kpos` after the turn, in `RootResult.endKey`'s hex form. */
  endKey: string;
  /**
   * `Turn.gainCc` as it stood when the list was snapshotted. In a
   * `completed-depth` or `partial-iteration` list that is the ORDERING score
   * `search/order.ts` wrote (and sorted on), so `index` is its rank; in a
   * `generator-list` it is the generator's within-turn gain, which is what
   * `pickUnsearched` ranks on. `RootResult.candidateSource` says which.
   */
  genRankCc: Centi;
  /** `TurnFlag` bits. */
  flags: number;
  /** `Turn.sig`, the 32-bit abstract action signature (killers/counter-moves).
   * Cheap identity for a candidate that does not need decoding. */
  sig: number;
  /** True when the root applied it and searched a child. */
  searched: boolean;
  /** The score `rootIteration` assigned, or null when it was never searched.
   * Under aspiration a fail-low/fail-high score is a bound, not a value. */
  scoreCc: Centi | null;
  /** The candidate whose move `RootResult` returned. */
  chosen: boolean;
}

export interface RootTraceRow {
  /** The iteration's depth; 0 for the pre-deepening generator list. */
  depth: number;
  /** Candidates the generator returned for this iteration. */
  n: number;
  /** Candidates the root applied and searched. */
  searched: number;
  /** False when `isTruncating` cut the candidate loop. */
  completed: boolean;
  /** Index where `alpha >= beta` broke the loop, or -1. */
  cutoffAt: number;
  /** `SearchContext.truncated` at the end of the iteration: this iteration's
   * loop OR any descendant stopped part way. */
  truncated: boolean;
  /** Work units this iteration spent, from `meter.used` at its start to its
   * end. The ratio of consecutive COMPLETED rows is what
   * `search/pvs.ts shouldDeepen`'s `predicted` gate estimates the next depth
   * from, so an instrumented run can report the distribution the gate's floor
   * should be chosen from. Optional: a caller that builds a row by hand (a
   * lab test fixture) may omit it. */
  work?: number;
}

export interface Ply1Node {
  /** The root candidate whose child this is. */
  rootIndex: number;
  /** The generator the FIRST ply-1 generation under this candidate used. */
  generator: GeneratorId;
  /** Candidates that generation returned (after the per-ply array cap). */
  n: number;
  /** The generation was cut by `stop()` (`StopAwareSink.cut`). Always false
   * under fixed `work`. */
  cut: boolean;
  /** How many ply-1 generations ran under this root candidate (a null-window
   * scout plus its re-search generate twice; a TT hit may generate none). */
  generations: number;
  /** Every generator seen at ply 1 under this candidate, first-seen first. */
  generators: GeneratorId[];
  /** End keys of the recorded generation, in the order the node saw them. */
  endKeys: string[];
  /** The generation returned more than `PLY1_MAX_KEYS` candidates and
   * `endKeys` holds the first `PLY1_MAX_KEYS`. */
  truncatedKeys: boolean;
}

function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * One snapshot of a root candidate list plus what the root did with it. All
 * storage is preallocated to the root capacity; `reset` only rewinds.
 */
class IterationBuffer {
  depth = 0;
  n = 0;
  searchedCount = 0;
  completed = false;
  cutoffAt = -1;
  truncated = false;
  bestIndex = -1;

  private readonly endHi: Int32Array;
  private readonly endLo: Int32Array;
  private readonly rankCc: Int32Array;
  private readonly flags: Int32Array;
  private readonly sig: Int32Array;
  private readonly searched: Uint8Array;
  private readonly scoreCc: Int32Array;

  /** Ply-1 trace, present only when the caller asked for it. */
  private readonly p1Gen: Int8Array | null;
  private readonly p1Mask: Uint8Array | null;
  private readonly p1N: Int32Array | null;
  private readonly p1Cut: Uint8Array | null;
  private readonly p1Runs: Int32Array | null;
  private readonly p1KeyN: Int32Array | null;
  private readonly p1Full: Uint8Array | null;
  private readonly p1Keys: Int32Array | null;

  constructor(
    private readonly capacity: number,
    withPly1: boolean,
  ) {
    this.endHi = new Int32Array(capacity);
    this.endLo = new Int32Array(capacity);
    this.rankCc = new Int32Array(capacity);
    this.flags = new Int32Array(capacity);
    this.sig = new Int32Array(capacity);
    this.searched = new Uint8Array(capacity);
    this.scoreCc = new Int32Array(capacity);
    this.p1Gen = withPly1 ? new Int8Array(capacity) : null;
    this.p1Mask = withPly1 ? new Uint8Array(capacity) : null;
    this.p1N = withPly1 ? new Int32Array(capacity) : null;
    this.p1Cut = withPly1 ? new Uint8Array(capacity) : null;
    this.p1Runs = withPly1 ? new Int32Array(capacity) : null;
    this.p1KeyN = withPly1 ? new Int32Array(capacity) : null;
    this.p1Full = withPly1 ? new Uint8Array(capacity) : null;
    this.p1Keys = withPly1 ? new Int32Array(capacity * PLY1_MAX_KEYS * 2) : null;
  }

  /** Copies `turns[0..n)`'s identity and rewinds everything the search writes. */
  snapshot(depth: number, turns: readonly Turn[], n: number): void {
    const count = n < this.capacity ? n : this.capacity;
    this.depth = depth;
    this.n = count;
    this.searchedCount = 0;
    this.completed = false;
    this.cutoffAt = -1;
    this.truncated = false;
    this.bestIndex = -1;
    for (let i = 0; i < count; i++) {
      const turn = turns[i];
      this.endHi[i] = turn.endHi;
      this.endLo[i] = turn.endLo;
      this.rankCc[i] = turn.gainCc;
      this.flags[i] = turn.flags;
      this.sig[i] = turn.sig;
      this.searched[i] = 0;
      this.scoreCc[i] = 0;
    }
    if (this.p1Gen !== null) {
      const gen = this.p1Gen;
      const mask = this.p1Mask as Uint8Array;
      const runs = this.p1Runs as Int32Array;
      for (let i = 0; i < count; i++) {
        gen[i] = -1;
        mask[i] = 0;
        runs[i] = 0;
      }
    }
  }

  score(index: number, scoreCc: Centi): void {
    if (index < 0 || index >= this.n) return;
    this.searched[index] = 1;
    this.scoreCc[index] = scoreCc;
    this.searchedCount++;
  }

  ply1(index: number, generator: number, n: number, cut: boolean, turns: readonly Turn[]): void {
    const gen = this.p1Gen;
    if (gen === null || index < 0 || index >= this.n) return;
    const mask = this.p1Mask as Uint8Array;
    const runs = this.p1Runs as Int32Array;
    mask[index] |= 1 << generator;
    runs[index]++;
    if (gen[index] >= 0) return;
    gen[index] = generator;
    (this.p1N as Int32Array)[index] = n;
    (this.p1Cut as Uint8Array)[index] = cut ? 1 : 0;
    const kept = n < PLY1_MAX_KEYS ? n : PLY1_MAX_KEYS;
    (this.p1KeyN as Int32Array)[index] = kept;
    (this.p1Full as Uint8Array)[index] = n > PLY1_MAX_KEYS ? 1 : 0;
    const keys = this.p1Keys as Int32Array;
    const base = index * PLY1_MAX_KEYS * 2;
    for (let i = 0; i < kept; i++) {
      keys[base + i * 2] = turns[i].endHi;
      keys[base + i * 2 + 1] = turns[i].endLo;
    }
  }

  /** Materialises the objects. Called once, after the search has returned. */
  candidates(chosen: number): RootCandidate[] {
    const out: RootCandidate[] = [];
    for (let i = 0; i < this.n; i++) {
      const searched = this.searched[i] === 1;
      out.push({
        index: i,
        endKey: keyHex(this.endHi[i], this.endLo[i]),
        genRankCc: this.rankCc[i],
        flags: this.flags[i],
        sig: this.sig[i],
        searched,
        scoreCc: searched ? this.scoreCc[i] : null,
        chosen: i === chosen,
      });
    }
    return out;
  }

  ply1Nodes(): Ply1Node[] {
    const gen = this.p1Gen;
    if (gen === null) return [];
    const mask = this.p1Mask as Uint8Array;
    const keys = this.p1Keys as Int32Array;
    const out: Ply1Node[] = [];
    for (let i = 0; i < this.n; i++) {
      if (gen[i] < 0) continue;
      const kept = (this.p1KeyN as Int32Array)[i];
      const base = i * PLY1_MAX_KEYS * 2;
      const endKeys: string[] = [];
      for (let k = 0; k < kept; k++) endKeys.push(keyHex(keys[base + k * 2], keys[base + k * 2 + 1]));
      const generators: GeneratorId[] = [];
      for (let g = 0; g < GENERATORS.length; g++) {
        if ((mask[i] & (1 << g)) !== 0) generators.push(GENERATORS[g]);
      }
      out.push({
        rootIndex: i,
        generator: GENERATORS[gen[i]],
        n: (this.p1N as Int32Array)[i],
        cut: (this.p1Cut as Uint8Array)[i] === 1,
        generations: (this.p1Runs as Int32Array)[i],
        generators,
        endKeys,
        truncatedKeys: (this.p1Full as Uint8Array)[i] === 1,
      });
    }
    return out;
  }

  /** The searched score of the candidate ending at `hi`/`lo`, or `null`. */
  scoreOf(hi: number, lo: number): Centi | null {
    const i = this.find(hi, lo);
    return i >= 0 && this.searched[i] === 1 ? this.scoreCc[i] : null;
  }

  /** Index of the candidate whose end position is `hi`/`lo`, or -1. */
  find(hi: number, lo: number): number {
    for (let i = 0; i < this.n; i++) {
      if (this.endHi[i] === hi && this.endLo[i] === lo) return i;
    }
    return -1;
  }
}

/**
 * The instrument. Lives on `SearchContext.probe` for the duration of one
 * instrumented `searchRoot` and is `null` at every other moment.
 */
export class RootProbe {
  /** The list `searchRoot` generated before iterative deepening. */
  private readonly gen: IterationBuffer;
  /** The iteration in progress. */
  private live: IterationBuffer;
  /** The last COMPLETED iteration. */
  private done: IterationBuffer;
  private hasDone = false;
  private hasLive = false;
  private hasGen = false;

  /** The root candidate whose subtree the search is inside; `generateAt` uses
   * it to attribute a ply-1 generation. */
  rootIndex = -1;

  readonly trace: RootTraceRow[] = [];

  constructor(
    capacity: number,
    readonly withPly1: boolean,
  ) {
    this.gen = new IterationBuffer(capacity, false);
    this.live = new IterationBuffer(capacity, withPly1);
    this.done = new IterationBuffer(capacity, withPly1);
  }

  /** `searchRoot`'s own pre-deepening generation. */
  snapshotGenerated(turns: readonly Turn[], n: number): void {
    this.gen.snapshot(0, turns, n);
    this.hasGen = true;
  }

  /** `rootIteration`, after `generateAt` and `scoreTurns`. */
  beginIteration(depth: number, turns: readonly Turn[], n: number, usedAtStart: number): void {
    this.live.snapshot(depth, turns, n);
    this.hasLive = true;
    this.rootIndex = -1;
    this.iterationStartedAt = usedAtStart;
  }

  /** `meter.used` when the live iteration began. */
  private iterationStartedAt = 0;

  enter(index: number): void {
    this.rootIndex = index;
  }

  score(index: number, scoreCc: Centi): void {
    this.live.score(index, scoreCc);
  }

  cutoff(index: number): void {
    this.live.cutoffAt = index;
  }

  ply1(generator: number, n: number, cut: boolean, turns: readonly Turn[]): void {
    this.live.ply1(this.rootIndex, generator, n, cut, turns);
  }

  /** `rootIteration`'s return. A COMPLETED iteration becomes `done`; the
   * buffers are swapped rather than copied, and the next iteration's
   * `snapshot` rewinds whatever the swap left in `live`. */
  endIteration(completed: boolean, truncated: boolean, bestIndex: number, usedAtEnd = 0): void {
    const buf = this.live;
    buf.completed = completed;
    buf.truncated = truncated;
    buf.bestIndex = bestIndex;
    this.trace.push({
      depth: buf.depth,
      n: buf.n,
      searched: buf.searchedCount,
      completed,
      cutoffAt: buf.cutoffAt,
      truncated,
      work: usedAtEnd > this.iterationStartedAt ? usedAtEnd - this.iterationStartedAt : 0,
    });
    this.rootIndex = -1;
    if (!completed) return;
    this.live = this.done;
    this.done = buf;
    this.hasDone = true;
    this.hasLive = false;
  }

  /** An iteration that returned before `beginIteration` (an empty candidate
   * list) still owes the trace a row. */
  traceEmpty(depth: number): void {
    this.trace.push({ depth, n: 0, searched: 0, completed: true, cutoffAt: -1, truncated: false, work: 0 });
  }

  /**
   * STRATEGOS W1.10 (`search/veto.ts`): the score the last COMPLETED
   * iteration gave the candidate ending at `hi`/`lo`, or `null` when there is
   * no completed iteration, the candidate is not in it, or it was never
   * searched. A null-window candidate's score is a bound, as
   * `RootCandidate.scoreCc` says; the veto only RANKS by it and re-searches
   * the one it picks. Reads, never writes. The halves are compared as the
   * signed 32-bit values the buffers store (`publish` does the same).
   */
  completedScore(hi: number, lo: number): Centi | null {
    return this.hasDone ? this.done.scoreOf(hi | 0, lo | 0) : null;
  }

  /**
   * The list that produced the move `searchRoot` is returning.
   *
   * `preferDone` is `SearchContext.rootHasBest`: true when a COMPLETED
   * iteration supplied the move, false when the answer is `rootPartial`'s
   * (the live buffer) or predates deepening altogether (the generator list —
   * the must-answer scan, the book probe, `pickUnsearched`, and the empty and
   * pack-error returns).
   * `preferGenerated` selects the preserved initial list when a stopped first
   * regeneration has a live buffer but supplied no searched answer.
   */
  publish(
    preferDone: boolean,
    endKey: string,
    preferGenerated = false,
  ): {
    source: 'completed-depth' | 'partial-iteration' | 'generator-list';
    candidates: RootCandidate[];
    ply1: Ply1Node[];
  } {
    let buf: IterationBuffer;
    let source: 'completed-depth' | 'partial-iteration' | 'generator-list';
    if (preferGenerated && this.hasGen) {
      buf = this.gen;
      source = 'generator-list';
    } else if (preferDone && this.hasDone) {
      buf = this.done;
      source = 'completed-depth';
    } else if (this.hasLive && this.live.n > 0) {
      buf = this.live;
      source = 'partial-iteration';
    } else if (this.hasDone) {
      buf = this.done;
      source = 'completed-depth';
    } else {
      buf = this.hasGen ? this.gen : this.live;
      source = 'generator-list';
    }
    // `bestIndex` is the iteration's own answer; the end key is the returned
    // move's. They agree on every path that publishes an iteration, and the
    // key is the only identity the generator list has.
    const keyed =
      endKey.length === 16 ? buf.find(parseInt(endKey.slice(0, 8), 16) | 0, parseInt(endKey.slice(8), 16) | 0) : -1;
    const chosen = buf.bestIndex >= 0 && buf.bestIndex === keyed ? buf.bestIndex : keyed;
    return { source, candidates: buf.candidates(chosen), ply1: buf.ply1Nodes() };
  }
}
