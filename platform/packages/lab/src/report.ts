// Markdown reports over a SeriesResult. No timestamps, no durations, no
// wall-clock anything: the determinism gate (same seedStart → byte-identical
// report) depends on these functions being pure over their input. Ordering
// is always deterministic (bot names sorted).

import type { SeriesResult } from './runner.ts';
import { wilson, mean, fmtCI } from './stats.ts';

/** 2-seat matchup: win% + 95% Wilson CI per bot. */
export function matchupReport(series: SeriesResult): string {
  const names = Object.keys(series.byBot).sort();
  const lines: string[] = [];
  lines.push('# Matchup Report');
  lines.push('');
  lines.push(`- engineHash: \`${series.engineHash}\``);
  lines.push(`- configHash: \`${series.configHash}\``);
  lines.push(`- seedStart: ${series.seedStart}`);
  lines.push(`- games: ${series.games}`);
  lines.push(`- illegalActions: ${series.illegalActions}`);
  lines.push(`- invariantViolations: ${series.invariantViolations}`);
  lines.push('');
  lines.push('| Bot | Wins | Losses | Draws | Win% [95% CI] |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const name of names) {
    const tally = series.byBot[name];
    const trials = tally.wins + tally.losses + tally.draws;
    const ci = wilson(tally.wins, trials);
    lines.push(`| ${name} | ${tally.wins} | ${tally.losses} | ${tally.draws} | ${fmtCI(ci)} |`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Single-player sweep: success rate (winner === the bot's seat), plus, when
 * the game reports result.scores, mean score + the raw distribution.
 */
export function sweepReport(series: SeriesResult): string {
  const names = Object.keys(series.byBot);
  if (names.length !== 1) {
    throw new Error(
      `sweepReport: expected exactly one bot (single-player sweep), got ${names.length} — use matchupReport for multi-seat runs`,
    );
  }
  const botName = names[0];
  const tally = series.byBot[botName];
  const trials = tally.wins + tally.losses + tally.draws;
  const ci = wilson(tally.wins, trials);

  const scores: number[] = [];
  for (const record of series.records) {
    const seat = Object.keys(record.seatAssignment)[0];
    const s = record.result.scores?.[seat];
    if (typeof s === 'number') scores.push(s);
  }

  const lines: string[] = [];
  lines.push('# Sweep Report');
  lines.push('');
  lines.push(`- bot: ${botName}`);
  lines.push(`- engineHash: \`${series.engineHash}\``);
  lines.push(`- configHash: \`${series.configHash}\``);
  lines.push(`- seedStart: ${series.seedStart}`);
  lines.push(`- games: ${series.games}`);
  lines.push(`- illegalActions: ${series.illegalActions}`);
  lines.push(`- invariantViolations: ${series.invariantViolations}`);
  lines.push('');
  lines.push(`- success rate (winner === seat): ${fmtCI(ci)} (${tally.wins}/${trials})`);
  if (scores.length > 0) {
    lines.push(`- mean score: ${mean(scores).toFixed(3)} (n=${scores.length})`);
    lines.push(`- score distribution: ${scores.join(', ')}`);
  }
  return lines.join('\n') + '\n';
}
