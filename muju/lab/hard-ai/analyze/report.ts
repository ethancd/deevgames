/**
 * Artifacts: one JSON and one short markdown per replay, plus the `--run`
 * summary with its class histogram.
 *
 * The markdown is the thing a person reads; the JSON is the thing a later slice
 * aggregates. Neither is ever written into the run's own `manifest.json`,
 * `metrics.json` or `games.jsonl` — `--run` writes only under `<dir>/analysis/`.
 */
import type { AnalysisResult, Classification, LossClass, TurnRow } from './analyze';

function cc(n: number): string {
  return n.toLocaleString('en-US');
}

function shortKey(key: string | null): string {
  return key === null ? '—' : key.slice(0, 8);
}

function turnTable(rows: readonly TurnRow[]): string {
  const head =
    '| turn | played | played key | in K? | adviser | adviser key | K has adviser? | played cc | adviser cc | swing cc | engine cc | turn ms |\n' +
    '| ---: | --- | --- | :-: | --- | --- | :-: | ---: | ---: | ---: | ---: | ---: |';
  const body = rows.map(r => {
    const played = r.played.actions.join(' ') || '(none)';
    const adviser = r.adviser.actions.join(' ') || '(none)';
    return `| ${r.turnNumber} | ${played} | \`${shortKey(r.played.endKey)}\` | ${r.cheap.containsPlayed ? 'yes' : 'NO'} | ${adviser} | \`${shortKey(r.adviser.endKey)}\` | ${r.cheap.containsAdviserBest ? 'yes' : 'NO'} | ${cc(r.playedDeepCc)} | ${cc(r.adviserBestDeepCc)} | ${cc(r.swingCc)} | ${r.engine.scoreCc === null ? '—' : cc(r.engine.scoreCc)} | ${r.timing.turnMs ?? '—'}${r.timing.overran ? ' ⚠' : ''} |`;
  });
  return [head, ...body].join('\n');
}

function classBlock(title: string, c: Classification): string {
  const where = c.turn === null ? 'no turn' : `turn ${c.turn} (the seat's turn #${(c.seatTurnIndex ?? 0) + 1})`;
  return [`### ${title}`, '', `**${c.klass}** at ${where}.`, '', `Rule: ${c.rule}`, '', `Evidence: ${c.evidence}`].join('\n');
}

export function renderMarkdown(a: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`# Replay analysis — ${a.fileId}`);
  lines.push('');
  lines.push(
    `Seat under analysis: **${a.side}** (\`${a.seatBot}\`) against \`${a.opponentBot}\`, opening \`${a.opening}\`. ` +
      `The game ended ${a.outcome.winType} for ${a.outcome.winner ?? 'nobody'} after ${a.outcome.turns} turns — a **${a.outcome.sideResult}** for this seat.`,
  );
  lines.push('');
  lines.push(
    `Adviser: \`${a.config.engineLabel}\` at ${cc(a.config.adviserWork)} work units; production re-run at ${cc(a.config.productionWork)} units ` +
      `(the ladder's representative rung for this profile is ${cc(a.config.ladderWorkRung)}). ` +
      `Swing threshold ${cc(a.config.swingCc)} cc. Generator K=${a.config.genK} at the root, ${a.config.genInteriorK} at a reply node. ` +
      `Reconstruction replayed ${a.reconstruction.plies} plies through the canonical engine and matched \`meta\`.`,
  );
  lines.push('');
  lines.push('**An adviser is not an oracle.** Every number below is the same evaluation looking further, not ground truth.');
  lines.push('');
  lines.push('## Per-turn table');
  lines.push('');
  lines.push(turnTable(a.turns));
  lines.push('');
  lines.push(
    '`played cc` is the adviser\'s value of the position the played turn left, searched at the adviser rung and taken from this seat\'s point of view; ' +
      '`adviser cc` is the identical treatment of the adviser\'s own best turn; `swing cc` is their difference. ' +
      '`engine cc` is the production engine\'s own root score from the same state at the ladder rung.',
  );
  lines.push('');
  lines.push(classBlock('First consequential decision', a.firstConsequential));
  lines.push('');
  lines.push(classBlock('Largest swing', a.largestSwing));
  if (a.reconstruction.notes.length > 0) {
    lines.push('');
    lines.push('### Reconstruction notes');
    lines.push('');
    for (const note of a.reconstruction.notes) lines.push(`- ${note}`);
  }
  const turnNotes = a.turns.filter(r => r.notes.length > 0);
  if (turnNotes.length > 0) {
    lines.push('');
    lines.push('### Turn notes');
    lines.push('');
    for (const row of turnNotes) for (const note of row.notes) lines.push(`- turn ${row.turnNumber}: ${note}`);
  }
  lines.push('');
  lines.push(`_${a.wallMs} ms of analysis wall time; analyser config \`${a.config.analyserConfigHash}\`; run recorded \`${a.config.recordedEngineConfigHash ?? 'none'}\`._`);
  lines.push('');
  return lines.join('\n');
}

export interface RunSummary {
  schema: 'muju-hard-analyze-summary-v1';
  dir: string;
  lossesOnly: boolean;
  analysed: number;
  skipped: Array<{ file: string; reason: string }>;
  failed: Array<{ file: string; error: string }>;
  adviserWork: number;
  swingCc: number;
  /** Class histogram over each game's FIRST consequential decision. */
  firstConsequentialHistogram: Record<string, number>;
  /** Class histogram over each game's LARGEST-swing turn. */
  largestSwingHistogram: Record<string, number>;
  games: Array<{
    fileId: string;
    side: string;
    result: string;
    firstConsequential: { turn: number | null; klass: LossClass };
    largestSwing: { turn: number | null; klass: LossClass; swingCc: number | null };
  }>;
  wallMs: number;
  at: string;
}

export function renderSummaryMarkdown(s: RunSummary): string {
  const lines: string[] = [];
  lines.push(`# Replay analysis summary — ${s.dir}`);
  lines.push('');
  lines.push(
    `${s.analysed} game(s) analysed${s.lossesOnly ? ' (losses for the hard@ seat only)' : ''} at ${s.adviserWork.toLocaleString('en-US')} adviser work units, ` +
      `swing threshold ${s.swingCc.toLocaleString('en-US')} cc.`,
  );
  lines.push('');
  lines.push('## Class histogram — first consequential decision');
  lines.push('');
  lines.push('| class | games |');
  lines.push('| --- | ---: |');
  for (const [k, v] of Object.entries(s.firstConsequentialHistogram)) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## Class histogram — largest-swing turn');
  lines.push('');
  lines.push('| class | games |');
  lines.push('| --- | ---: |');
  for (const [k, v] of Object.entries(s.largestSwingHistogram)) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## Games');
  lines.push('');
  lines.push('| game | seat | result | first consequential | class | largest swing turn | class | swing cc |');
  lines.push('| --- | --- | --- | ---: | --- | ---: | --- | ---: |');
  for (const g of s.games) {
    lines.push(
      `| ${g.fileId} | ${g.side} | ${g.result} | ${g.firstConsequential.turn ?? '—'} | ${g.firstConsequential.klass} | ${g.largestSwing.turn ?? '—'} | ${g.largestSwing.klass} | ${g.largestSwing.swingCc ?? '—'} |`,
    );
  }
  if (s.skipped.length > 0) {
    lines.push('');
    lines.push('## Skipped');
    lines.push('');
    for (const skip of s.skipped) lines.push(`- ${skip.file}: ${skip.reason}`);
  }
  if (s.failed.length > 0) {
    lines.push('');
    lines.push('## Failed');
    lines.push('');
    for (const fail of s.failed) lines.push(`- ${fail.file}: ${fail.error}`);
  }
  lines.push('');
  lines.push(`_${s.wallMs} ms of analysis wall time. This file is written under \`analysis/\`; the run's own manifest and metrics are never touched._`);
  lines.push('');
  return lines.join('\n');
}

export function histogram(values: readonly LossClass[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
