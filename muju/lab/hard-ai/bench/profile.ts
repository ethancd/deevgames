/**
 * `hard:profile` — E4.1's cost-and-completion instrument (`docs/hard-ai/e4/E4-PLAN.md`
 * lane 1, `EPIC-PLAN-2026-09-16.md` §4 E4.1).
 *
 * `node --import tsx lab/hard-ai/bench/profile.ts --set <p8|e1-losses|p1-dev>
 *   (--work <units> | --wall <ms>) [--engine hard@desktop] [--out <file>]
 *   [--budget-ms <n>] [--sample-interval-us <n>] [--limit <n>]`
 *
 * ONE `searchTurn` per position, at one fixed `--work` rung or one `--wall`
 * allowance, with the turn's wall time attributed to the seven phases the
 * usefulness rule's attribution clause names (`E4-PLAN.md` "Usefulness rule",
 * item 2): generation, tables, evaluation, reply search, quiescence, prover
 * and canonical verification. Nothing under `src/ai/hard` is touched or
 * imported for its internals beyond what `engine.ts`'s own `searchTurn`
 * already returns (DEEP EXPOSURE, `RootResult.stats`/`.candidates`/
 * `.rootTrace`/`.ply1` with `opts.expose`/`opts.ply1Trace`) plus the process's
 * own CPU profiler (`node:inspector/promises`), the same technique P8 used by
 * hand (`docs/hard-ai/e3/P8-SLOW-TURNS.md` §1, `--cpu-prof`) — here run
 * IN-PROCESS via `Profiler.start`/`Profiler.stop` around each search, so one
 * invocation can profile many positions without a process per position.
 *
 * WHAT "ATTRIBUTED" MEANS. The CPU profiler samples the call stack every
 * `--sample-interval-us` (default 100 µs); each sample's LEAF frame is
 * classified into one of the seven buckets (plus `instrument`, the exposure
 * instrument's own cost, and `other`, unclassified) by its source file
 * (`classifyUrl` below). Self time per bucket is `hits(bucket) / totalHits ×
 * profiledMs`, so the buckets are additive: they sum to the profiled wall time
 * exactly (modulo sampling noise), unlike an INCLUSIVE call-tree reading (P8's
 * own table), which double-counts by call depth. See
 * `docs/hard-ai/e4/E4.1-PROFILE.md` for the mapping's known imprecision
 * (`src/ai/hard/core/state.ts` bundles `Replica.make`'s bookkeeping with the
 * `provesHomeCheckmate` call it sometimes makes; both are counted as `prover`)
 * and `docs/hard-ai/e4/amendments/lane1.md` for the one metric this file
 * cannot get from the existing instrument (per-node depth-1 SEARCHED count,
 * as opposed to generated count).
 *
 * COMPLETION. `stats.depth` is the count of iterations `iterativeDeepening`
 * COMPLETED (each `depth` from 1 up is only recorded once fully searched,
 * `search/pvs.ts iterativeDeepening`), so it is the "completed iterations"
 * the usefulness rule asks for directly. Root coverage (candidates searched
 * vs listed) and depth-1 coverage (replies generated per root candidate, and
 * the share the generator's own stop-aware sink cut short) come from
 * `RootResult.candidates`/`.ply1` (`opts.expose`, `opts.ply1Trace`;
 * `search/probe.ts`), which is OFF in every production and CI path and adds
 * its own small cost — bucketed separately as `instrument`, not folded into
 * `replySearch`, so it cannot inflate the number it is trying to measure.
 *
 * SAFETY. Every invocation must finish in under 5 minutes (E4 lane rules).
 * Two guards: (1) the P8 position table below marks which positions are
 * `fixed100kSafe` from THEIR OWN recorded fixed-work cost
 * (`lab/results/hard-ai-e3/p8/slow-turns.json`) — a fixed-work search reads no
 * clock and cannot be preempted once started, so an unsafe one is never
 * attempted rather than aborted; (2) `--budget-ms` (default 260,000) is
 * checked BETWEEN positions and stops launching more once it is spent,
 * marking the remainder `skipped` with a reason, which bounds every OTHER
 * set/work combination even though nothing in this file's own positions is
 * individually pathological.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { Session } from 'node:inspector/promises';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { RootResult, RootCandidate, RootTraceRow, Ply1Node } from '../../../src/ai/hard/search/root';
import { WorkClass } from '../../../src/ai/hard/search/time';
import { applyAction } from '../../../src/ai/simulate';
import type { GameState, PlayerId } from '../../../src/game/types';
import { hardEnginePatch } from '../bots/hard';
import { createBot as createScriptedBot } from '../../harness/bots/index';
import { playGame } from '../../harness/runner';
import { loadOpenings, type OpeningSpec } from '../ladder/openings';
import { LADDER_RULES_VERSION, applyLadderOpening } from '../ladder/ruleset';
import { loadReplay, reconstruct, withMatchRules, type LoadedReplay, type ReconstructedTurn } from '../analyze/replay';
import { DEFAULT_MATCH_OPTIONS } from '../../harness/types';
import { resolveEngine, parseWorkSpec, workKey, type WorkSpec } from '../ladder/engines';
import { resolvedConfigHash } from '../ladder/identity';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

// --- phase buckets -----------------------------------------------------------

export const PHASE_BUCKETS = [
  'generation',
  'tables',
  'evaluation',
  'replySearch',
  'quiescence',
  'prover',
  'canonicalVerify',
] as const;
export type PhaseBucket = (typeof PHASE_BUCKETS)[number];
/** Buckets tracked for context but not part of the seven the usefulness rule
 * names: the exposure instrument's own cost, and anything unclassified. */
export type ExtraBucket = 'instrument' | 'other';
export type Bucket = PhaseBucket | ExtraBucket;

/** Ordered, most-specific-first: the first prefix contained in the frame's
 * (repo-root-relative) source path wins. See the module header for what each
 * mapping does and does not mean. */
const BUCKET_RULES: ReadonlyArray<readonly [string, Bucket]> = [
  ['src/ai/hard/search/probe.ts', 'instrument'],
  ['src/ai/hard/search/quiesce.ts', 'quiescence'],
  ['src/ai/hard/tactics/', 'prover'],
  // `Replica.make` (core/state.ts) is where the engine's OWN home-checkmate
  // prover fires mid-search (`provesHomeCheckmate`, P8 §1); the rest of
  // `make`/`unmake`/`isLegal` is ordinary replica bookkeeping. Bundled here
  // because self time cannot be split further without a call-site change to
  // `core/state.ts`; the E4.1 doc states this imprecision next to the number.
  ['src/ai/hard/core/state.ts', 'prover'],
  ['src/ai/hard/gen/', 'generation'],
  ['src/ai/hard/tables/', 'tables'],
  ['src/ai/hard/eval/', 'evaluation'],
  ['src/ai/hard/search/pvs.ts', 'replySearch'],
  ['src/ai/hard/search/tt.ts', 'replySearch'],
  ['src/ai/hard/search/order.ts', 'replySearch'],
  ['src/ai/hard/search/root.ts', 'replySearch'],
  ['src/ai/hard/engine.ts', 'replySearch'],
  // The canonical side (P7): `verify/replay.ts`'s own frames, everything under
  // `src/game/` (home-checkmate adjudication included) and the harness-level
  // `applyAction` replay of the returned plan.
  ['src/ai/hard/verify/', 'canonicalVerify'],
  ['src/ai/simulate.ts', 'canonicalVerify'],
  ['src/game/', 'canonicalVerify'],
];

export function relativizeUrl(url: string): string {
  let u = url;
  if (u.startsWith('file://')) u = u.slice('file://'.length);
  const i = u.indexOf(REPO_ROOT);
  if (i >= 0) return u.slice(i + REPO_ROOT.length + 1);
  // tsx's loader and node internals never resolve under the repo root.
  return u.replace(/^\/+/, '');
}

export function classifyUrl(url: string): Bucket {
  const rel = relativizeUrl(url);
  for (const [prefix, bucket] of BUCKET_RULES) {
    if (rel.includes(prefix)) return bucket;
  }
  return 'other';
}

/**
 * `src/ai/hard/core/*` (besides `state.ts`, already `prover` above) and
 * `src/ai/hard/book/*` are low-level infrastructure — geometry, bitsets, the
 * catalog, packed action encode/decode — called from every phase alike
 * (`core/movement.ts bfsFrom`/`bfsMulti` alone were 51% of one E4.1 run's
 * profiled time on the `e1-losses` set before this fallback existed). A frame
 * here has no phase of its own; `attributeSelfTime` instead charges it to the
 * nearest CALLING ancestor frame this classifier CAN place, which is what
 * "wall time attributed to generation/tables/.../prover" means for a shared
 * helper — the phase that called it, not the helper's own address.
 */
function isSharedInfrastructure(rel: string): boolean {
  if (rel.includes('src/ai/hard/core/state.ts')) return false;
  return rel.includes('src/ai/hard/core/') || rel.includes('src/ai/hard/book/');
}

// --- CPU profile self-time attribution ---------------------------------------

interface CpuProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
  children?: number[];
}
interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
}

export interface FunctionCost {
  fn: string;
  url: string;
  line: number;
  bucket: Bucket;
  selfMs: number;
}

export interface Attribution {
  /** Wall ms the profiler covered (`endTime - startTime`, microseconds -> ms). */
  profiledMs: number;
  /** Self ms per bucket; sums to ~`profiledMs`. */
  byBucket: Record<Bucket, number>;
  /** Every sampled function with `hitCount > 0`, self ms descending. */
  byFunction: FunctionCost[];
}

/** Longest chain of shared-infrastructure ancestors walked before giving up
 * and calling a node `other`; profiles here are a handful of ply deep, so
 * this is generous headroom against a cycle-free tree, not a real limit. */
const MAX_ANCESTOR_HOPS = 512;

export function attributeSelfTime(profile: CpuProfile): Attribution {
  const totalHits = profile.nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0);
  const profiledMs = (profile.endTime - profile.startTime) / 1000;
  const byId = new Map<number, CpuProfileNode>();
  const parentOf = new Map<number, number>();
  for (const n of profile.nodes) byId.set(n.id, n);
  for (const n of profile.nodes) {
    for (const childId of n.children ?? []) parentOf.set(childId, n.id);
  }

  const resolveBucket = (node: CpuProfileNode): Bucket => {
    const rel = relativizeUrl(node.callFrame.url);
    const direct = classifyUrl(node.callFrame.url);
    if (direct !== 'other' || !isSharedInfrastructure(rel)) return direct;
    let id = parentOf.get(node.id);
    for (let hops = 0; id !== undefined && hops < MAX_ANCESTOR_HOPS; hops++) {
      const parent = byId.get(id);
      if (parent === undefined) break;
      const parentBucket = classifyUrl(parent.callFrame.url);
      if (parentBucket !== 'other') return parentBucket;
      id = parentOf.get(id);
    }
    return 'other';
  };

  const byBucket = {} as Record<Bucket, number>;
  const byFunction: FunctionCost[] = [];
  for (const n of profile.nodes) {
    const hits = n.hitCount ?? 0;
    if (hits === 0) continue;
    const ms = totalHits > 0 ? (hits / totalHits) * profiledMs : 0;
    const bucket = resolveBucket(n);
    byBucket[bucket] = (byBucket[bucket] ?? 0) + ms;
    byFunction.push({
      fn: n.callFrame.functionName === '' ? '(anonymous)' : n.callFrame.functionName,
      url: relativizeUrl(n.callFrame.url),
      line: n.callFrame.lineNumber,
      bucket,
      selfMs: ms,
    });
  }
  byFunction.sort((a, b) => b.selfMs - a.selfMs);
  return { profiledMs, byBucket, byFunction };
}

class InProcessProfiler {
  private session = new Session();
  private connected = false;

  async start(sampleIntervalUs: number): Promise<void> {
    await this.session.connect();
    this.connected = true;
    await this.session.post('Profiler.enable');
    await this.session.post('Profiler.setSamplingInterval', { interval: sampleIntervalUs });
    await this.session.post('Profiler.start');
  }

  async stop(): Promise<CpuProfile> {
    const { profile } = await this.session.post('Profiler.stop');
    if (this.connected) {
      this.session.disconnect();
      this.connected = false;
    }
    return profile as unknown as CpuProfile;
  }
}

// --- positions -----------------------------------------------------------

export interface Position {
  id: string;
  set: 'p8' | 'e1-losses' | 'p1-dev';
  label: string;
  side: PlayerId;
  turnNumber: number;
  seatTurnIndex: number;
  startState: GameState;
}

export interface SkippedPosition {
  id: string;
  set: string;
  reason: string;
}

// --- (a) the P8 set ---------------------------------------------------------
// From `lab/results/hard-ai-e3/p8/slow-turns.json` (every seat turn over 20 s
// in the six E3 correctness rows) and `P8-SLOW-TURNS.md` §7's artifact list.
// `expectedTurnMs` is that file's OWN `turnMs` for the position, at fixed
// 100,000 — used both to VALIDATE the reconstruction (the turn found in the
// replay must recall this exact number) and to decide `fixed100kSafe`: a
// position already known (from that prior measurement) to run well past what
// leaves headroom in a 5-minute, several-position batch is excluded from the
// fixed-work runs and reached only at `wall:3000`, which self-aborts.
interface P8Spec {
  replay: string;
  side: PlayerId;
  expectedTurnMs: number;
  label: string;
  fixed100kSafe: boolean;
}

const P8_SPECS: readonly P8Spec[] = [
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-fix-b3/fixed100k/replays/e1-g3-s105_3_1-B-white.json',
    side: 'white',
    expectedTurnMs: 391035,
    label: 'b3-desktop-white-seatTurn22',
    fixed100kSafe: false,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-fix-b3/fixed100k/replays/e1-g3-s105_3_1-B-white.json',
    side: 'black',
    expectedTurnMs: 223961,
    label: 'b3-arm-black-seatTurn22',
    fixed100kSafe: false,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-fix-b3/fixed100k/replays/e1-g3-s105_3_1-B-white.json',
    side: 'black',
    expectedTurnMs: 159849,
    label: 'b3-arm-black-seatTurn21',
    fixed100kSafe: false,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-fix-b3/fixed100k/replays/e1-g3-s105_3_1-B-white.json',
    side: 'white',
    expectedTurnMs: 40050,
    label: 'b3-desktop-white-seatTurn23',
    fixed100kSafe: true,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-fix-b3/fixed100k/replays/e1-g3-s105_3_1-B-white.json',
    side: 'black',
    expectedTurnMs: 24574,
    label: 'b3-arm-black-seatTurn23',
    fixed100kSafe: true,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-fix-b6/fixed100k/replays/e1-g4-s750_3_7-B-white.json',
    side: 'white',
    expectedTurnMs: 35925,
    label: 'b6-desktop-white-seatTurn16-Bwhite',
    fixed100kSafe: true,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-fix-b6/fixed100k/replays/e1-g4-s750_3_7-A-white.json',
    side: 'white',
    expectedTurnMs: 35909,
    label: 'b6-arm-white-seatTurn16-Awhite',
    fixed100kSafe: false,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k/replays/e1-g2-s40_3_3-A-white.json',
    side: 'white',
    expectedTurnMs: 2641138,
    label: 'correct-v1-arm-white-seatTurn25',
    fixed100kSafe: false,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k/replays/e1-g2-s40_3_3-A-white.json',
    side: 'black',
    expectedTurnMs: 927996,
    label: 'correct-v1-desktop-black-seatTurn24',
    fixed100kSafe: false,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k/replays/e1-g2-s40_3_3-A-white.json',
    side: 'white',
    expectedTurnMs: 529023,
    label: 'correct-v1-arm-white-seatTurn24',
    fixed100kSafe: false,
  },
  {
    replay: 'lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k/replays/e1-g2-s40_3_3-A-white.json',
    side: 'black',
    expectedTurnMs: 83023,
    label: 'correct-v1-desktop-black-seatTurn23',
    fixed100kSafe: true,
  },
];

function findByRecordedMs(turns: readonly ReconstructedTurn[], recordedMs: readonly number[], expectedMs: number): ReconstructedTurn {
  const hit = turns.find(t => recordedMs[t.seatTurnIndex] === expectedMs);
  if (hit === undefined) {
    const have = turns.map(t => `${t.seatTurnIndex}:${recordedMs[t.seatTurnIndex] ?? 'n/a'}`).join(', ');
    throw new Error(`profile: no seat turn recorded ${expectedMs} ms among [${have}]`);
  }
  return hit;
}

/**
 * `work` decides which P8 specs are attempted:
 *   - `wall`: every one (P6's stop-aware generation self-aborts by the
 *     deadline; P8-SLOW-TURNS.md §3 measured a worst case of ~25 s).
 *   - `fixed:100000`: only `fixed100kSafe` ones (their OWN recorded cost at
 *     this exact rung leaves headroom in a several-position batch under the
 *     5-minute cap).
 *   - any other fixed rung (this campaign only ever asks for 400,000): NONE.
 *     A fixed-work search reads no clock and cannot be preempted once
 *     started, and going from 100,000 to 400,000 units is 1-2 more ladder
 *     rungs of iterative deepening on positions whose cost is already
 *     dominated by unmetered per-node generation (P8 §1's `injectRescue ->
 *     homeWitness`, not by the rung); with no prior measurement at 400,000 on
 *     ANY of these positions, and the safest of them already spending most of
 *     a 5-minute batch at 100,000, attempting 400,000 risks exceeding the cap
 *     with no way to stop it. Skipped, not attempted; see
 *     `docs/hard-ai/e4/E4.1-PROFILE.md`.
 */
export function buildP8Positions(work: WorkSpec): { positions: Position[]; skipped: SkippedPosition[] } {
  const fixedUnsafeAbove100k = work.mode === 'fixed' && work.units > 100_000;
  const positions: Position[] = [];
  const skipped: SkippedPosition[] = [];
  const cache = new Map<string, { loaded: LoadedReplay; recon: ReturnType<typeof reconstruct> }>();
  for (const spec of P8_SPECS) {
    const id = `p8:${spec.label}`;
    if (fixedUnsafeAbove100k) {
      skipped.push({
        id,
        set: 'p8',
        reason:
          `not attempted at ${workKey(work)}: no position in this set has been measured at more than fixed:100,000, ` +
          `the safest of them already spends most of a 5-minute batch there, and a fixed-work search cannot be ` +
          `preempted once started (P8-SLOW-TURNS.md §1: cost is dominated by unmetered per-node generation, not the ` +
          `rung). See docs/hard-ai/e4/E4.1-PROFILE.md.`,
      });
      continue;
    }
    if (work.mode === 'fixed' && !spec.fixed100kSafe) {
      skipped.push({
        id,
        set: 'p8',
        reason:
          `excluded from fixed-work runs: its own recorded fixed:100,000 cost (${spec.expectedTurnMs} ms, ` +
          `lab/results/hard-ai-e3/p8/slow-turns.json) leaves no headroom under the 5-minute-per-invocation cap ` +
          `for a batch of several positions; run at wall:3000 only (P8-SLOW-TURNS.md §3: self-aborting, worst ` +
          `case measured ~25 s there).`,
      });
      continue;
    }
    let entry = cache.get(spec.replay);
    if (entry === undefined) {
      const loaded = loadReplay(path.resolve(REPO_ROOT, spec.replay));
      entry = { loaded, recon: reconstruct(loaded) };
      cache.set(spec.replay, entry);
    }
    const recorded = entry.loaded.meta.players[spec.side].turnMs ?? [];
    const turn = findByRecordedMs(entry.recon.bySide[spec.side], recorded, spec.expectedTurnMs);
    positions.push({
      id,
      set: 'p8',
      label: spec.label,
      side: spec.side,
      turnNumber: turn.turnNumber,
      seatTurnIndex: turn.seatTurnIndex,
      startState: turn.startState,
    });
  }
  return { positions, skipped };
}

// --- (b) the 12 distinct E1.1 loss positions --------------------------------
// `lab/results/hard-ai-e3/loss-judgment/*.json` (E3.1's loss judgment; each
// file's `fileIds[0]` names the replay under `lab/results/hard-ai-e1/
// e1.1-diag/replays/`, `seat`/`seatTurnIndex` the turn the adviser search ran
// from).
export function buildE1LossPositions(): { positions: Position[]; skipped: SkippedPosition[] } {
  const dir = path.resolve(REPO_ROOT, 'lab/results/hard-ai-e3/loss-judgment');
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'summary.json')
    .sort();
  const positions: Position[] = [];
  const skipped: SkippedPosition[] = [];
  for (const f of files) {
    const judgment = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as {
      fileIds: string[];
      seat: PlayerId;
      seatTurnIndex: number;
      turnNumber: number;
    };
    const fid = judgment.fileIds[0];
    const id = `e1-losses:${fid}`;
    const replayPath = path.resolve(REPO_ROOT, `lab/results/hard-ai-e1/e1.1-diag/replays/${fid}.json`);
    if (!fs.existsSync(replayPath)) {
      skipped.push({ id, set: 'e1-losses', reason: `no replay at lab/results/hard-ai-e1/e1.1-diag/replays/${fid}.json` });
      continue;
    }
    const recon = reconstruct(loadReplay(replayPath));
    const turn = recon.bySide[judgment.seat].find(t => t.seatTurnIndex === judgment.seatTurnIndex);
    if (turn === undefined) {
      skipped.push({ id, set: 'e1-losses', reason: `seatTurnIndex ${judgment.seatTurnIndex} not found for ${judgment.seat} in ${fid}` });
      continue;
    }
    positions.push({
      id,
      set: 'e1-losses',
      label: fid,
      side: judgment.seat,
      turnNumber: turn.turnNumber,
      seatTurnIndex: turn.seatTurnIndex,
      startState: turn.startState,
    });
  }
  return { positions, skipped };
}

// --- (c) 16 p1-dev openings, at game turn 6 ---------------------------------
// `lab/hard-ai/ladder/openings/p1-dev.jsonl` carries only the OPENING (a few
// setup moves), not a game, so there is no replay to reconstruct from; a short
// Rush-vs-Rush game is played from each opening (fast, deterministic, no
// engine search involved) up to `P1_DEV_TARGET_TURN + 1` full rounds, recorded
// in memory, and handed to `analyze/replay.ts`'s own reconstruction so the
// resulting position is built through the SAME canonical-replay-and-compare
// path every other set uses, rather than trusted from the game loop directly.
// White's turn at game turn `P1_DEV_TARGET_TURN` (the position white faces
// after black's turn 5) is the position profiled; a game that ended earlier
// (a Rush-vs-Rush home race, rare but possible) is skipped, not substituted.
//
// PHASING, NOT E1. This set used to read `e1-dev.jsonl`, the E1 Standard book.
// It cannot any more, and not merely as a matter of taste: `lab/harness/runner.ts`
// refuses a non-Phasing `initialState`, and a Standard opening replayed into a
// Phasing state would be a position no game of either rule set reaches. The P1
// dev book (`p1-dev.jsonl`, allocation frozen in `openings/ALLOCATION-P1.md`) is
// the dev split of the Phasing corpus, and it is the only openings file a
// profile of the current engine may draw from — dev only, never `p1-val.jsonl`
// and never the sealed file, which the preregistration spends once.
const P1_DEV_TARGET_TURN = 6;
const P1_DEV_COUNT = 16;
/** Arbitrary, fixed, and irrelevant to any statistical claim: this set carries
 * descriptive rows only (`E4-PLAN.md` "Openings"), so no `seed = 20260940 + n`
 * ledger rule applies to it. */
const P1_DEV_SEED_BASE = 20264100;

function readP1DevOpenings(limit: number): OpeningSpec[] {
  // `loadOpenings` parses and validates every row (id shape, action shape, no
  // `{id, state}` form), which a bare `JSON.parse` per line did not.
  const file = path.resolve(REPO_ROOT, 'lab/hard-ai/ladder/openings/p1-dev.jsonl');
  return loadOpenings(file).openings.slice(0, limit);
}

export async function buildP1DevPositions(limit = P1_DEV_COUNT): Promise<{ positions: Position[]; skipped: SkippedPosition[] }> {
  const openings = readP1DevOpenings(limit);
  const positions: Position[] = [];
  const skipped: SkippedPosition[] = [];
  for (let i = 0; i < openings.length; i++) {
    const opening = openings[i];
    const id = `p1-dev:${opening.id}:turn${P1_DEV_TARGET_TURN}`;
    // Replayed through `openings/phasing.ts`: a Phasing initial state, the
    // `p1-` id check, and the harness invariants after every action.
    const openingState = applyLadderOpening(opening);
    const seed = P1_DEV_SEED_BASE + i;
    const { record, replay } = await playGame({
      bots: { white: createScriptedBot('Rush'), black: createScriptedBot('Rush') },
      seed,
      engineHash: 'profile:p1-dev-build:rush-v-rush',
      runId: `profile-p1-dev-${opening.id}`,
      initialState: openingState,
      options: { maxTurns: P1_DEV_TARGET_TURN + 1, recordReplay: true, legality: 'as-shipped', checkInvariants: true },
    });
    if (replay === null) throw new Error('profile: recordReplay was requested but playGame returned no replay');
    const loaded: LoadedReplay = {
      path: `in-memory:${opening.id}`,
      fileId: opening.id,
      stored: { schema: replay.schema, meta: replay.meta, steps: replay.steps, opening },
      meta: record,
      options: { ...DEFAULT_MATCH_OPTIONS, ...(record.options ?? {}) },
      opening,
      // The runner stamps `rulesVersion` on the record it just returned; this is
      // that same rule set, spelled out so the reconstruction is rules-bound
      // rather than defaulted.
      ruleset: record.rulesVersion === LADDER_RULES_VERSION ? 'phasing' : 'standard',
    };
    const recon = reconstruct(loaded);
    const turn = recon.bySide.white.find(t => t.turnNumber === P1_DEV_TARGET_TURN);
    if (turn === undefined) {
      skipped.push({
        id,
        set: 'p1-dev',
        reason: `the Rush-vs-Rush game (seed ${seed}) ended (winType ${record.winType}) before white's turn ${P1_DEV_TARGET_TURN}`,
      });
      continue;
    }
    positions.push({
      id,
      set: 'p1-dev',
      label: opening.id,
      side: 'white',
      turnNumber: turn.turnNumber,
      seatTurnIndex: turn.seatTurnIndex,
      startState: turn.startState,
    });
  }
  return { positions, skipped };
}

// --- profiling one position --------------------------------------------------

export interface RootCoverage {
  source: string | undefined;
  listed: number;
  searched: number;
}

export interface Ply1Coverage {
  /** Root candidates whose subtree reached at least one ply-1 generation. */
  nodes: number;
  /** Mean candidates the FIRST ply-1 generation under each such root
   * candidate returned (`Ply1Node.n`). */
  meanGenerated: number;
  /** Share of those generations `StopAwareSink` cut short before the
   * generator's own K/beam width (`Ply1Node.cut`) — the closest available
   * proxy for "not fully covered"; see the module header and
   * `docs/hard-ai/e4/amendments/lane1.md` for why this is a proxy and not a
   * true searched-vs-generated count. */
  cutShare: number;
  /** The interior generator's configured beam width, for scale. */
  configuredK: number;
}

export interface PositionProfile {
  id: string;
  set: string;
  label: string;
  side: PlayerId;
  turnNumber: number;
  seatTurnIndex: number;
  work: string;
  /** Wall ms of the `searchTurn` call alone. */
  searchMs: number;
  /** Wall ms of replaying the RETURNED plan through the canonical
   * `applyAction`, outside the engine (P8 §2's own accounting). */
  canonicalReplayMs: number;
  /** `searchMs + canonicalReplayMs`, measured with the same high-resolution
   * timer as the CPU profiler's window, so `attribution.profiledMs` should be
   * close to it. */
  totalMs: number;
  attribution: Attribution;
  stopReason: string;
  source: string;
  fallback: string | undefined;
  /** Completed iterations (`search/pvs.ts iterativeDeepening`'s own depth
   * counter: an iteration only advances `stats.depth` once it finishes). */
  completedIterations: number;
  rung: number;
  workSpent: number;
  byClass: Record<string, number>;
  rootCoverage: RootCoverage;
  ply1: Ply1Coverage;
  rootTrace: RootTraceRow[];
}

const WORK_CLASS_NAMES = Object.entries(WorkClass)
  .sort((a, b) => a[1] - b[1])
  .map(([name]) => name);

function byClassRecord(byClass: Int32Array | readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < WORK_CLASS_NAMES.length; i++) out[WORK_CLASS_NAMES[i]] = byClass[i] ?? 0;
  return out;
}

function ply1Coverage(ply1: readonly Ply1Node[] | undefined, configuredK: number): Ply1Coverage {
  if (ply1 === undefined || ply1.length === 0) return { nodes: 0, meanGenerated: 0, cutShare: 0, configuredK };
  const nodes = ply1.length;
  const meanGenerated = ply1.reduce((s, p) => s + p.n, 0) / nodes;
  const cutShare = ply1.filter(p => p.cut).length / nodes;
  return { nodes, meanGenerated, cutShare, configuredK };
}

function rootCoverage(candidates: readonly RootCandidate[] | undefined, source: string | undefined): RootCoverage {
  if (candidates === undefined) return { source, listed: 0, searched: 0 };
  return { source, listed: candidates.length, searched: candidates.filter(c => c.searched).length };
}

/** Functions kept in `PositionProfile.attribution.byFunction` on disk, self
 * time descending (see the call site for why: a several-thousand-entry list
 * bloats the artifact for no analysis this lane does past the top 3). */
const MAX_PERSISTED_FUNCTIONS = 50;

export async function profileOnePosition(
  engine: HardEngine,
  pos: Position,
  work: WorkSpec,
  sampleIntervalUs: number,
): Promise<PositionProfile> {
  const profiler = new InProcessProfiler();
  await profiler.start(sampleIntervalUs);
  const searchStartedAt = performance.now();
  const result: RootResult =
    work.mode === 'fixed'
      ? await engine.searchTurn(pos.startState, { work: work.units, expose: true, ply1Trace: true })
      : await engine.searchTurn(pos.startState, { targetMs: work.ms, deadlineMs: work.ms, expose: true, ply1Trace: true });
  const searchMs = performance.now() - searchStartedAt;

  const replayStartedAt = performance.now();
  let state = pos.startState;
  for (const action of result.actions) state = applyAction(state, action);
  const canonicalReplayMs = performance.now() - replayStartedAt;

  const profile = await profiler.stop();
  const totalMs = performance.now() - searchStartedAt;
  const full = attributeSelfTime(profile);
  // A multi-second search at 100 us sampling can name several THOUSAND
  // distinct functions (mostly single-hit leaves); `byBucket` is already the
  // complete additive picture and the doc only ever cites the top 3, so only
  // the top `MAX_PERSISTED_FUNCTIONS` (already self-time descending) are kept
  // in the artifact written to disk. `byBucket` sums are computed from the
  // FULL profile before this trim, so they are unaffected by it.
  const attribution: Attribution = { ...full, byFunction: full.byFunction.slice(0, MAX_PERSISTED_FUNCTIONS) };

  return {
    id: pos.id,
    set: pos.set,
    label: pos.label,
    side: pos.side,
    turnNumber: pos.turnNumber,
    seatTurnIndex: pos.seatTurnIndex,
    work: workKey(work),
    searchMs,
    canonicalReplayMs,
    totalMs,
    attribution,
    stopReason: result.stats.stopReason,
    source: result.source,
    fallback: result.fallback,
    completedIterations: result.stats.depth,
    rung: result.stats.rung,
    workSpent: result.work,
    byClass: byClassRecord(result.stats.byClass),
    rootCoverage: rootCoverage(result.candidates, result.candidateSource),
    ply1: ply1Coverage(result.ply1, engine.config.genInterior.K),
    rootTrace: result.rootTrace ?? [],
  };
}

// --- artifact ----------------------------------------------------------------

export interface ProfileArtifact {
  schema: 'muju-hard-ai-e4-profile-v1';
  set: string;
  work: string;
  engine: string;
  engineConfigHash: string;
  resolvedConfigHash: string;
  positions: PositionProfile[];
  skipped: SkippedPosition[];
  summary: {
    n: number;
    abortShare: number;
    meanCompletedIterations: number;
    dominantBucket: Bucket | null;
    meanBucketShare: Record<Bucket, number>;
    top3Functions: FunctionCost[];
  };
  device: string;
  cpus: number;
  node: string;
  git: string | null;
  gitDirty: boolean | null;
  sampleIntervalUs: number;
  at: string;
  note: string;
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
function gitDirty(): boolean | null {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return null;
  }
}

function summarize(positions: readonly PositionProfile[]): ProfileArtifact['summary'] {
  const n = positions.length;
  if (n === 0) {
    return {
      n: 0,
      abortShare: 0,
      meanCompletedIterations: 0,
      dominantBucket: null,
      meanBucketShare: {} as Record<Bucket, number>,
      top3Functions: [],
    };
  }
  const abortShare = positions.filter(p => p.stopReason === 'abort').length / n;
  const meanCompletedIterations = positions.reduce((s, p) => s + p.completedIterations, 0) / n;
  const shareSum: Record<string, number> = {};
  const fnTotals = new Map<string, FunctionCost & { total: number }>();
  for (const p of positions) {
    const total = p.attribution.profiledMs > 0 ? p.attribution.profiledMs : 1;
    for (const [bucket, ms] of Object.entries(p.attribution.byBucket)) {
      shareSum[bucket] = (shareSum[bucket] ?? 0) + ms / total;
    }
    for (const f of p.attribution.byFunction) {
      const key = `${f.url}#${f.fn}`;
      const prior = fnTotals.get(key);
      if (prior === undefined) fnTotals.set(key, { ...f, total: f.selfMs });
      else prior.total += f.selfMs;
    }
  }
  const meanBucketShare = {} as Record<Bucket, number>;
  let dominantBucket: Bucket | null = null;
  let dominantShare = -1;
  for (const [bucket, sum] of Object.entries(shareSum)) {
    const mean = sum / n;
    meanBucketShare[bucket as Bucket] = mean;
    if (mean > dominantShare) {
      dominantShare = mean;
      dominantBucket = bucket as Bucket;
    }
  }
  const top3Functions = [...fnTotals.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map(({ total, ...f }) => ({ ...f, selfMs: total }));
  return { n, abortShare, meanCompletedIterations, dominantBucket, meanBucketShare, top3Functions };
}

function formatArtifactMarkdown(a: ProfileArtifact): string {
  const lines: string[] = [];
  lines.push(`# profile ${a.set} at ${a.work}, ${a.engine}`);
  lines.push('');
  lines.push(`generated ${a.at}, git ${a.git ?? 'unknown'}${a.gitDirty === true ? ' (DIRTY tree)' : ''}, ${a.device}, node ${a.node}`);
  lines.push(`engine config hash ${a.engineConfigHash}, resolved ${a.resolvedConfigHash}`);
  lines.push('');
  lines.push(
    `${a.summary.n} position(s) profiled, ${a.skipped.length} skipped, abort share ${(a.summary.abortShare * 100).toFixed(1)}%, ` +
      `mean completed iterations ${a.summary.meanCompletedIterations.toFixed(2)}, dominant bucket **${a.summary.dominantBucket ?? 'n/a'}**`,
  );
  lines.push('');
  lines.push('| bucket | mean share of profiled wall time |');
  lines.push('| --- | ---: |');
  for (const [bucket, share] of Object.entries(a.summary.meanBucketShare).sort((x, y) => y[1] - x[1])) {
    lines.push(`| ${bucket} | ${(share * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push('top 3 functions by summed self time:');
  for (const f of a.summary.top3Functions) lines.push(`- ${f.selfMs.toFixed(1)} ms  \`${f.fn}\` @ ${f.url}:${f.line} (${f.bucket})`);
  lines.push('');
  lines.push('| position | side | turn | totalMs | searchMs | canonicalReplayMs | completedIters | rootListed | rootSearched | stop | source |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const p of a.positions) {
    lines.push(
      `| ${p.id} | ${p.side} | ${p.turnNumber} | ${p.totalMs.toFixed(0)} | ${p.searchMs.toFixed(0)} | ` +
        `${p.canonicalReplayMs.toFixed(1)} | ${p.completedIterations} | ${p.rootCoverage.listed} | ${p.rootCoverage.searched} | ${p.stopReason} | ${p.source} |`,
    );
  }
  if (a.skipped.length > 0) {
    lines.push('');
    lines.push('skipped:');
    for (const s of a.skipped) lines.push(`- ${s.id}: ${s.reason}`);
  }
  return lines.join('\n') + '\n';
}

// --- CLI ---------------------------------------------------------------------

export interface ProfileRunArgs {
  set: 'p8' | 'e1-losses' | 'p1-dev';
  work: WorkSpec;
  engine: string;
  budgetMs: number;
  sampleIntervalUs: number;
  limit: number | null;
}

export async function buildPositions(args: ProfileRunArgs): Promise<{ positions: Position[]; skipped: SkippedPosition[] }> {
  const built =
    args.set === 'p8'
      ? buildP8Positions(args.work)
      : args.set === 'e1-losses'
        ? buildE1LossPositions()
        : await buildP1DevPositions(args.limit ?? P1_DEV_COUNT);
  if (args.set !== 'p1-dev' && args.limit !== null) {
    return { positions: built.positions.slice(0, args.limit), skipped: built.skipped };
  }
  return built;
}

export async function runProfile(args: ProfileRunArgs): Promise<ProfileArtifact> {
  const { positions, skipped } = await buildPositions(args);
  const engineLabel = args.engine.replace(/^hard@/, '');
  const engine = new HardEngine(hardEnginePatch(engineLabel));
  const profiled: PositionProfile[] = [];
  const runStartedAt = performance.now();
  for (const pos of positions) {
    if (performance.now() - runStartedAt > args.budgetMs) {
      skipped.push({ id: pos.id, set: pos.set, reason: `session time budget (${args.budgetMs} ms) spent before this position started` });
      continue;
    }
    const p = await withMatchRules(DEFAULT_MATCH_OPTIONS, () => profileOnePosition(engine, pos, args.work, args.sampleIntervalUs));
    profiled.push(p);
  }
  const resolvedName = args.engine.startsWith('hard@') ? args.engine : `hard@${args.engine}`;
  return {
    schema: 'muju-hard-ai-e4-profile-v1',
    set: args.set,
    work: workKey(args.work),
    engine: resolvedName,
    engineConfigHash: resolveEngine(resolvedName).configHash(args.work),
    resolvedConfigHash: resolvedConfigHash(resolvedName, args.work),
    positions: profiled,
    skipped,
    summary: summarize(profiled),
    device: `${os.cpus()[0]?.model ?? 'unknown-cpu'} x${os.cpus().length} (${os.platform()}/${os.arch()})`,
    cpus: os.cpus().length,
    node: process.version,
    git: gitRevision(),
    gitDirty: gitDirty(),
    sampleIntervalUs: args.sampleIntervalUs,
    at: new Date().toISOString(),
    note:
      'E4.1 cost-and-completion profile. One searchTurn per position, phase-attributed from an in-process CPU ' +
      'profile (self time by source file) plus the expose/ply1Trace instrument; see docs/hard-ai/e4/E4.1-PROFILE.md.',
  };
}

function parseArgs(argv: string[]): { args: ProfileRunArgs; out: string | null } {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i === -1 || i + 1 >= argv.length ? null : argv[i + 1];
  };
  const set = get('--set');
  const workArg = get('--work');
  const wallArg = get('--wall');
  if (set !== 'p8' && set !== 'e1-losses' && set !== 'p1-dev') {
    throw new Error('profile: --set must be p8, e1-losses or p1-dev');
  }
  if ((workArg === null) === (wallArg === null)) {
    throw new Error('profile: pass exactly one of --work <units> or --wall <ms>');
  }
  const work: WorkSpec = workArg !== null ? parseWorkSpec(`fixed:${workArg}`) : parseWorkSpec(`wall:${wallArg}`);
  const limitArg = get('--limit');
  return {
    args: {
      set,
      work,
      engine: get('--engine') ?? 'hard@desktop',
      budgetMs: Number(get('--budget-ms') ?? '260000'),
      sampleIntervalUs: Number(get('--sample-interval-us') ?? '100'),
      limit: limitArg === null ? null : Number(limitArg),
    },
    out: get('--out'),
  };
}

/** `fixed:100000` -> `fixed100000` (a colon is an awkward filename character
 * on some tools even where the filesystem tolerates it). */
function workFileKey(work: WorkSpec): string {
  return workKey(work).replace(':', '');
}

async function main(): Promise<void> {
  const { args, out } = parseArgs(process.argv.slice(2));
  const artifact = await runProfile(args);
  const defaultOut = path.resolve(REPO_ROOT, `lab/results/hard-ai-e4/profile/${args.set}-${workFileKey(args.work)}.json`);
  const outPath = out !== null ? path.resolve(REPO_ROOT, out) : defaultOut;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n');
  const mdPath = outPath.replace(/\.json$/, '.md');
  fs.writeFileSync(mdPath, formatArtifactMarkdown(artifact));
  console.log(formatArtifactMarkdown(artifact));
  console.log(`profile: wrote ${outPath}`);
  console.log(`profile: wrote ${mdPath}`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main().catch(err => {
    console.error(`profile: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
}
