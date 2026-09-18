/**
 * `npm run hard:cross-commit -- [--out <file>]` — the OLD-vs-NEW fixed-work
 * golden (E2 opening critique C5).
 *
 * Every identity test in the tree compares the same commit with an instrument
 * on and off, or the same commit with itself; none compares E1's champion with
 * the code that now claims to BE E1's champion, across the ~1,260 lines that
 * changed under `src/ai/hard` since `7c896179`. This script is that comparison:
 * it prints one JSON record per (position × rung) with everything a fixed-work
 * search is supposed to determine, and the same file run at two commits is
 * diffed with `diff`.
 *
 * WHAT IT MUST NOT DEPEND ON. It has to run unchanged at `7c896179`, where
 * `analyze/work-sweep.ts`, `search/probe.ts` and the ablation `time` arms do
 * not exist. So it imports only `engine.ts`, `positions/corpus.ts` and
 * `analyze/replay.ts`'s three reconstruction helpers — all of which are present
 * at both commits — and it never passes `expose`, `ladderStep` or any option
 * added after E1's close. Run it from a checkout of the old commit by copying
 * this one file in (untracked), running it, and deleting it.
 *
 * FIXED WORK ONLY. A wall-funded search reads the clock and would differ
 * between two runs on the same commit, which is not the question. Both rungs
 * here are `work:` budgets, where the engine reads no clock at all (DESIGN
 * F18), so any difference between the two files is a real behaviour change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { GameState } from '../../../src/game/types';
import { readPositions } from '../positions/corpus';
import { loadReplay, reconstruct, withMatchRules } from '../analyze/replay';
import type { MatchOptions } from '../../harness/types';

/** The two rungs: the smallest the ladder funds a real turn with, and the one
 * `chooseWork({200,0}, 3000)` picks for a cold `hard@desktop`. */
const RUNGS: readonly number[] = [100_000, 400_000];

const REPO = path.resolve(import.meta.dirname, '../../..');
const SWEEP = path.join(REPO, 'lab/results/hard-ai-e2/analysis/e1.1-losses-work-sweep-fresh/sweep.json');
const EXPOSED = path.join(REPO, 'lab/results/hard-ai-e2/analysis/e1.1-losses-exposed');
const POSITIONS = path.join(REPO, 'lab/hard-ai/positions');

interface Target {
  id: string;
  state: GameState;
  options: MatchOptions | null;
}

export interface GoldenRow {
  positionId: string;
  rung: number;
  actions: string;
  scoreCc: number;
  depth: number;
  work: number;
  nodes: number;
  endKey: string;
  source: string;
}

/**
 * The 12 DISTINCT sweep positions, reconstructed the way `work-sweep.ts` does:
 * `reconstruct(replay).bySide[side]` selected by `turnNumber`, inside the
 * replay's own `withMatchRules`. Two of the sweep's 14 rows are the same
 * position reached by two move orders (the opening critique's B1), and they are
 * dropped here by `adviserEndKey`.
 */
export function sweepTargets(): Target[] {
  if (!fs.existsSync(SWEEP)) return [];
  const sweep = JSON.parse(fs.readFileSync(SWEEP, 'utf8')) as { turns: Array<Record<string, unknown>> };
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const t of sweep.turns) {
    const key = `${t.adviserEndKey as string}|${t.playedEndKey as string}`;
    if (seen.has(key)) continue;
    const fileId = t.fileId as string;
    const savedPath = path.join(EXPOSED, `${fileId}.json`);
    if (!fs.existsSync(savedPath)) continue;
    const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8')) as { replay: string; side: 'white' | 'black' };
    // The analysis records an absolute path from the worktree that wrote it.
    const replayPath = rebase(saved.replay);
    if (!fs.existsSync(replayPath)) continue;
    const replay = loadReplay(replayPath);
    const turn = reconstruct(replay).bySide[saved.side].find(x => x.turnNumber === (t.turnNumber as number));
    if (turn === undefined) continue;
    seen.add(key);
    out.push({ id: `sweep:${fileId}:t${t.turnNumber as number}`, state: turn.startState, options: replay.options });
  }
  return out;
}

/** An absolute path written by another worktree, moved to this one. */
export function rebase(p: string): string {
  const cut = p.lastIndexOf('/muju/');
  return cut < 0 ? p : path.join(REPO, p.slice(cut + '/muju/'.length));
}

/** Twelve corpus positions: the authored fixtures (11) and one opening, so the
 * golden covers hand-built positions as well as played ones. */
export function corpusTargets(): Target[] {
  const authored = readPositions(path.join(POSITIONS, 'authored.jsonl'));
  const openings = readPositions(path.join(POSITIONS, 'openings.jsonl'));
  const picked = [...authored, openings[0]];
  return picked.map(p => ({ id: `corpus:${p.id}`, state: p.state, options: null }));
}

async function run(target: Target): Promise<GoldenRow[]> {
  const rows: GoldenRow[] = [];
  for (const rung of RUNGS) {
    // A fresh engine per search: no transposition table, no ordering history
    // and no device profile carried in, so each row is a function of the
    // position and the rung alone.
    const engine = new HardEngine();
    const r = await engine.searchTurn(target.state, { work: rung });
    rows.push({
      positionId: target.id,
      rung,
      actions: JSON.stringify(r.actions),
      scoreCc: r.scoreCc,
      depth: r.depth,
      work: r.work,
      nodes: r.stats.nodes,
      endKey: r.endKey,
      source: r.source,
    });
  }
  return rows;
}

/**
 * THE POSITIONS ARE FROZEN TO A FILE, not re-derived at each commit. Both
 * `analyze/replay.ts`'s reconstruction and the corpus readers are themselves
 * code that changed between the two commits, and a difference in the POSITION
 * would masquerade as a difference in the SEARCH. So the run at head writes
 * `--states-out`, and the run at the old commit reads it back with
 * `--states-in`: the two engines are then given byte-identical inputs, and the
 * only thing left that can differ is the search. The rules block still has to
 * be installed per position (`setElementGraph` and friends are process-global),
 * so each frozen state carries the replay's `MatchOptions` and the old commit
 * applies them through its OWN `withMatchRules`, which both commits have.
 */
interface FrozenTarget {
  id: string;
  state: GameState;
  options: MatchOptions | null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | null => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : null;
  };
  const out = flag('--out');
  const statesIn = flag('--states-in');
  const statesOut = flag('--states-out');
  let targets: Target[];
  if (statesIn !== null) {
    const frozen = JSON.parse(fs.readFileSync(statesIn, 'utf8')) as FrozenTarget[];
    targets = frozen.map(f => ({ id: f.id, state: f.state, options: f.options }));
    console.log(`positions: ${targets.length} frozen, from ${statesIn}`);
  } else {
    targets = [...sweepTargets(), ...corpusTargets()];
    if (statesOut !== null) {
      fs.mkdirSync(path.dirname(statesOut), { recursive: true });
      fs.writeFileSync(statesOut, `${JSON.stringify(targets, null, 1)}\n`);
      console.log(`positions: ${targets.length} -> ${statesOut}`);
    }
  }
  const rows: GoldenRow[] = [];
  for (const t of targets) {
    const got = t.options === null ? await run(t) : await withMatchRules(t.options, async () => run(t));
    rows.push(...got);
  }
  const text = `${JSON.stringify({ rungs: RUNGS, positions: targets.length, rows }, null, 1)}\n`;
  if (out === null) process.stdout.write(text);
  else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    console.log(`${rows.length} rows over ${targets.length} positions -> ${out}`);
  }
}

void main();
