/**
 * Frozen scripted reference campaign, before any V2 sanity rows.
 *
 * WHAT THIS SCRIPT IS FOR. It measures the SUBSTRATE, not an engine: fifteen
 * scripted bots, every unordered pairing, both seat orientations on the same
 * seed, two seeds per pairing and handicap, at h0 and h3 — 840 games. Its
 * outputs are the purchase and inactivity-draw bands that Gate 1 later judges
 * an engine's BEHAVIOUR against, frozen before any engine is measured so no
 * threshold can be chosen by looking at a result.
 *
 * ONE RUN PER RULES REVISION. The inactivity-draw rate is a direct function of
 * the draw clock, so a reference measured under one revision says nothing about
 * another. Amendment A4 (2026-09-19) moved the clock from 10 plies to 20, which
 * voided the `p1-scripted-2026-09-18` reference and the bands frozen from it;
 * `p2-scripted-2026-09-19` replaces them. The runner refuses to overwrite an
 * existing results directory, so the old evidence stays where it is.
 *
 * WHAT MAY NOT CHANGE BETWEEN REFERENCES. The bot list, the seed, the seed
 * derivation, the mirroring, the handicaps, the match options and the band
 * FORMULA in `sanityBands` are all fixed: re-measuring their INPUTS under a new
 * revision is the point, and changing the formula at the same time would make
 * the two references incomparable and let a band be chosen rather than derived.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING } from '../../src/game/inactivity';
import { createBot } from './bots';
import { playGame } from './runner';
import { DEFAULT_MATCH_OPTIONS, HARNESS_RULES_VERSION, type GameRecord } from './types';
import { deriveSeed } from './rng';
import { summarize, summaryToCsv } from './summary';
import { wilson } from './stats';

/** Where a reference lands when the command line names no directory. */
export const DEFAULT_RESULTS_DIR = 'lab/harness/results/p2-scripted-2026-09-19';

export const SCRIPTED_BOTS = ['Random', 'Greedy', 'Rush', 'Expand', 'Balanced', 'Turtle', 'Tier1Spam', 'MiningDenial', 'AntiRush',
  'Mono-fire', 'Mono-lightning', 'Mono-water', 'Mono-shadow', 'Mono-plant', 'Mono-metal'] as const;
export const RR_SEED = 20260955;
const L2 = ['Rush', 'Expand', 'Balanced'];

/**
 * The rules revision a set of records was ALL measured under.
 *
 * Bands are a property of one revision. Deriving the label from the records
 * rather than stamping today's constant on them is what lets this function be
 * re-run over frozen historical evidence (`tests/lab/phasing-evidence.test.ts`
 * re-derives the 2026-09-18 bands from its 840 raw games and gets
 * `muju-phasing-1` back, because that is what those games are) — and what makes
 * a silent mixture of two revisions impossible to band.
 */
function soleRulesVersion(records: readonly GameRecord[]): string {
  const seen = [...new Set(records.map(r => r.rulesVersion ?? 'absent (Standard, pre-Phasing)'))].sort();
  if (seen.length !== 1) {
    throw new Error(`scripted reference mixes rules revisions (${seen.join(', ')}); bands belong to exactly one revision`);
  }
  return seen[0];
}

/**
 * The FROZEN band formula. Unchanged since 2026-09-18 and deliberately so: A4
 * re-measures this formula's inputs under `muju-phasing-2`, it does not revise
 * the formula. Any edit here makes two references incomparable.
 */
export function sanityBands(records: GameRecord[]) {
  const rulesVersion = soleRulesVersion(records);
  const strata = L2.flatMap(bot => [0, 3].map(handicap => {
    const games = records.filter(r => r.handicap === handicap && Object.values(r.players).some(p => p.bot === bot));
    if (!games.length) throw new Error(`missing scripted reference stratum ${bot}/h${handicap}`);
    const purchasesPerGame = games.reduce((n, r) => n + r.purchases.filter(p => r.players[p.player].bot === bot).length, 0) / games.length;
    const inactivityDraws = games.filter(r => r.inactivityDraw).length;
    return { bot, handicap, games: games.length, purchasesPerGame, inactivityDraws, inactivityWilson: wilson(inactivityDraws, games.length) };
  }));
  return {
    rulesVersion, strata,
    // Predeclared envelope: under-buying floor, generous volume ceiling;
    // lower draw rates are welcome, the veto is excessive inactivity.
    purchaseRatePerSeat: [0.5 * Math.min(...strata.map(s => s.purchasesPerGame)), 2 * Math.max(...strata.map(s => s.purchasesPerGame))],
    inactivityDrawRate: [0, Math.min(1, 0.05 + Math.max(...strata.map(s => s.inactivityWilson.hi)))],
    application: 'Apply separately to each aiv2-hard vs Rush/Expand/Balanced row, each h0/h3 stratum; count only aiv2-hard purchases. This is only the purchase/draw part of Gate 1.',
  };
}

async function main() {
  const out = path.resolve(process.argv[2] ?? DEFAULT_RESULTS_DIR);
  if (fs.existsSync(out)) throw new Error(`refuses to overwrite evidence directory ${out}`);
  fs.mkdirSync(out, { recursive: true });
  // The run id is the directory's own name, so a record can never claim to
  // belong to the reference it is not filed under. The 2026-09-18 campaign
  // hard-coded `p1-scripted-2026-09-18` and would have stamped that id on the
  // games of any other directory it was pointed at.
  const runId = path.basename(out);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const sourcePaths = execFileSync('rg', ['--files', 'lab/harness', 'src/game', 'src/ai'], { encoding: 'utf8' })
    .trim().split('\n').filter(p => !p.includes('/results/')).sort();
  const sources = Object.fromEntries(sourcePaths.map(p => [p, createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
  const manifest = { rulesVersion: HARNESS_RULES_VERSION, runId, revision, dirty, seed: RR_SEED, bots: SCRIPTED_BOTS,
    repeats: 2, handicaps: [0, 3], mirrored: true, options: DEFAULT_MATCH_OPTIONS,
    // The one input that moved between this reference and 2026-09-18's, written
    // out as a number as well as hashed into `sources` via src/game/inactivity.ts.
    inactivity: { limitPlies: INACTIVITY_LIMIT, warningPlies: INACTIVITY_WARNING, resetBy: 'an attack that removes a unit' },
    sources,
    bandRule: 'purchase per seat [0.5 * minimum L2/h mean, 2 * maximum L2/h mean]; inactivity [0, min(1, max L2/h Wilson95 upper + .05)]',
    startLoad: os.loadavg(), startedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const records: GameRecord[] = [];
  let pair = 0;
  for (let a = 0; a < SCRIPTED_BOTS.length; a++) for (let b = a + 1; b < SCRIPTED_BOTS.length; b++) {
    for (const handicap of [0, 3]) for (let repeat = 0; repeat < 2; repeat++) {
      const seed = deriveSeed(RR_SEED, pair++);
      for (const [white, black] of [[SCRIPTED_BOTS[a], SCRIPTED_BOTS[b]], [SCRIPTED_BOTS[b], SCRIPTED_BOTS[a]]]) {
        const bots = { white: createBot(white), black: createBot(black) };
        if (bots.white.kind !== 'scripted' || bots.black.kind !== 'scripted') throw new Error('scripted drivers only');
        const { record } = await playGame({ bots, seed, engineHash: revision, runId, options: { blackCrystalHandicap: handicap } });
        records.push(record);
        fs.appendFileSync(path.join(out, 'games.jsonl'), JSON.stringify(record) + '\n');
        if (record.invariantViolation || record.anomalies.length || Object.values(record.players).some(p => p.illegalActions)) {
          throw new Error(`unclean game ${records.length}; campaign void`);
        }
      }
    }
    if (records.length % 80 === 0) process.stdout.write(`${records.length}/840 clean games\n`);
  }
  // WAS THIS ONE TREE? The manifest hashes the sources BEFORE the first game,
  // but this campaign runs in a worktree several lanes are editing at once, so
  // "the manifest pinned a hash" and "every game was played against that file"
  // are different claims. Re-hash and say which is true. A scripted game is
  // decided by `src/game/**` and `lab/harness/**` and nothing else, so a change
  // under either of those mid-run means the 840 games are not one population
  // and the campaign is void rather than merely annotated.
  const changedDuringRun = sourcePaths.filter(p => createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== sources[p]);
  const decisive = changedDuringRun.filter(p => p.startsWith('src/game/') || p.startsWith('lab/harness/'));
  if (decisive.length) {
    throw new Error(`source changed while the campaign ran, so its games are not one identity: ${decisive.join(', ')}; campaign void`);
  }
  fs.writeFileSync(path.join(out, 'summary.csv'), summaryToCsv(summarize(records)));
  fs.writeFileSync(path.join(out, 'sanity-bands.json'), JSON.stringify(sanityBands(records), null, 2) + '\n');
  const totals = { games: records.length, illegalActions: 0, invariantFailures: 0,
    inactivityDraws: records.filter(r => r.inactivityDraw).length,
    adjudications: records.filter(r => r.adjudicated).length,
    meanCompletedTurns: records.reduce((n, r) => n + (r.completedTurns ?? 0), 0) / records.length,
    meanMaxInactivityPlies: records.reduce((n, r) => n + (r.maxInactivityPlies ?? 0), 0) / records.length,
    purchasesPerGame: records.reduce((n, r) => n + r.purchases.length, 0) / records.length,
    // Empty when nothing moved. Anything listed here is a file no game's result
    // depends on (a decisive change aborts above), recorded rather than hidden.
    changedDuringRun,
    endLoad: os.loadavg(), completedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(out, 'totals.json'), JSON.stringify(totals, null, 2) + '\n');
  process.stdout.write(JSON.stringify(totals) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
