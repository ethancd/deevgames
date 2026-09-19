/** Frozen scripted reference campaign, before any V2 sanity rows. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBot } from './bots';
import { playGame } from './runner';
import { DEFAULT_MATCH_OPTIONS, type GameRecord } from './types';
import { deriveSeed } from './rng';
import { summarize, summaryToCsv } from './summary';
import { wilson } from './stats';

export const SCRIPTED_BOTS = ['Random', 'Greedy', 'Rush', 'Expand', 'Balanced', 'Turtle', 'Tier1Spam', 'MiningDenial', 'AntiRush',
  'Mono-fire', 'Mono-lightning', 'Mono-water', 'Mono-shadow', 'Mono-plant', 'Mono-metal'] as const;
export const RR_SEED = 20260955;
const L2 = ['Rush', 'Expand', 'Balanced'];

export function sanityBands(records: GameRecord[]) {
  const strata = L2.flatMap(bot => [0, 3].map(handicap => {
    const games = records.filter(r => r.handicap === handicap && Object.values(r.players).some(p => p.bot === bot));
    if (!games.length) throw new Error(`missing scripted reference stratum ${bot}/h${handicap}`);
    const purchasesPerGame = games.reduce((n, r) => n + r.purchases.filter(p => r.players[p.player].bot === bot).length, 0) / games.length;
    const inactivityDraws = games.filter(r => r.inactivityDraw).length;
    return { bot, handicap, games: games.length, purchasesPerGame, inactivityDraws, inactivityWilson: wilson(inactivityDraws, games.length) };
  }));
  return {
    rulesVersion: 'muju-phasing-1', strata,
    // Predeclared envelope: under-buying floor, generous volume ceiling;
    // lower draw rates are welcome, the veto is excessive inactivity.
    purchaseRatePerSeat: [0.5 * Math.min(...strata.map(s => s.purchasesPerGame)), 2 * Math.max(...strata.map(s => s.purchasesPerGame))],
    inactivityDrawRate: [0, Math.min(1, 0.05 + Math.max(...strata.map(s => s.inactivityWilson.hi)))],
    application: 'Apply separately to each aiv2-hard vs Rush/Expand/Balanced row, each h0/h3 stratum; count only aiv2-hard purchases. This is only the purchase/draw part of Gate 1.',
  };
}

async function main() {
  const out = path.resolve(process.argv[2] ?? 'lab/harness/results/p1-scripted-2026-09-18');
  if (fs.existsSync(out)) throw new Error(`refuses to overwrite evidence directory ${out}`);
  fs.mkdirSync(out, { recursive: true });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourcePaths = execFileSync('rg', ['--files', 'lab/harness', 'src/game', 'src/ai'], { encoding: 'utf8' })
    .trim().split('\n').filter(p => !p.includes('/results/')).sort();
  const sources = Object.fromEntries(sourcePaths.map(p => [p, createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
  const manifest = { rulesVersion: 'muju-phasing-1', revision, dirty: true, seed: RR_SEED, bots: SCRIPTED_BOTS,
    repeats: 2, handicaps: [0, 3], mirrored: true, options: DEFAULT_MATCH_OPTIONS, sources,
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
        const { record } = await playGame({ bots, seed, engineHash: revision, runId: 'p1-scripted-2026-09-18', options: { blackCrystalHandicap: handicap } });
        records.push(record);
        fs.appendFileSync(path.join(out, 'games.jsonl'), JSON.stringify(record) + '\n');
        if (record.invariantViolation || record.anomalies.length || Object.values(record.players).some(p => p.illegalActions)) {
          throw new Error(`unclean game ${records.length}; campaign void`);
        }
      }
    }
    if (records.length % 80 === 0) process.stdout.write(`${records.length}/840 clean games\n`);
  }
  fs.writeFileSync(path.join(out, 'summary.csv'), summaryToCsv(summarize(records)));
  fs.writeFileSync(path.join(out, 'sanity-bands.json'), JSON.stringify(sanityBands(records), null, 2) + '\n');
  const totals = { games: records.length, illegalActions: 0, invariantFailures: 0,
    inactivityDraws: records.filter(r => r.inactivityDraw).length,
    adjudications: records.filter(r => r.adjudicated).length,
    meanCompletedTurns: records.reduce((n, r) => n + (r.completedTurns ?? 0), 0) / records.length,
    purchasesPerGame: records.reduce((n, r) => n + r.purchases.length, 0) / records.length,
    endLoad: os.loadavg(), completedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(out, 'totals.json'), JSON.stringify(totals, null, 2) + '\n');
  process.stdout.write(JSON.stringify(totals) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
