/**
 * E2.2 coverage trace: which stage of the generator removed a known strong turn.
 *
 *   npm run hard:coverage -- --analysis <dir|file> [--replays <dir>] --out <dir>
 *   npm run hard:coverage -- --recall-replies <n> [--corpus <file>] --out <dir>
 *
 * For every (position, target) pair the tool arms `gen/trace.ts`'s `GenTrace`
 * and runs the PRODUCTION generator over the position, then reads off the first
 * shortlist rung the target fell off. Two passes per pair:
 *
 *   1. a CAPTURE pass with `generateReference` (DESIGN §5.6's K 2000, widths
 *      [40,16,8,4], 200 place plans, and its own node budget) whose only job is
 *      to find a packed action line that reaches the target end key. The
 *      structural rungs — keep set, buy set, promotion — are questions about a
 *      LINE, and the analysis JSON records the adviser's turn as display text,
 *      not as packed actions. A target the reference cannot reach is reported
 *      with `capture: none` and only the beam/K rungs answer for it.
 *   2. a MEASURE pass with the production `GenConfig`: `DESKTOP.gen` at a root
 *      node (what `search/pvs.ts generateAt` uses at ply 0) and
 *      `DESKTOP.genInterior` at a reply node (what it uses at ply 1). The
 *      output names which was used per row.
 *
 * Neither pass runs a search, so a row costs one reference generation plus one
 * production generation — well under a second per target.
 *
 * **Targets.** `--analysis` takes E1's per-loss analysis JSON: for each named
 * turn (the first-consequential and the largest-swing one) the ROOT target is
 * the adviser's best turn (`turns[i].adviser.endKey`) at the position before the
 * turn was played, and the REPLY target is the adviser's refutation
 * (`turns[i].reply.refutationKey`) at the position the played turn left.
 * `--recall-replies` rebuilds `lab/hard-ai/recall/run.ts`'s reply items from the
 * corpus tail — play the cheap generator's own best turn, then take the
 * reference generator's best end state at the node it reaches as the target —
 * which is exactly the item whose `replyTop1` E1.3's `reply-wide` arm failed to
 * move.
 *
 * **What the trace cannot see.** The SEARCH. A row whose stage is `present` was
 * offered to the root and removed by nothing under `gen/`; whether the root then
 * examined it needs `RootResult.candidates` (lane 1). The JSON carries a
 * `searched: null` column for that merge.
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyAction } from '../../../src/ai/simulate';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { newKeepSetTable, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { TurnPool, decodeTurn, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import {
  TurnGenerator,
  newGenStats,
  outCapacityFor,
  referenceCapacity,
  type GenStats,
} from '../../../src/ai/hard/gen/generate';
import { firstRemovingStage, newGenTrace, resetGenTrace, type GenStage, type GenTrace } from '../../../src/ai/hard/gen/trace';
import { installRescueWitness } from '../../../src/ai/hard/search/root';
import { DESKTOP } from '../../../src/ai/hard/config';
import { Result, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';
import { armHardConfig, requireArm } from '../ablate/arms';
import { keyHex } from '../analyze/engine';
import { loadReplay, reconstruct, withMatchRules } from '../analyze/replay';
import { readPositions, type RulesBlock } from '../positions/corpus';

const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');

// --- arguments ----------------------------------------------------------------

interface Args {
  analysis: string | null;
  replays: string | null;
  recallReplies: number;
  corpus: string;
  out: string;
  label: string;
  /**
   * `--arm <name>`: measure with `lab/hard-ai/ablate/arms.ts`'s arm instead of
   * DESKTOP. The CAPTURE pass is untouched (the reference generator's shape is
   * fixed by DESIGN §5.6 and does not read the arm), so an arm run and a base
   * run measure the SAME targets and their stage histograms are comparable row
   * by row. Null is `hard@desktop`.
   */
  arm: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    analysis: null,
    replays: null,
    recallReplies: 0,
    corpus: path.resolve(import.meta.dirname, '../../results/hard-ai-e1/ablate/corpus/ablate-corpus.jsonl'),
    out: path.resolve(import.meta.dirname, '../../results/hard-ai-e2/coverage/run'),
    label: 'coverage',
    arm: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--analysis') args.analysis = argv[++i];
    else if (a === '--replays') args.replays = argv[++i];
    else if (a === '--recall-replies') args.recallReplies = Number(argv[++i]);
    else if (a === '--corpus') args.corpus = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--label') args.label = argv[++i];
    else if (a === '--arm') args.arm = requireArm(argv[++i]).name;
    else throw new Error(`coverage/run: unknown argument ${a}`);
  }
  if (args.analysis === null && args.recallReplies <= 0) {
    throw new Error('coverage/run: pass --analysis <dir|file> or --recall-replies <n>');
  }
  return args;
}

// --- the traced generator ------------------------------------------------------

/** Which `GenConfig` a row was measured with, and why. */
type Cone = string;

interface StageRow {
  id: string;
  kind: 'root' | 'reply';
  cone: Cone;
  ply: number;
  targetKey: string;
  /** The reference pass found a line reaching the target. */
  capture: 'reference' | 'production' | 'none';
  captureLen: number;
  stage: GenStage;
  /** `null` until lane 1's `RootResult.candidates` is merged (E2.2 §"blind spot"). */
  searched: null;
  upkeepPending: number;
  keepSetsOffered: number;
  keepSetLimit: number;
  keepPresent: number;
  planCount: number;
  planLimit: number;
  planRank: number;
  planScoreCc: number;
  planCutoffCc: number;
  promoCount: number;
  promoRank: number;
  targetPromos: number;
  multiPromotion: number;
  comboCount: number;
  comboLimit: number;
  comboRank: number;
  comboScoreCc: number;
  comboCutoffCc: number;
  beamReached: number;
  beamPlaceIndex: number;
  beamDepth: number;
  beamGainCc: number;
  beamKeepWidth: number;
  beamKeepDrops: number;
  beamKeepCutoffCc: number;
  beamEmitted: number;
  injected: number;
  offerDisplaced: number;
  k: number;
  finalCount: number;
  finalRank: number;
  finalGainCc: number;
  kthGainCc: number;
  /** `finalGainCc - kthGainCc` when present, `beamGainCc - kthGainCc` when not. */
  marginCc: number;
  note: string;
}

/**
 * One `TurnGenerator` per cone, plus the reference generator that supplies the
 * capture line. `CandidateLister` in `lab/hard-ai/analyze/engine.ts` builds the
 * same rig; this one owns a trace and is lane 4's, so the analyser is untouched.
 */
class Coverage {
  private readonly rep = new Replica();
  private readonly sc = new Scratch(8, 8, 4, 4);
  private readonly tables: NodeTables = allocTables();
  private readonly keep: KeepSetTable = newKeepSetTable();
  private readonly pool = new TurnPool(8192);
  private readonly rootGen: TurnGenerator;
  private readonly interiorGen: TurnGenerator;
  private readonly rootOut: Turn[];
  private readonly interiorOut: Turn[];
  private readonly refOut: Turn[];
  private readonly stats: GenStats = newGenStats();
  private readonly trace: GenTrace = newGenTrace();
  private readonly evaluator: Evaluator;
  private scoreMover: Side = 0;
  readonly rootCone: Cone;
  readonly replyCone: Cone;
  /** `GenStats.nodes` summed over every MEASURE generation, for the cost model. */
  rootNodes = 0;
  replyNodes = 0;
  rootGenerations = 0;
  replyGenerations = 0;

  constructor(arm: string | null) {
    const cfg = arm === null ? DESKTOP : armHardConfig(arm);
    const tag = arm === null ? 'DESKTOP' : `ablate:${arm}`;
    this.rootCone = `root:${tag}.gen`;
    this.replyCone = `reply:${tag}.genInterior`;
    this.rootGen = new TurnGenerator(this.rep, cfg.gen, this.pool, this.sc);
    this.interiorGen = new TurnGenerator(this.rep, cfg.genInterior, this.pool, this.sc);
    installRescueWitness(this.rootGen);
    installRescueWitness(this.interiorGen);
    this.evaluator = new Evaluator(this.rep);
    this.rootOut = new Array<Turn>(outCapacityFor(cfg.gen));
    this.interiorOut = new Array<Turn>(outCapacityFor(cfg.genInterior));
    this.refOut = new Array<Turn>(referenceCapacity());
  }

  private readonly score = (p: PackedState, sc: Scratch, ply: number): Centi => {
    const terminal = terminalScore(p, this.scoreMover, ply);
    if (terminal !== null) return terminal;
    return this.evaluator.stage0(p, this.scoreMover) + this.evaluator.stage1(p, this.scoreMover, sc, ply);
  };

  private prepare(state: GameState, ply: number): PackedState | null {
    let p: PackedState;
    try {
      p = this.rep.pack(state, allocState());
    } catch {
      return null;
    }
    if (p.result !== Result.ONGOING) return null;
    p.proverMode = 2;
    buildTables(p, this.sc, ply, 2, this.tables);
    return p;
  }

  /** The production generator's whole list at a node, best first. */
  listKeys(state: GameState, ply: number): { keys: string[]; best: Turn | null } | null {
    const p = this.prepare(state, ply);
    if (p === null) return null;
    const gen = ply === 0 ? this.rootGen : this.interiorGen;
    const out = ply === 0 ? this.rootOut : this.interiorOut;
    gen.setTrace(null);
    this.pool.reset();
    this.scoreMover = p.side as Side;
    const n = gen.generate(p, this.tables, this.score, UNLIMITED_WORK, ply, this.keep, out, this.stats);
    if (n === 0) return null;
    let best = 0;
    for (let i = 1; i < n; i++) if (out[i].gainCc > out[best].gainCc) best = i;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) keys.push(keyHex(out[i].endHi, out[i].endLo));
    return { keys, best: out[best] };
  }

  /** Plays the production generator's own best turn, as `recall/run.ts playBest` does. */
  playBest(state: GameState): GameState | null {
    const p = this.prepare(state, 0);
    if (p === null) return null;
    this.rootGen.setTrace(null);
    this.pool.reset();
    this.scoreMover = p.side as Side;
    const n = this.rootGen.generate(p, this.tables, this.score, UNLIMITED_WORK, 0, this.keep, this.rootOut, this.stats);
    if (n === 0) return null;
    let best = 0;
    for (let i = 1; i < n; i++) if (this.rootOut[i].gainCc > this.rootOut[best].gainCc) best = i;
    let current = state;
    try {
      for (const action of decodeTurn(p, this.rootOut[best], this.keep)) {
        const next = applyAction(current, action);
        if (next === current) return null;
        current = next;
      }
    } catch {
      return null;
    }
    return current.phase === 'playing' ? current : null;
  }

  /**
   * The reference generator's best end key at a node, by within-turn score.
   * This is the reply-node target `recall/run.ts` measures `replyTop1` against,
   * up to its depth-2 rescoring (which a generator-only tool cannot run cheaply;
   * the report says so).
   */
  referenceBestKey(state: GameState, ply: number): string | null {
    const p = this.prepare(state, ply);
    if (p === null) return null;
    this.rootGen.setTrace(null);
    this.pool.reset();
    this.scoreMover = p.side as Side;
    const n = this.rootGen.generateReference(p, this.tables, this.score, ply, this.keep, this.refOut, this.stats);
    if (n === 0) return null;
    let best = 0;
    for (let i = 1; i < n; i++) if (this.refOut[i].gainCc > this.refOut[best].gainCc) best = i;
    return keyHex(this.refOut[best].endHi, this.refOut[best].endLo);
  }

  /** Capture + measure for one (position, target). */
  measure(id: string, kind: 'root' | 'reply', state: GameState, targetKey: string): StageRow | null {
    const ply = kind === 'root' ? 0 : 1;
    const cone: Cone = ply === 0 ? this.rootCone : this.replyCone;
    const hi = Number.parseInt(targetKey.slice(0, 8), 16);
    const lo = Number.parseInt(targetKey.slice(8, 16), 16);

    // 1 — capture. The reference generator is a beam too, so the watch fires on
    // every boundary it REACHES, kept or not: the line comes back even when the
    // reference would not have listed the turn.
    const pCapture = this.prepare(state, ply);
    if (pCapture === null) return null;
    resetGenTrace(this.trace, hi, lo);
    this.rootGen.setTrace(this.trace);
    this.pool.reset();
    this.scoreMover = pCapture.side as Side;
    this.rootGen.generateReference(pCapture, this.tables, this.score, ply, this.keep, this.refOut, this.stats);
    this.rootGen.setTrace(null);
    const captureLen = this.trace.hitLineLen;
    const captureLine = captureLen > 0 ? Int32Array.from(this.trace.hitLine.subarray(0, captureLen)) : undefined;

    // 2 — measure, with the captured line arming the structural rungs.
    const p = this.prepare(state, ply);
    if (p === null) return null;
    const gen = ply === 0 ? this.rootGen : this.interiorGen;
    const out = ply === 0 ? this.rootOut : this.interiorOut;
    resetGenTrace(this.trace, hi, lo, captureLine, captureLen);
    gen.setTrace(this.trace);
    this.pool.reset();
    this.scoreMover = p.side as Side;
    gen.generate(p, this.tables, this.score, UNLIMITED_WORK, ply, this.keep, out, this.stats);
    gen.setTrace(null);
    // Cost model: `GenStats.nodes` is the within-turn node count the beam spent
    // on this generation, which is what an arm's extra width actually buys and
    // pays for. Summed here so the equal-time price can be forecast.
    if (ply === 0) {
      this.rootNodes += this.stats.nodes;
      this.rootGenerations++;
    } else {
      this.replyNodes += this.stats.nodes;
      this.replyGenerations++;
    }

    const tr = this.trace;
    const stage = firstRemovingStage(tr);
    const margin = tr.finalRank >= 0 ? tr.finalGainCc - tr.kthGainCc : tr.beamReached === 1 ? tr.beamGainCc - tr.kthGainCc : 0;
    return {
      id,
      kind,
      cone,
      ply,
      targetKey,
      capture: captureLen > 0 ? 'reference' : 'none',
      captureLen,
      stage,
      searched: null,
      upkeepPending: tr.upkeepPending,
      keepSetsOffered: tr.keepSetsOffered,
      keepSetLimit: tr.keepSetLimit,
      keepPresent: tr.keepPresent,
      planCount: tr.planCount,
      planLimit: tr.planLimit,
      planRank: tr.planRank,
      planScoreCc: tr.planScoreCc,
      planCutoffCc: tr.planCutoffCc,
      promoCount: tr.promoCount,
      promoRank: tr.promoRank,
      targetPromos: tr.targetPromoCount,
      multiPromotion: tr.multiPromotion,
      comboCount: tr.comboCount,
      comboLimit: tr.comboLimit,
      comboRank: tr.comboRank,
      comboScoreCc: tr.comboScoreCc,
      comboCutoffCc: tr.comboCutoffCc,
      beamReached: tr.beamReached,
      beamPlaceIndex: tr.beamPlaceIndex,
      beamDepth: tr.beamDepth,
      beamGainCc: tr.beamGainCc,
      beamKeepWidth: tr.beamKeepWidth,
      beamKeepDrops: tr.beamKeepDrops,
      beamKeepCutoffCc: tr.beamKeepCutoffCc,
      beamEmitted: tr.beamEmitted,
      injected: tr.injected,
      offerDisplaced: tr.offerDisplaced,
      k: tr.k,
      finalCount: tr.finalCount,
      finalRank: tr.finalRank,
      finalGainCc: tr.finalGainCc,
      kthGainCc: tr.kthGainCc,
      marginCc: margin,
      note: '',
    };
  }
}

// --- analysis mode --------------------------------------------------------------

interface AnalysisTurn {
  seatTurnIndex: number;
  turnNumber: number;
  adviser?: { endKey?: string | null };
  reply?: { refutationKey?: string | null };
}

interface AnalysisFile {
  fileId: string;
  replay: string;
  side: 'white' | 'black';
  turns: AnalysisTurn[];
  firstConsequential?: { seatTurnIndex?: number } | null;
  largestSwing?: { seatTurnIndex?: number } | null;
}

function analysisFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return [target];
  return fs
    .readdirSync(target)
    .filter(f => f.endsWith('.json') && f !== 'summary.json')
    .sort()
    .map(f => path.join(target, f));
}

function replayFor(file: string, analysis: AnalysisFile, override: string | null): string {
  if (override !== null) return path.join(override, `${analysis.fileId}.json`);
  // The recorded `replay` path is the producing worktree's; prefer the local
  // sibling `replays/` directory of the analysis directory's parent.
  const local = path.join(path.dirname(path.dirname(file)), 'replays', `${analysis.fileId}.json`);
  if (fs.existsSync(local)) return local;
  return analysis.replay;
}

function runAnalysisMode(cov: Coverage, args: Args): StageRow[] {
  const rows: StageRow[] = [];
  for (const file of analysisFiles(args.analysis as string)) {
    const analysis = JSON.parse(fs.readFileSync(file, 'utf8')) as AnalysisFile;
    const replayPath = replayFor(file, analysis, args.replays);
    if (!fs.existsSync(replayPath)) {
      process.stderr.write(`coverage: ${analysis.fileId}: no replay at ${replayPath}\n`);
      continue;
    }
    const replay = loadReplay(replayPath);
    const recon = reconstruct(replay);
    const seat = recon.bySide[analysis.side];
    const wanted = new Set<number>();
    for (const c of [analysis.firstConsequential, analysis.largestSwing]) {
      if (c !== null && c !== undefined && typeof c.seatTurnIndex === 'number') wanted.add(c.seatTurnIndex);
    }
    withMatchRules(replay.options, () => {
      for (const index of [...wanted].sort((a, b) => a - b)) {
        const turn = analysis.turns.find(t => t.seatTurnIndex === index);
        const recTurn = seat[index];
        if (turn === undefined || recTurn === undefined) continue;
        const label = `${analysis.fileId}:t${turn.turnNumber}`;
        const adviserKey = turn.adviser?.endKey ?? null;
        if (adviserKey !== null && adviserKey.length === 16) {
          const row = cov.measure(`${label}:root`, 'root', recTurn.startState, adviserKey);
          if (row !== null) rows.push(row);
        }
        const replyKey = turn.reply?.refutationKey ?? null;
        if (replyKey !== null && replyKey.length === 16 && !recTurn.terminal) {
          const row = cov.measure(`${label}:reply`, 'reply', recTurn.endState, replyKey);
          if (row !== null) rows.push(row);
        }
      }
    });
  }
  return rows;
}

// --- recall reply mode ----------------------------------------------------------

function applyRules(rules: RulesBlock): void {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
}

/**
 * `recall/run.ts`'s reply items, retraced. The corpus TAIL supplies the
 * positions (the same slice `--reply-positions` takes), the production root
 * generator plays its own best turn, and the reference generator's best end
 * state at the resulting node is the target.
 */
function runRecallReplies(cov: Coverage, args: Args): StageRow[] {
  const corpusPath = path.isAbsolute(args.corpus) ? args.corpus : path.join(POSITIONS_DIR, args.corpus);
  const corpus = readPositions(corpusPath).filter(sp => sp.state.phase === 'playing');
  const rows: StageRow[] = [];
  for (let i = 0; i < args.recallReplies; i++) {
    const index = corpus.length - 1 - i;
    if (index < 0) break;
    const sp = corpus[index];
    applyRules(sp.rules);
    const replyState = cov.playBest(sp.state);
    if (replyState === null) continue;
    const targetKey = cov.referenceBestKey(replyState, 1);
    if (targetKey === null) continue;
    const row = cov.measure(`reply#${sp.id}`, 'reply', replyState, targetKey);
    if (row === null) continue;
    rows.push(row);
  }
  return rows;
}

// --- reporting -------------------------------------------------------------------

function histogram(rows: readonly StageRow[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const r of rows) h[r.stage] = (h[r.stage] ?? 0) + 1;
  return h;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[(s.length / 2) | 0];
}

function markdown(label: string, rows: readonly StageRow[]): string {
  const root = rows.filter(r => r.kind === 'root');
  const reply = rows.filter(r => r.kind === 'reply');
  const lines: string[] = [];
  lines.push(`# E2.2 coverage trace — ${label}`, '');
  lines.push(`Rows: ${rows.length} (root ${root.length}, reply ${reply.length}).`);
  lines.push('Cones are named per row; `search/pvs.ts generateAt` picks `gen` at ply 0 and `genInterior` at ply 1.', '');
  lines.push('## Stage histogram', '', '| stage | root | reply |', '| --- | --- | --- |');
  const hRoot = histogram(root);
  const hReply = histogram(reply);
  for (const stage of [...new Set([...Object.keys(hRoot), ...Object.keys(hReply)])].sort()) {
    lines.push(`| ${stage} | ${hRoot[stage] ?? 0} | ${hReply[stage] ?? 0} |`);
  }
  lines.push('');
  lines.push('## Rows', '');
  lines.push('| id | kind | cone | stage | capture | plan | combo | beamReached | beamEmitted | K | finalRank | marginCc |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.kind} | ${r.cone} | ${r.stage} | ${r.capture} | ${r.planRank}/${r.planCount} | ${r.comboRank}/${r.comboCount} | ${r.beamReached} | ${r.beamEmitted} | ${r.k} | ${r.finalRank}/${r.finalCount} | ${r.marginCc} |`,
    );
  }
  lines.push('');
  const present = rows.filter(r => r.stage === 'present');
  lines.push(
    `Present in the generator's own list: ${present.length}/${rows.length}. ` +
      'Those rows were removed by nothing under `gen/`; the `searched` column stays null until ' +
      '`RootResult.candidates` (lane 1) is merged.',
  );
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv);
  const cov = new Coverage(args.arm);
  const started = Date.now();
  const rows = args.analysis !== null ? runAnalysisMode(cov, args) : runRecallReplies(cov, args);
  fs.mkdirSync(args.out, { recursive: true });
  const root = rows.filter(r => r.kind === 'root');
  const reply = rows.filter(r => r.kind === 'reply');
  const summary = {
    schema: 'muju-lab-coverage-v1',
    label: args.label,
    at: new Date().toISOString(),
    wallMs: Date.now() - started,
    arm: args.arm,
    cones: { root: cov.rootCone.slice('root:'.length), reply: cov.replyCone.slice('reply:'.length) },
    nodes: {
      root: cov.rootNodes,
      reply: cov.replyNodes,
      rootPerGeneration: cov.rootGenerations === 0 ? 0 : Math.round(cov.rootNodes / cov.rootGenerations),
      replyPerGeneration: cov.replyGenerations === 0 ? 0 : Math.round(cov.replyNodes / cov.replyGenerations),
    },
    rows: rows.length,
    rootRows: root.length,
    replyRows: reply.length,
    histogram: { all: histogram(rows), root: histogram(root), reply: histogram(reply) },
    medianMarginCc: { root: median(root.map(r => r.marginCc)), reply: median(reply.map(r => r.marginCc)) },
    captureMisses: rows.filter(r => r.capture === 'none').length,
  };
  fs.writeFileSync(path.join(args.out, 'coverage.json'), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  fs.writeFileSync(path.join(args.out, 'coverage.md'), `${markdown(args.label, rows)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
