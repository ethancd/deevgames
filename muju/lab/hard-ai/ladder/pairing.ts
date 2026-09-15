/**
 * Ladder pairing (DESIGN §7.7): "seed s is played twice (A-white/B-black,
 * B-white/A-black) at each handicap; pair score ∈ {0, 0.5, 1, 1.5, 2}".
 *
 * A `PairAssignment` is one seed at one handicap; `expandGames` turns each
 * assignment into the two `GameSpec`s that share its seed (so both
 * orientations see identical RNG streams and any seed-linked variance
 * cancels between them) but flip which engine sits in which seat. Handicaps
 * are distributed round-robin across pair indices so a run splits evenly
 * across the requested handicap list.
 */

export interface PairAssignment {
  /** 0-based index into the full pair list for this run. */
  pairIndex: number;
  /** Base seed shared by both games of this pair (derived from the run seed). */
  seed: number;
  /** Black-crystal handicap (`MatchOptions.blackCrystalHandicap`) for this pair. */
  handicap: number;
}

export type Orientation = 'A-white' | 'B-white';
export type EngineSlot = 'A' | 'B';

export interface GameSpec {
  pairIndex: number;
  orientation: Orientation;
  seed: number;
  handicap: number;
  white: EngineSlot;
  black: EngineSlot;
}

/** Derives a per-pair seed from the run seed and pair index (splitmix-style; matches `lab/harness/rng.ts`'s `deriveSeed`). */
export function derivePairSeed(runSeed: number, pairIndex: number): number {
  let z = (runSeed + 0x9e3779b9 * (pairIndex + 1)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Builds `pairs` assignments for a run seed, distributing `handicaps` (in
 * the order given) round-robin across pair indices so every handicap gets
 * as close to `pairs / handicaps.length` pairs as integer division allows.
 */
export function buildPairs(pairs: number, seed: number, handicaps: readonly number[]): PairAssignment[] {
  if (pairs <= 0) throw new Error(`buildPairs: pairs must be positive, got ${pairs}`);
  if (handicaps.length === 0) throw new Error('buildPairs: at least one handicap is required');
  const out: PairAssignment[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push({ pairIndex: i, seed: derivePairSeed(seed, i), handicap: handicaps[i % handicaps.length] });
  }
  return out;
}

/** Expands one pair assignment into its two seat-mirrored `GameSpec`s. */
export function expandPair(pair: PairAssignment): [GameSpec, GameSpec] {
  return [
    { pairIndex: pair.pairIndex, orientation: 'A-white', seed: pair.seed, handicap: pair.handicap, white: 'A', black: 'B' },
    { pairIndex: pair.pairIndex, orientation: 'B-white', seed: pair.seed, handicap: pair.handicap, white: 'B', black: 'A' },
  ];
}

export function expandGames(pairs: readonly PairAssignment[]): GameSpec[] {
  const out: GameSpec[] = [];
  for (const p of pairs) out.push(...expandPair(p));
  return out;
}

/** A's score for a single game, from the winner's perspective (1 win / 0.5 draw / 0 loss). Null winner scores 0.5. */
export function gameScoreFor(slot: EngineSlot, winnerSlot: EngineSlot | null): number {
  if (winnerSlot === null) return 0.5;
  return winnerSlot === slot ? 1 : 0;
}

/** Combines the two per-orientation game scores (A's perspective, each 0/0.5/1) into the pair score ∈ {0, 0.5, 1, 1.5, 2}. */
export function pairScore(scoreAWhiteGameForA: number, scoreBWhiteGameForA: number): number {
  return scoreAWhiteGameForA + scoreBWhiteGameForA;
}

/** Slices a contiguous, order-preserving range of pair indices for shard `shardIndex` of `shardCount` (DESIGN §7.7: "each owning a contiguous slice of pair indices"). */
export function shardRange(pairs: number, shardCount: number, shardIndex: number): { start: number; end: number } {
  if (shardCount <= 0) throw new Error(`shardRange: shardCount must be positive, got ${shardCount}`);
  if (shardIndex < 0 || shardIndex >= shardCount) throw new Error(`shardRange: shardIndex ${shardIndex} out of range [0, ${shardCount})`);
  const base = Math.floor(pairs / shardCount);
  const extra = pairs % shardCount;
  // The first `extra` shards get one additional pair so every pair is covered exactly once.
  const start = shardIndex * base + Math.min(shardIndex, extra);
  const end = start + base + (shardIndex < extra ? 1 : 0);
  return { start, end };
}
