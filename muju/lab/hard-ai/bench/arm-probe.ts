/**
 * `npm run hard:arm-probe -- --arms <a,b> --positions <n> --out <dir>` — the
 * per-position mechanism probe for an ALLOCATION arm (E2 opening critique C4).
 *
 * A ladder row prices an arm in Elo over a whole campaign. This prices it per
 * position, in the quantities the arm is supposed to move: the rung it lands
 * on, the work it spends, the fraction of its allowance it uses, whether the
 * watchdog cut it, the depth it completed — and, for a position where the
 * analyser has already named a better turn, WHETHER THE ARM PLAYS IT. That last
 * column is what a rung/work table cannot tell you and what the E2 opening
 * critique's B1 says row 3 was missing.
 *
 * WHY IT IS IN THE TREE. The four-arm probe that rejected `deep-gate` and sized
 * row 3 was a scratch script; C4's objection was not that its numbers were
 * wrong but that nobody could re-run them. This file is that script, with the
 * position bug fixed.
 *
 * THE POSITION BUG. The scratch version reconstructed the sweep's turns from
 * replay paths rebased across worktrees and searched them with a bare `DESKTOP`
 * config; it disagreed with lane 2's sweep about which turn the engine plays.
 * Here the position comes from `reconstruct(replay).bySide[side]` selected by
 * `turnNumber` inside the replay's own `withMatchRules`, and the config from
 * `resolveHardConfig(hardProfileOf(<the seat's own engineLabel>))` — the same
 * two resolutions `analyze/work-sweep.ts` uses, so a disagreement with the
 * sweep is now a real one.
 *
 * WALL MODE, WARMED. The arm only exists in wall mode, and the rung it picks
 * depends on `profile.unitsPerMs`, which an engine learns from its own
 * searches. A cold engine would measure the arm at `INITIAL_UNITS_PER_MS`
 * rather than at this box's real rate, so every measurement is preceded by
 * `--warmup` searches of the same position on the same engine, and the measured
 * units/ms is reported next to the rung so a probe number can be compared with
 * a real game's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HardEngine } from '../../../src/ai/hard/engine';
import { requireArm } from '../ablate/arms';
import { resolveHardConfig } from '../analyze/engine';
import { hardProfileOf, loadReplay, reconstruct, withMatchRules } from '../analyze/replay';
import type { HardConfig } from '../../../src/ai/hard/config';
import type { GameState } from '../../../src/game/types';
import type { MatchOptions } from '../../harness/types';

const REPO = path.resolve(import.meta.dirname, '../../..');
const SWEEP = path.join(REPO, 'lab/results/hard-ai-e2/analysis/e1.1-losses-work-sweep-fresh/sweep.json');
const EXPOSED = path.join(REPO, 'lab/results/hard-ai-e2/analysis/e1.1-losses-exposed');

const ALLOWANCE_MS = 3000;

interface ProbeTarget {
  id: string;
  state: GameState;
  options: MatchOptions;
  /** The seat's own engine label, so the arm patches the config it really ran. */
  engineLabel: string;
  /** The turn the analyser's deeper search preferred, and its deep score. */
  adviserEndKey: string;
  adviserBestDeepCc: number;
  playedEndKey: string | null;
  /** The fixed-work rung at which lane 2's sweep first flipped, or null. */
  flipWork: number | null;
}

export interface ProbeRow {
  arm: string;
  positionId: string;
  rung: number;
  work: number;
  elapsedMs: number;
  usedFrac: number;
  depth: number;
  stopReason: string;
  aborted: boolean;
  unitsPerMsBefore: number;
  unitsPerMsAfter: number;
  endKey: string;
  isAdviserBest: boolean;
  isPlayed: boolean;
}

/**
 * The sweep's turns, DE-DUPLICATED by (adviser, played) end key. Two of its 14
 * rows are one position reached by two move orders (`g4-s6_3_5` and
 * `g5-s7_3_7`, the opening critique's B1), so the honest N is 12.
 */
export function sweepTargets(): ProbeTarget[] {
  const sweep = JSON.parse(fs.readFileSync(SWEEP, 'utf8')) as { turns: Array<Record<string, unknown>> };
  const seen = new Set<string>();
  const out: ProbeTarget[] = [];
  for (const t of sweep.turns) {
    const key = `${t.adviserEndKey as string}|${t.playedEndKey as string}`;
    if (seen.has(key)) continue;
    const fileId = t.fileId as string;
    const saved = JSON.parse(fs.readFileSync(path.join(EXPOSED, `${fileId}.json`), 'utf8')) as {
      replay: string;
      side: 'white' | 'black';
      config: { engineLabel: string };
    };
    const cut = saved.replay.lastIndexOf('/muju/');
    const replayPath = cut < 0 ? saved.replay : path.join(REPO, saved.replay.slice(cut + '/muju/'.length));
    const replay = loadReplay(replayPath);
    const turn = reconstruct(replay).bySide[saved.side].find(x => x.turnNumber === (t.turnNumber as number));
    if (turn === undefined) throw new Error(`${fileId} t${t.turnNumber as number}: not reconstructed`);
    seen.add(key);
    out.push({
      id: `${fileId}:t${t.turnNumber as number}`,
      state: turn.startState,
      options: replay.options,
      engineLabel: saved.config.engineLabel,
      adviserEndKey: t.adviserEndKey as string,
      adviserBestDeepCc: t.adviserBestDeepCc as number,
      playedEndKey: (t.playedEndKey as string | null) ?? null,
      flipWork: (t.flipWork as number | null) ?? null,
    });
  }
  return out;
}

/**
 * The seat's resolved configuration, under the arm's PATCH.
 *
 * The patch and not `armHardConfig(arm)`: that helper returns `DESKTOP` under
 * the patch, and `DESKTOP` carries the PLACEHOLDER weight vector while
 * `resolveHardConfig` carries `hardEnginePatch`'s resolved one. Spreading the
 * whole thing over the resolved base therefore silently reverts the weights,
 * and the arm is then measured against a different evaluation as well as a
 * different ladder — which is exactly the kind of two-factor comparison the
 * ablation registry exists to prevent. (Caught by this probe's own first run:
 * two arms reported different work at the SAME rung, which one config field
 * cannot do.)
 */
function configFor(arm: string, engineLabel: string): HardConfig {
  const profile = hardProfileOf(engineLabel);
  if (profile === null) throw new Error(`cannot resolve a hard profile from ${engineLabel}`);
  const base = resolveHardConfig(profile);
  if (arm === 'base' || arm === 'hard@desktop') return base;
  return { ...base, ...requireArm(arm).patch } as HardConfig;
}

async function measure(arm: string, t: ProbeTarget, warmup: number): Promise<ProbeRow> {
  const engine = new HardEngine(configFor(arm, t.engineLabel));
  for (let i = 0; i < warmup; i++) {
    await engine.searchTurn(t.state, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
  }
  const r = await engine.searchTurn(t.state, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
  return {
    arm,
    positionId: t.id,
    rung: r.stats.rung,
    work: r.work,
    elapsedMs: r.stats.elapsedMs,
    usedFrac: +(r.stats.elapsedMs / ALLOWANCE_MS).toFixed(3),
    depth: r.depth,
    stopReason: r.stats.stopReason,
    aborted: r.stats.stopReason === 'abort',
    unitsPerMsBefore: r.stats.unitsPerMsBefore,
    unitsPerMsAfter: r.stats.unitsPerMsAfter,
    endKey: r.endKey,
    isAdviserBest: r.endKey === t.adviserEndKey,
    isPlayed: t.playedEndKey !== null && r.endKey === t.playedEndKey,
  };
}

function summarise(arm: string, rows: readonly ProbeRow[]): Record<string, number | string> {
  const mine = rows.filter(r => r.arm === arm);
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  return {
    arm,
    n: mine.length,
    meanRung: Math.round(mean(mine.map(r => r.rung))),
    meanWork: Math.round(mean(mine.map(r => r.work))),
    meanMs: Math.round(mean(mine.map(r => r.elapsedMs))),
    usedPct: +(mean(mine.map(r => r.usedFrac)) * 100).toFixed(1),
    abortPct: +((100 * mine.filter(r => r.aborted).length) / (mine.length || 1)).toFixed(1),
    meanDepth: +mean(mine.map(r => r.depth)).toFixed(2),
    meanUnitsPerMs: Math.round(mean(mine.map(r => r.unitsPerMsAfter))),
    adviserBest: mine.filter(r => r.isAdviserBest).length,
    reproducedPlayed: mine.filter(r => r.isPlayed).length,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string): string => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : fallback;
  };
  const arms = flag('--arms', 'hard@desktop,work-fit').split(',');
  const warmup = Number(flag('--warmup', '3'));
  const out = flag('--out', '');
  const targets = sweepTargets();
  console.log(`positions: ${targets.length} distinct, arms: ${arms.join(', ')}, warmup: ${warmup}`);

  const rows: ProbeRow[] = [];
  for (const t of targets) {
    for (const arm of arms) {
      const row = await withMatchRules(t.options, async () => measure(arm, t, warmup));
      rows.push(row);
      console.log(
        `${arm.padEnd(14)} ${t.id.padEnd(30)} rung=${row.rung} work=${row.work} ms=${row.elapsedMs} ` +
          `u/ms=${row.unitsPerMsAfter} d=${row.depth} ${row.stopReason} end=${row.endKey} adviserBest=${row.isAdviserBest}`,
      );
    }
  }
  const summary = arms.map(a => summarise(a, rows));
  for (const s of summary) console.log(JSON.stringify(s));
  if (out !== '') {
    fs.mkdirSync(out, { recursive: true });
    const artifact = {
      schema: 'muju-arm-probe-v1',
      allowanceMs: ALLOWANCE_MS,
      warmup,
      arms,
      positions: targets.map(t => ({ id: t.id, adviserEndKey: t.adviserEndKey, playedEndKey: t.playedEndKey, flipWork: t.flipWork })),
      summary,
      rows,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(out, 'probe.json'), `${JSON.stringify(artifact, null, 1)}\n`);
    console.log(`-> ${path.join(out, 'probe.json')}`);
  }
}

void main();
