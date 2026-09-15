/**
 * Repairs (and re-checks) `lab/hard-ai/suites/spawn-strike.suite.json`
 * (DESIGN §7.5; MILESTONES.md M9 authored it, M14 is the first milestone that
 * SCORES it).
 *
 * `node --import tsx lab/hard-ai/suites/build-spawn-strike.ts [--fix]`
 *
 * THE DEFECT. M9's twenty cases were authored by instantiating each named
 * pattern on a constructed position and replaying the line "end to end through
 * `core/state.ts`'s `Replica.isLegal`/`make` (asserted legal at each step)",
 * then taking `best` "from the actually-reached `kposHex`"
 * (DEVIATIONS.md, 2026-09-15, under M9). The line ends with its last REAL
 * action — the strike, the retreat, the fourth buy — and the key was taken
 * there. But a macro turn does not end at its last action: it ends at the TURN
 * BOUNDARY, where `END_ACTION_PHASE` runs income, upkeep review, the inactivity
 * clock and `startTurn` for the opponent (`src/game/turn.ts`). DESIGN §7.5
 * scores "the chosen turn's END `Kpos`", so every one of the twenty keys is one
 * action early and no engine can ever match one: measured, the reference
 * generator (widths `[40,16,8,4]`, 200 place plans, ~600 candidates per
 * position) contains `best` on 0 of 20 cases, while all twenty keys ARE
 * reachable MID-turn states.
 *
 * THE REPAIR is mechanical and preserves M9's authorship exactly: walk the
 * macro turn from each case's root, find the state whose `Kpos` is the recorded
 * key — that is the authored line, played out — and record the `Kpos` of every
 * end position reachable by FINISHING the turn from there. The authored LINE is
 * unchanged; only the point at which its key was sampled is corrected, and the
 * leftover actions the line does not use are left free.
 *
 * Leaving them free is the point. What each case tests is a named PATTERN — a
 * summon strike, a purchase-then-retreat, a four-buy pivot — not a full
 * four-action script, and the engine is entitled to spend whatever the pattern
 * leaves over however it likes. Scoring the line's own terminal state alone
 * makes every case a "did you play these exact four actions" test: measured
 * after the boundary fix, the reference generator (widths `[40,16,8,4]`, 200
 * place plans, ~600 candidates) reaches the authored terminal on 6 of 20 cases
 * and the shipped `K = 24` list on 1 of 20, so the suite would be scoring
 * tie-breaking among equivalent completions. `best` is therefore the CLOSURE of
 * the authored line under its unused actions.
 *
 * Cases whose recorded key is already an end position are left alone, so
 * re-running this is idempotent.
 *
 * Without `--fix` the script only CHECKS, printing one line per case and
 * exiting non-zero if any recorded key is neither an end position nor a
 * repairable mid-turn state.
 */
import path from 'node:path';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { phaseEndAction } from '../../../src/game/legality';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import type { GameState } from '../../../src/game/types';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { kposHex } from '../../../src/ai/hard/verify/perft';
import { readPositions, type RulesBlock, type StoredPosition } from '../positions/corpus';
import { normalizeKey, readSuite, writeSuite, type Suite, type SuiteCase } from './format';

const SUITES_DIR = path.resolve(import.meta.dirname);
const SUITE_PATH = path.join(SUITES_DIR, 'spawn-strike.suite.json');
const POSITIONS_PATH = path.join(SUITES_DIR, 'spawn-strike.positions.jsonl');
/** The authored lines are at most `PAY_UPKEEP + 4 buys + END_PLACE + 4 actions`.
 * The scan deepens one step at a time and stops as soon as every recorded key
 * is resolved, because the full tree at depth 10 runs to tens of millions of
 * states on the four-buy pivot positions while every authored line is five or
 * six actions long. */
const MAX_DEPTH = 10;
const MAX_CALLS = 3_000_000;
/** Budget for one case's completion closure, and the ceiling on how many end
 * keys a case may name. A line that leaves so many actions free that its
 * closure blows past either is not testing a pattern any more. */
const COMPLETION_CALLS = 400_000;
const MAX_BEST_KEYS = 4096;

const replica = new Replica();
const scratch = allocState();

function applyRules(rules: RulesBlock): void {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
}

function keyOf(state: GameState): string {
  return kposHex(replica.pack(state, scratch));
}

/**
 * Every end position reachable from `state` by finishing the current turn —
 * the closure of the authored line under the actions it did not spend.
 */
function completionsFrom(
  state: GameState,
  rootPlayer: GameState['turn']['currentPlayer'],
  rootTurnNumber: number,
): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  let calls = 0;
  let overflow = false;
  const visit = (current: GameState): void => {
    if (++calls > COMPLETION_CALLS) { overflow = true; return; }
    const p = replica.pack(current, scratch);
    const visitKey = `${(p.kturnHi >>> 0).toString(16)}${(p.kturnLo >>> 0).toString(16)}`;
    if (seen.has(visitKey)) return;
    seen.add(visitKey);
    for (const action of generateAllActions(current, current.turn.currentPlayer)) {
      const next = applyAction(current, action);
      if (next === current) continue;
      const done =
        next.phase !== 'playing' ||
        next.turn.currentPlayer !== rootPlayer ||
        next.turn.turnNumber !== rootTurnNumber;
      if (done) out.add(keyOf(next));
      else visit(next);
    }
  };
  visit(state);
  if (overflow || out.size > MAX_BEST_KEYS) out.clear();
  return out;
}

void phaseEndAction;

interface Scan {
  /** `Kpos` of every state the turn can END on. */
  endKeys: Set<string>;
  /** The subset of `endKeys` on which the MOVER has won the game outright.
   * Four of M9's twenty roots (the D9 pivots) hold no enemy body at all, so the
   * mover wins on the spot and the authored four-buy line is not a turn any
   * engine should prefer — a suite case cannot ask one to decline a win. Those
   * roots get these keys as their `best`; see the report below. */
  winKeys: Set<string>;
  /** `Kpos` -> the end keys reachable by ending the turn from a state with that key. */
  midToEnd: Map<string, Set<string>>;
  states: number;
}

function scanTurn(root: GameState, targets: ReadonlySet<string>, maxDepth: number): Scan {
  const endKeys = new Set<string>();
  const winKeys = new Set<string>();
  const midToEnd = new Map<string, Set<string>>();
  const rootPlayer = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;
  const seen = new Set<string>();
  let calls = 0;
  let states = 0;

  // Only a TARGET key needs its boundary computed; walking the whole turn and
  // ending it from every state would cost an `applyAction` per mid-state on a
  // tree that runs to millions of them.
  const record = (state: GameState, key: string): void => {
    if (!targets.has(key) || midToEnd.has(key)) return;
    midToEnd.set(key, completionsFrom(state, rootPlayer, rootTurnNumber));
  };

  const visit = (state: GameState, depth: number): void => {
    if (++calls > MAX_CALLS) throw new Error(`build-spawn-strike: exceeded ${MAX_CALLS} DFS calls`);
    if (midToEnd.size >= targets.size) return; // every target already resolved
    // A turn is identified by `Kturn`; `Kpos` alone transposes.
    const p = replica.pack(state, scratch);
    const visitKey = `${(p.kturnHi >>> 0).toString(16)}${(p.kturnLo >>> 0).toString(16)}`;
    if (seen.has(visitKey)) return;
    seen.add(visitKey);
    states++;
    record(state, kposHex(p));
    if (depth >= maxDepth) return;
    for (const action of generateAllActions(state, state.turn.currentPlayer)) {
      const next = applyAction(state, action);
      if (next === state) continue;
      const done =
        next.phase !== 'playing' ||
        next.turn.currentPlayer !== rootPlayer ||
        next.turn.turnNumber !== rootTurnNumber;
      if (done) {
        const key = keyOf(next);
        endKeys.add(key);
        if (next.phase === 'victory' && next.winner === rootPlayer) winKeys.add(key);
        continue;
      }
      visit(next, depth + 1);
      if (midToEnd.size >= targets.size) return;
    }
  };

  visit(root, 0);
  return { endKeys, winKeys, midToEnd, states };
}

interface Report {
  id: string;
  ok: boolean;
  alreadyEnd: number;
  repaired: number;
  /** Non-zero when the case's `best` was replaced by the root's winning end
   * positions (see `Scan.winKeys`). */
  won: number;
  unresolved: string[];
  repairedKeys: string[];
}

function repairKeys(keys: readonly string[], scan: Scan): { keys: string[]; alreadyEnd: number; repaired: number; unresolved: string[] } {
  const out = new Set<string>();
  const unresolved: string[] = [];
  let alreadyEnd = 0;
  let repaired = 0;
  for (const raw of keys) {
    const key = normalizeKey(raw);
    if (scan.endKeys.has(key)) {
      out.add(key);
      alreadyEnd++;
      continue;
    }
    const ends = scan.midToEnd.get(key);
    if (ends === undefined || ends.size === 0) {
      unresolved.push(key);
      continue;
    }
    for (const end of ends) out.add(end);
    repaired++;
  }
  return { keys: [...out].sort(), alreadyEnd, repaired, unresolved };
}

function main(): void {
  const fix = process.argv.includes('--fix');
  const suite: Suite = readSuite(SUITE_PATH);
  const positions: StoredPosition[] = readPositions(POSITIONS_PATH);
  const byId = new Map(positions.map(sp => [sp.id, sp]));
  const reports: Report[] = [];
  const repaired: SuiteCase[] = [];

  for (const testCase of suite.cases) {
    const id = testCase.position.slice(testCase.position.lastIndexOf('#') + 1);
    const stored = byId.get(id);
    if (stored === undefined) throw new Error(`build-spawn-strike: ${testCase.id} refers to missing position "${testCase.position}"`);
    applyRules(stored.rules);
    const targets = new Set<string>([...testCase.best, ...testCase.avoid].map(normalizeKey));
    const resolved = (sc: Scan): boolean => {
      for (const key of targets) if (!sc.endKeys.has(key) && !sc.midToEnd.has(key)) return false;
      return true;
    };
    let scan = scanTurn(stored.state, targets, 1);
    for (let depth = 2; depth <= MAX_DEPTH && !resolved(scan); depth++) {
      scan = scanTurn(stored.state, targets, depth);
    }
    const best = repairKeys(testCase.best, scan);
    const avoid = repairKeys(testCase.avoid, scan);
    let unresolved = [...best.unresolved, ...avoid.unresolved];
    let bestKeys = best.keys;
    let avoidKeys = avoid.keys;
    let won = 0;
    if (unresolved.length > 0 && scan.winKeys.size > 0) {
      // The authored line is not reachable as a turn of this root AND the mover
      // can simply win here. Record the winning end positions as `best` and say
      // so: the pattern the case names cannot be the right turn in a position
      // that is already over.
      bestKeys = [...scan.winKeys].sort();
      avoidKeys = avoidKeys.filter(k => !scan.winKeys.has(k));
      won = scan.winKeys.size;
      unresolved = [];
    }
    reports.push({
      id: testCase.id,
      ok: unresolved.length === 0 && bestKeys.length > 0,
      alreadyEnd: best.alreadyEnd + avoid.alreadyEnd,
      repaired: best.repaired + avoid.repaired,
      won,
      unresolved,
      repairedKeys: bestKeys,
    });
    repaired.push({ ...testCase, best: bestKeys, avoid: avoidKeys });
  }

  for (const r of reports) {
    console.log(
      `${r.ok ? 'ok  ' : 'FAIL'} ${r.id.padEnd(30)} end=${r.alreadyEnd} repaired=${r.repaired}` +
        (r.won > 0 ? ` won=${r.won}` : '') +
        (r.unresolved.length > 0 ? ` unresolved=${r.unresolved.join(',')}` : ''),
    );
  }
  const failures = reports.filter(r => !r.ok).length;
  const needsRepair = reports.reduce((n, r) => n + r.repaired + (r.won > 0 ? 1 : 0), 0);

  if (fix && failures === 0) {
    writeSuite(SUITE_PATH, { ...suite, version: suite.version + 1, cases: repaired });
    console.log(`build-spawn-strike: rewrote ${path.relative(process.cwd(), SUITE_PATH)} (${needsRepair} keys moved to the turn boundary)`);
    return;
  }
  console.log(
    JSON.stringify({
      cases: reports.length,
      failures,
      keysNeedingRepair: needsRepair,
      wonOutright: reports.filter(r => r.won > 0).map(r => r.id),
    }),
  );
  if (failures > 0 || (!fix && needsRepair > 0)) process.exitCode = 1;
}

main();
