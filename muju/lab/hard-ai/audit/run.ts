/**
 * `npm run hard:audit` — the E2.1 representation audit.
 *
 * Three position sources, one measurement each:
 *
 *   `losses`  the first-consequential and largest-swing roots of the analysed
 *             E1.1 losses, reconstructed with `analyze/replay.ts reconstruct`
 *             (the analyser's own helper, not a copy of it).
 *   `exam`    every root of the exam set's `dev` stratum.
 *   `corpus`  a deterministic sample of `lab/hard-ai/positions/*.jsonl`.
 *
 * For each position: the canonical place-phase enumeration
 * (`place-enum.ts`), the production generator's own candidate list decoded into
 * families (`gen-view.ts`), and — where two promotions are jointly affordable —
 * the bounded static preference signal (`score.ts`).
 *
 * Usage:
 *   node --import tsx lab/hard-ai/audit/run.ts [--sources=losses,exam,corpus]
 *        [--sample=200] [--seed=1] [--out=lab/results/hard-ai-e2/audit]
 *        [--prefer-visits=40000] [--max-prefer=40] [--no-gen]
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState } from '../../../src/game/types';
import { readPositions } from '../positions/corpus';
import { loadStratum, loadCaseState, withExamRules } from '../exam/format';
import { loadReplay, reconstruct, withMatchRules } from '../analyze/replay';
import { resolveHardConfig } from '../analyze/engine';
import { enumeratePlacePhase, type PlaceEnumeration } from './place-enum';
import { GenFamilyLister } from './gen-view';
import { StaticScorer, bestActionCompletion } from './score';
import { PLACE_SHAPES, placeShape, shapeIsGeneratorExpressible, type PlaceShape } from './families';

const CORPUS_FILES = [
  'authored.jsonl',
  'canonical-fixtures.jsonl',
  'economy.jsonl',
  'fuzz-1000.jsonl',
  'openings.jsonl',
  'tactics.jsonl',
];

const LOSS_ANALYSIS_DIR = 'lab/results/hard-ai-e1/e1.1-diag/analysis-v2';
const LOSS_REPLAY_DIR = 'lab/results/hard-ai-e1/e1.1-diag/replays';

interface Args {
  sources: string[];
  sample: number;
  seed: number;
  out: string;
  preferVisits: number;
  maxPrefer: number;
  gen: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    sources: ['losses', 'exam', 'corpus'],
    sample: 200,
    seed: 1,
    out: 'lab/results/hard-ai-e2/audit',
    preferVisits: 6_000,
    maxPrefer: 10,
    gen: true,
  };
  for (const raw of argv) {
    const [k, v] = raw.startsWith('--') ? raw.slice(2).split('=') : [raw, undefined];
    switch (k) {
      case 'sources': a.sources = (v ?? '').split(',').filter(s => s.length > 0); break;
      case 'sample': a.sample = Number(v); break;
      case 'seed': a.seed = Number(v); break;
      case 'out': a.out = v ?? a.out; break;
      case 'prefer-visits': a.preferVisits = Number(v); break;
      case 'max-prefer': a.maxPrefer = Number(v); break;
      case 'no-gen': a.gen = false; break;
      default: throw new Error(`unknown argument ${raw}`);
    }
  }
  return a;
}

/** A tiny deterministic PRNG so a sample is reproducible from `--seed`. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface AuditPosition {
  source: 'losses' | 'exam' | 'corpus';
  id: string;
  state: GameState;
  /** Runs `fn` with this position's rules globals installed. */
  withRules: <T>(fn: () => T) => T;
  /** Family shape of the turn the ADVISER chose here, when known. */
  adviserShape?: PlaceShape;
  /** Family shape of the turn the seat PLAYED here, when known. */
  playedShape?: PlaceShape;
  note?: string;
}

/** `["BUY fire_1@1,0", "PROMOTE 3,3", ...]` -> the place-phase shape. The
 * analyser's `describeAt` spells buys `BUY ` and promotions `PROMOTE `. */
function shapeOfDescribedPlan(lines: readonly string[]): PlaceShape {
  let buys = 0;
  let promos = 0;
  for (const l of lines) {
    if (l.startsWith('BUY ')) buys++;
    else if (l.startsWith('PROMOTE ')) promos++;
  }
  return placeShape(buys, promos);
}

function lossPositions(): AuditPosition[] {
  const out: AuditPosition[] = [];
  if (!fs.existsSync(LOSS_ANALYSIS_DIR)) return out;
  const files = fs.readdirSync(LOSS_ANALYSIS_DIR).filter(f => f.endsWith('.json') && f !== 'summary.json').sort();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(LOSS_ANALYSIS_DIR, f), 'utf8')) as {
      fileId: string;
      turns: { seatTurnIndex: number; played: { actions: string[] }; adviser: { actions: string[] | null } }[];
      firstConsequential?: { seatTurnIndex: number; klass: string } | null;
      largestSwing?: { seatTurnIndex: number; klass: string } | null;
      side: 'white' | 'black';
    };
    const replayFile = path.join(LOSS_REPLAY_DIR, `${j.fileId}.json`);
    if (!fs.existsSync(replayFile)) continue;
    const replay = loadReplay(replayFile);
    const rec = reconstruct(replay);
    const seatTurns = rec.bySide[j.side];
    const picks: { label: string; idx: number | undefined }[] = [
      { label: 'first', idx: j.firstConsequential?.seatTurnIndex },
      { label: 'largest', idx: j.largestSwing?.seatTurnIndex },
    ];
    const taken = new Set<number>();
    for (const pick of picks) {
      if (pick.idx === undefined || taken.has(pick.idx)) continue;
      taken.add(pick.idx);
      const turn = seatTurns.find(t => t.seatTurnIndex === pick.idx);
      if (turn === undefined) continue;
      const row = j.turns.find(t => t.seatTurnIndex === pick.idx);
      out.push({
        source: 'losses',
        id: `${j.fileId}#${pick.label}@seatTurn${pick.idx}`,
        state: turn.startState,
        withRules: fn => withMatchRules(replay.options, fn),
        playedShape: row === undefined ? undefined : shapeOfDescribedPlan(row.played.actions),
        adviserShape: row?.adviser.actions == null ? undefined : shapeOfDescribedPlan(row.adviser.actions),
      });
    }
  }
  return out;
}

function examPositions(): AuditPosition[] {
  const out: AuditPosition[] = [];
  for (const c of loadStratum('dev')) {
    let state: GameState;
    try {
      state = loadCaseState(c);
    } catch {
      continue;
    }
    out.push({ source: 'exam', id: c.id, state, withRules: fn => withExamRules(c, fn) });
  }
  return out;
}

function corpusPositions(sample: number, seed: number): AuditPosition[] {
  const all: AuditPosition[] = [];
  for (const file of CORPUS_FILES) {
    const full = path.join('lab/hard-ai/positions', file);
    if (!fs.existsSync(full)) continue;
    for (const p of readPositions(full)) {
      all.push({
        source: 'corpus',
        id: `${file}#${p.id}`,
        state: p.state,
        withRules: fn => withExamRules({ rules: p.rules }, fn),
      });
    }
  }
  if (all.length <= sample) return all;
  // Deterministic Fisher-Yates over a seeded PRNG, then the first `sample`.
  const rnd = mulberry32(seed);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, sample).sort((a, b) => a.id.localeCompare(b.id));
}

interface Row {
  source: string;
  id: string;
  bank: number;
  legalPrefixes: number;
  placeFamilies: number;
  multiPromotionPrefixes: number;
  inexpressiblePrefixes: number;
  affordablePromotions: number;
  twoJointlyAffordable: boolean;
  cheapestTwoCost: number | null;
  capped: boolean;
  spawnTight: boolean;
  byShape: Record<PlaceShape, number>;
  genCount: number | null;
  genShapes: Record<PlaceShape, number> | null;
  genInexpressibleEmitted: number | null;
  adviserShape?: string;
  adviserExpressible?: boolean;
  playedShape?: string;
  prefer?: {
    /** Best static score of the position the place phase leaves, all prefixes. */
    placeOnlyOne: number | null;
    placeOnlyMulti: number | null;
    placeOnlyDeltaCc: number | null;
    /** Best static end-of-turn score after the canonical action phase, top-N. */
    bestOne: number | null;
    bestMulti: number | null;
    deltaCc: number | null;
    capped: boolean;
    truncated: boolean;
    visits: number;
    prefixesOne: number;
    prefixesMulti: number;
  };
}

/** The bounded static signal: best end-of-turn score with <=1 promotion versus
 * best with >=2, both completed through the canonical action phase. */
function preferenceSignal(
  enumeration: PlaceEnumeration,
  scorer: StaticScorer,
  mover: 0 | 1,
  visitsPerPrefix: number,
  maxPrefixes: number,
): Row['prefer'] {
  const multi = enumeration.prefixes.filter(p => p.family.promotions >= 2);
  const one = enumeration.prefixes.filter(p => p.family.promotions <= 1);
  if (multi.length === 0) return undefined;

  // Rank every prefix by the static score of the position its place phase
  // leaves. This is cheap (one evaluation per prefix, no search), it is
  // uncapped, and it gives the action-phase completion a principled shortlist
  // instead of whatever order the walk happened to record.
  type Ranked = { p: (typeof multi)[number]; placeCc: number | null };
  const rank = (list: typeof multi): Ranked[] =>
    list
      .map(p => ({ p, placeCc: scorer.score(p.end, mover) }))
      .sort((x, y) => (y.placeCc ?? -Infinity) - (x.placeCc ?? -Infinity));
  const rankedMulti = rank(multi);
  const rankedOne = rank(one);
  const topPlace = (r: Ranked[]): number | null => (r.length === 0 ? null : r[0].placeCc);

  let capped = false;
  let truncated = false;
  let visits = 0;
  const best = (r: Ranked[]): number | null => {
    let b: number | null = null;
    for (const entry of r.slice(0, maxPrefixes)) {
      const c = bestActionCompletion(entry.p.end, scorer, mover, visitsPerPrefix);
      visits += c.visits;
      if (c.capped) capped = true;
      if (c.best !== null && (b === null || c.best > b)) b = c.best;
    }
    if (r.length > maxPrefixes) truncated = true;
    return b;
  };
  const bestMulti = best(rankedMulti);
  const bestOne = best(rankedOne);
  const placeOnlyMulti = topPlace(rankedMulti);
  const placeOnlyOne = topPlace(rankedOne);
  return {
    placeOnlyOne,
    placeOnlyMulti,
    placeOnlyDeltaCc: placeOnlyOne === null || placeOnlyMulti === null ? null : placeOnlyMulti - placeOnlyOne,
    bestOne,
    bestMulti,
    deltaCc: bestOne === null || bestMulti === null ? null : bestMulti - bestOne,
    capped,
    truncated,
    visits,
    prefixesOne: one.length,
    prefixesMulti: multi.length,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const positions: AuditPosition[] = [];
  if (args.sources.includes('losses')) positions.push(...lossPositions());
  if (args.sources.includes('exam')) positions.push(...examPositions());
  if (args.sources.includes('corpus')) positions.push(...corpusPositions(args.sample, args.seed));

  const config = resolveHardConfig('desktop');
  const lister = args.gen ? new GenFamilyLister(config.gen, config.weights) : null;
  const scorer = new StaticScorer(config.weights);

  const rows: Row[] = [];
  const started = Date.now();
  for (const pos of positions) {
    const t0 = Date.now();
    const row = pos.withRules((): Row => {
      const e = enumeratePlacePhase(pos.state);
      const mover: 0 | 1 = pos.state.turn.currentPlayer === 'white' ? 0 : 1;
      const gen = lister === null ? null : lister.list(pos.state, 0);
      let genInexpressible: number | null = null;
      if (gen !== null) {
        genInexpressible = 0;
        for (const shape of PLACE_SHAPES) {
          if (!shapeIsGeneratorExpressible(shape)) genInexpressible += gen.byShape[shape];
        }
      }
      return {
        source: pos.source,
        id: pos.id,
        bank: e.bank,
        legalPrefixes: e.prefixes.length,
        placeFamilies: e.families.size,
        multiPromotionPrefixes: e.multiPromotion,
        inexpressiblePrefixes: e.inexpressible,
        affordablePromotions: e.affordablePromotions,
        twoJointlyAffordable: e.twoPromotionsJointlyAffordable,
        cheapestTwoCost: e.cheapestTwoPromotionCost,
        capped: e.capped,
        spawnTight: e.spawn.tight,
        byShape: { ...e.byShape },
        genCount: gen === null ? null : gen.count,
        genShapes: gen === null ? null : { ...gen.byShape },
        genInexpressibleEmitted: genInexpressible,
        adviserShape: pos.adviserShape,
        adviserExpressible: pos.adviserShape === undefined ? undefined : shapeIsGeneratorExpressible(pos.adviserShape),
        playedShape: pos.playedShape,
        prefer: preferenceSignal(e, scorer, mover, args.preferVisits, args.maxPrefer),
      };
    });
    rows.push(row);
    process.stderr.write(`[${rows.length}/${positions.length}] ${row.id} pfx=${row.legalPrefixes} multi=${row.multiPromotionPrefixes} gen=${row.genCount ?? '-'} ${Date.now() - t0} ms\n`);
  }

  const wallMs = Date.now() - started;
  const out = path.resolve(args.out);
  fs.mkdirSync(out, { recursive: true });
  const artifact = {
    schema: 'muju-hard-audit-v1',
    at: new Date().toISOString(),
    args,
    engineProfile: 'hard@desktop',
    genK: config.gen.K,
    maxPlacePlans: config.gen.maxPlacePlans,
    maxPromotions: config.gen.maxPromotions,
    wallMs,
    rows,
    summary: summarise(rows),
  };
  fs.writeFileSync(path.join(out, 'audit.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  fs.writeFileSync(path.join(out, 'audit.md'), renderMarkdown(artifact));
  process.stdout.write(renderMarkdown(artifact));
}

interface Summary {
  positions: number;
  bySource: Record<string, number>;
  withBank: number;
  withAffordablePromotion: number;
  withTwoJointlyAffordable: number;
  withMultiPromotionPrefix: number;
  capped: number;
  spawnTight: number;
  shareTwoJointlyAffordable: number;
  shareMultiPromotionPrefix: number;
  totalPrefixes: number;
  totalMultiPrefixes: number;
  totalInexpressible: number;
  genEmittedInexpressible: number;
  adviserTurns: number;
  adviserInexpressible: number;
  playedTurns: number;
  playedInexpressible: number;
  prefer: {
    positions: number;
    comparable: number;
    multiWins: number;
    multiWinsBy300: number;
    capped: number;
    truncated: number;
    deltas: number[];
    medianDelta: number | null;
    maxDelta: number | null;
    placeOnlyComparable: number;
    placeOnlyMultiWins: number;
    placeOnlyMultiWinsBy300: number;
    placeOnlyMedianDelta: number | null;
    placeOnlyMaxDelta: number | null;
  };
  familyCountHistogram: Record<string, number>;
}

function summarise(rows: readonly Row[]): Summary {
  const bySource: Record<string, number> = {};
  const hist: Record<string, number> = {};
  const deltas: number[] = [];
  const placeDeltas: number[] = [];
  const s: Summary = {
    positions: rows.length,
    bySource,
    withBank: 0,
    withAffordablePromotion: 0,
    withTwoJointlyAffordable: 0,
    withMultiPromotionPrefix: 0,
    capped: 0,
    spawnTight: 0,
    shareTwoJointlyAffordable: 0,
    shareMultiPromotionPrefix: 0,
    totalPrefixes: 0,
    totalMultiPrefixes: 0,
    totalInexpressible: 0,
    genEmittedInexpressible: 0,
    adviserTurns: 0,
    adviserInexpressible: 0,
    playedTurns: 0,
    playedInexpressible: 0,
    prefer: {
      positions: 0, comparable: 0, multiWins: 0, multiWinsBy300: 0, capped: 0, truncated: 0,
      deltas, medianDelta: null, maxDelta: null,
      placeOnlyComparable: 0, placeOnlyMultiWins: 0, placeOnlyMultiWinsBy300: 0,
      placeOnlyMedianDelta: null, placeOnlyMaxDelta: null,
    },
    familyCountHistogram: hist,
  };
  for (const r of rows) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    if (r.bank > 0) s.withBank++;
    if (r.affordablePromotions > 0) s.withAffordablePromotion++;
    if (r.twoJointlyAffordable) s.withTwoJointlyAffordable++;
    if (r.multiPromotionPrefixes > 0) s.withMultiPromotionPrefix++;
    if (r.capped) s.capped++;
    if (r.spawnTight) s.spawnTight++;
    s.totalPrefixes += r.legalPrefixes;
    s.totalMultiPrefixes += r.multiPromotionPrefixes;
    s.totalInexpressible += r.inexpressiblePrefixes;
    if (r.genInexpressibleEmitted !== null) s.genEmittedInexpressible += r.genInexpressibleEmitted;
    if (r.adviserShape !== undefined) {
      s.adviserTurns++;
      if (r.adviserExpressible === false) s.adviserInexpressible++;
    }
    if (r.playedShape !== undefined) {
      s.playedTurns++;
      if (!shapeIsGeneratorExpressible(r.playedShape as PlaceShape)) s.playedInexpressible++;
    }
    const bucket = r.placeFamilies === 0 ? '0' : r.placeFamilies === 1 ? '1' : r.placeFamilies <= 4 ? '2-4' : r.placeFamilies <= 16 ? '5-16' : r.placeFamilies <= 64 ? '17-64' : '65+';
    hist[bucket] = (hist[bucket] ?? 0) + 1;
    if (r.prefer !== undefined) {
      s.prefer.positions++;
      if (r.prefer.capped) s.prefer.capped++;
      if (r.prefer.truncated) s.prefer.truncated++;
      if (r.prefer.deltaCc !== null) {
        s.prefer.comparable++;
        deltas.push(r.prefer.deltaCc);
        if (r.prefer.deltaCc > 0) s.prefer.multiWins++;
        if (r.prefer.deltaCc > 300) s.prefer.multiWinsBy300++;
      }
      if (r.prefer.placeOnlyDeltaCc !== null) {
        s.prefer.placeOnlyComparable++;
        placeDeltas.push(r.prefer.placeOnlyDeltaCc);
        if (r.prefer.placeOnlyDeltaCc > 0) s.prefer.placeOnlyMultiWins++;
        if (r.prefer.placeOnlyDeltaCc > 300) s.prefer.placeOnlyMultiWinsBy300++;
      }
    }
  }
  s.shareTwoJointlyAffordable = rows.length === 0 ? 0 : s.withTwoJointlyAffordable / rows.length;
  s.shareMultiPromotionPrefix = rows.length === 0 ? 0 : s.withMultiPromotionPrefix / rows.length;
  if (deltas.length > 0) {
    const sortedDeltas = [...deltas].sort((a, b) => a - b);
    s.prefer.medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)];
    s.prefer.maxDelta = sortedDeltas[sortedDeltas.length - 1];
  }
  if (placeDeltas.length > 0) {
    const sortedPlace = [...placeDeltas].sort((a, b) => a - b);
    s.prefer.placeOnlyMedianDelta = sortedPlace[Math.floor(sortedPlace.length / 2)];
    s.prefer.placeOnlyMaxDelta = sortedPlace[sortedPlace.length - 1];
  }
  return s;
}

function pct(n: number, d: number): string {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)} %`;
}

function renderMarkdown(a: { summary: Summary; rows: Row[]; wallMs: number; genK: number; maxPlacePlans: number; maxPromotions: number; args: Args }): string {
  const s = a.summary;
  const L: string[] = [];
  L.push('# E2.1 representation audit — measured tables');
  L.push('');
  L.push(`Positions: ${s.positions} (${Object.entries(s.bySource).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
  L.push(`Generator: hard@desktop, K=${a.genK}, maxPlacePlans=${a.maxPlacePlans}, maxPromotions=${a.maxPromotions}.`);
  L.push(`Wall: ${(a.wallMs / 1000).toFixed(1)} s.`);
  L.push('');
  L.push('## Place-phase legality');
  L.push('');
  L.push('| Quantity | Positions | Share |');
  L.push('| --- | --- | --- |');
  L.push(`| bank > 0 | ${s.withBank} | ${pct(s.withBank, s.positions)} |`);
  L.push(`| at least one affordable promotion | ${s.withAffordablePromotion} | ${pct(s.withAffordablePromotion, s.positions)} |`);
  L.push(`| two promotions jointly affordable | ${s.withTwoJointlyAffordable} | ${pct(s.withTwoJointlyAffordable, s.positions)} |`);
  L.push(`| a legal place prefix with >= 2 promotions | ${s.withMultiPromotionPrefix} | ${pct(s.withMultiPromotionPrefix, s.positions)} |`);
  L.push(`| enumeration capped | ${s.capped} | ${pct(s.capped, s.positions)} |`);
  L.push(`| spawn area tight (square abstraction may bite) | ${s.spawnTight} | ${pct(s.spawnTight, s.positions)} |`);
  L.push('');
  L.push(`Legal place prefixes enumerated: ${s.totalPrefixes}.`);
  L.push(`Of those, with >= 2 promotions: ${s.totalMultiPrefixes} (${pct(s.totalMultiPrefixes, s.totalPrefixes)}).`);
  L.push(`Of those, in a shape \`buildCombos\` cannot hold: ${s.totalInexpressible} (${pct(s.totalInexpressible, s.totalPrefixes)}).`);
  L.push(`Multi-promotion turns the production generator actually emitted: ${s.genEmittedInexpressible}.`);
  L.push('');
  L.push('## Distribution of place-family counts per position');
  L.push('');
  L.push('| distinct place families | positions |');
  L.push('| --- | --- |');
  for (const k of ['0', '1', '2-4', '5-16', '17-64', '65+']) {
    if (s.familyCountHistogram[k] !== undefined) L.push(`| ${k} | ${s.familyCountHistogram[k]} |`);
  }
  L.push('');
  L.push('## Chosen turns from the analysed losses');
  L.push('');
  L.push(`Adviser turns classified: ${s.adviserTurns}; in a shape the generator cannot express: ${s.adviserInexpressible}.`);
  L.push(`Played turns classified: ${s.playedTurns}; in a shape the generator cannot express: ${s.playedInexpressible}.`);
  L.push('');
  L.push('## Bounded static preference signal');
  L.push('');
  L.push(`Positions with a legal >= 2-promotion prefix: ${s.prefer.positions}.`);
  L.push(`Comparable (both sides scored): ${s.prefer.comparable}.`);
  L.push('');
  L.push('| signal | comparable | >=2 wins | wins by > 300 cc | median delta cc | max delta cc |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  L.push(`| place-only (uncapped, every prefix) | ${s.prefer.placeOnlyComparable} | ${s.prefer.placeOnlyMultiWins} (${pct(s.prefer.placeOnlyMultiWins, s.prefer.placeOnlyComparable)}) | ${s.prefer.placeOnlyMultiWinsBy300} (${pct(s.prefer.placeOnlyMultiWinsBy300, s.prefer.placeOnlyComparable)}) | ${s.prefer.placeOnlyMedianDelta ?? 'n/a'} | ${s.prefer.placeOnlyMaxDelta ?? 'n/a'} |`);
  L.push(`| with action phase (top-N, capped) | ${s.prefer.comparable} | ${s.prefer.multiWins} (${pct(s.prefer.multiWins, s.prefer.comparable)}) | ${s.prefer.multiWinsBy300} (${pct(s.prefer.multiWinsBy300, s.prefer.comparable)}) | ${s.prefer.medianDelta ?? 'n/a'} | ${s.prefer.maxDelta ?? 'n/a'} |`);
  L.push('');
  L.push(`Action-phase completions that hit their visit cap: ${s.prefer.capped}. Prefix lists truncated to the top N: ${s.prefer.truncated}.`);
  L.push('');
  L.push('This is a STATIC signal: the engine\'s own stage0+stage1 evaluation at depth 0, with no reply search. It is not strength.');
  L.push('');
  L.push('## Positions where >= 2 promotions win the static comparison');
  L.push('');
  L.push('| id | bank | affordable promos | <=1 best cc | >=2 best cc | delta cc | place-only delta cc |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  const winners = a.rows
    .filter(r => r.prefer !== undefined && r.prefer.deltaCc !== null && r.prefer.deltaCc > 0)
    .sort((x, y) => (y.prefer?.deltaCc ?? 0) - (x.prefer?.deltaCc ?? 0))
    .slice(0, 25);
  for (const r of winners) {
    L.push(`| ${r.id} | ${r.bank} | ${r.affordablePromotions} | ${r.prefer?.bestOne ?? 'n/a'} | ${r.prefer?.bestMulti ?? 'n/a'} | ${r.prefer?.deltaCc ?? 'n/a'} | ${r.prefer?.placeOnlyDeltaCc ?? 'n/a'} |`);
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

main().catch(err => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = 1;
});
