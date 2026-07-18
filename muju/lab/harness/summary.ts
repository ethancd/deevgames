import type { GameRecord } from './types';
import { wilson, mean, fmtCI } from './stats';

/**
 * Aggregate game records into per-pairing summary rows. A "pairing" is the
 * unordered bot pair; seat split is reported inside the row so first-player
 * advantage stays visible.
 */
export interface PairingSummary {
  botA: string; // alphabetically first
  botB: string;
  /** non-default match options (element graph / handicap), '' for baseline */
  variant: string;
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  aWinRate: number;
  aWinLo: number;
  aWinHi: number;
  aWinsAsWhite: number;
  gamesAasWhite: number;
  aWinsAsBlack: number;
  gamesAasBlack: number;
  meanTurns: number;
  adjudicationRate: number;
  invariantViolations: number;
  illegalActionsTotal: number;
  meanDurationMs: number;
}

function variantOf(r: GameRecord): string {
  const parts: string[] = [];
  if (r.options.elementGraph && r.options.elementGraph !== 'double-thick') {
    parts.push(`graph=${r.options.elementGraph}`);
  }
  const h = r.options.handicap;
  if (h && (h.white !== 0 || h.black !== 0)) {
    parts.push(`handicap=w${h.white}/b${h.black}`);
  }
  return parts.join(' ');
}

export function summarize(records: GameRecord[]): PairingSummary[] {
  const groups = new Map<string, GameRecord[]>();
  for (const r of records) {
    const bots = [r.players.white.bot, r.players.black.bot].sort();
    const key = `${bots[0]}|${bots[1]}|${variantOf(r)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const rows: PairingSummary[] = [];
  for (const [key, recs] of groups) {
    const [botA, botB, variant] = key.split('|');
    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    let aWinsAsWhite = 0;
    let gamesAasWhite = 0;
    let aWinsAsBlack = 0;
    let gamesAasBlack = 0;
    let adjudications = 0;
    let invariantViolations = 0;
    let illegal = 0;
    const turns: number[] = [];
    const durs: number[] = [];

    for (const r of recs) {
      const aSeat = r.players.white.bot === botA ? 'white' : 'black';
      if (aSeat === 'white') gamesAasWhite++;
      else gamesAasBlack++;

      if (r.winType === 'invariant-violation') {
        invariantViolations++;
      } else if (r.winner === null) {
        draws++;
      } else {
        const aWon = r.winner === aSeat;
        if (aWon) {
          aWins++;
          if (aSeat === 'white') aWinsAsWhite++;
          else aWinsAsBlack++;
        } else {
          bWins++;
        }
      }
      if (r.winType === 'adjudication') adjudications++;
      illegal += r.players.white.illegalActions + r.players.black.illegalActions;
      turns.push(r.turns);
      durs.push(r.durationMs);
    }

    const decided = aWins + bWins + draws;
    const ci = wilson(aWins, decided);
    rows.push({
      botA,
      botB,
      variant,
      games: recs.length,
      aWins,
      bWins,
      draws,
      aWinRate: ci.p,
      aWinLo: ci.lo,
      aWinHi: ci.hi,
      aWinsAsWhite,
      gamesAasWhite,
      aWinsAsBlack,
      gamesAasBlack,
      meanTurns: mean(turns),
      adjudicationRate: recs.length ? adjudications / recs.length : NaN,
      invariantViolations,
      illegalActionsTotal: illegal,
      meanDurationMs: mean(durs),
    });
  }
  return rows.sort((a, b) => (a.botA + a.botB).localeCompare(b.botA + b.botB));
}

export function summaryToCsv(rows: PairingSummary[]): string {
  const header = [
    'botA',
    'botB',
    'variant',
    'games',
    'aWins',
    'bWins',
    'draws',
    'aWinRate',
    'aWinLo',
    'aWinHi',
    'aWinsAsWhite',
    'gamesAasWhite',
    'aWinsAsBlack',
    'gamesAasBlack',
    'meanTurns',
    'adjudicationRate',
    'invariantViolations',
    'illegalActionsTotal',
    'meanDurationMs',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.botA,
        r.botB,
        r.variant,
        r.games,
        r.aWins,
        r.bWins,
        r.draws,
        r.aWinRate.toFixed(4),
        r.aWinLo.toFixed(4),
        r.aWinHi.toFixed(4),
        r.aWinsAsWhite,
        r.gamesAasWhite,
        r.aWinsAsBlack,
        r.gamesAasBlack,
        r.meanTurns.toFixed(1),
        r.adjudicationRate.toFixed(3),
        r.invariantViolations,
        r.illegalActionsTotal,
        Math.round(r.meanDurationMs),
      ].join(',')
    );
  }
  return lines.join('\n') + '\n';
}

export function printSummary(rows: PairingSummary[]): void {
  for (const r of rows) {
    const ci = { p: r.aWinRate, lo: r.aWinLo, hi: r.aWinHi };
    console.log(
      `${r.botA} vs ${r.botB}${r.variant ? ` [${r.variant}]` : ''}: ${r.aWins}-${r.bWins}-${r.draws} (${r.games} games) ` +
        `| ${r.botA} WR ${fmtCI(ci)} ` +
        `| as white ${r.aWinsAsWhite}/${r.gamesAasWhite}, as black ${r.aWinsAsBlack}/${r.gamesAasBlack} ` +
        `| turns ${r.meanTurns.toFixed(1)} | adjud ${(100 * r.adjudicationRate).toFixed(0)}% ` +
        (r.illegalActionsTotal > 0 ? `| ILLEGAL ${r.illegalActionsTotal} ` : '') +
        (r.invariantViolations > 0 ? `| INVARIANT-VIOLATIONS ${r.invariantViolations} ` : '')
    );
  }
}
