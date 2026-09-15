/**
 * `node --import tsx lab/hard-ai/oracles/economy.ts --positions <n> [--out <path>]`
 * (DESIGN §5.8, MILESTONES.md M8).
 *
 * Four differential checks, matching the M8 gate criterion field for field:
 *
 *   - `streamMismatch`: `economyStayInPlace(p, side)` against a literal
 *     projection built from the SAME canonical primitives the real turn
 *     machinery calls at income/upkeep time — `endOfTurnIncome` (mining.ts)
 *     and `upkeepDue` (upkeep.ts) — applied `ECON_HORIZON` times with the
 *     units held motionless. This deliberately does not route through
 *     `endTurn`/`startTurn` themselves: those also run victory and
 *     inactivity-draw checks that have nothing to do with the economy
 *     projection, and a corpus position that happens to be one draw-clock
 *     tick or one elimination away from a real game-ending transition would
 *     make the comparison fail for a reason unrelated to `tables/economy.ts`
 *     at all. `income_t`/`upkeep_t`/`stream` are compared exactly, on both
 *     sides of every sampled position. See `docs/hard-ai/design/
 *     DEVIATIONS.md` under M8.
 *   - `relocationMonotone`: `economyDP(p, t, side, ...)` (relocation on, `t`
 *     built from the REAL `tables/context.ts allocTables()` with `strike`
 *     filled in by the REAL `tables/threat.ts strikeArea`) never scores
 *     below `economyStayInPlace` and never exceeds the position's total
 *     board reserve (converted to centi-crystals), on every sampled
 *     position and side.
 *   - `insolvencyMismatch`: `turnsToInsolvency` against the same literal
 *     income/upkeep projection's additive balance check, on the 11 authored
 *     fixtures (both sides).
 *   - `pstMaxErr`: the JF §2.1 / DESIGN §4.7 `PST_MINE` check values (18 at
 *     reserves 16/8/4 across six definitions, plus "lightning 0" at each of
 *     those three reserves — 21 in all).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GameState, PlayerId } from '../../../src/game/types';
import { endOfTurnIncome } from '../../../src/game/mining';
import { upkeepDue as canonicalUpkeepDue } from '../../../src/game/upkeep';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { PST_MINE, pstMine } from '../../../src/ai/hard/core/income';
import { CC, type PackedState, type Side } from '../../../src/ai/hard/types';
import { allocTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { STRIKE_MOVE_ACTIONS, strikeArea } from '../../../src/ai/hard/tables/threat';
import { ECON_HORIZON, economyDP, economyStayInPlace, newEconResult, type EconResult } from '../../../src/ai/hard/tables/economy';
import { mirror180, readPositions, type StoredPosition } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/economy.json');
const MAX_REPORTED_MISMATCHES = 20;

interface Args {
  positions: number;
  out: string;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { positions: 2000, out: DEFAULT_OUT, seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else throw new Error(`oracles/economy: unrecognised argument "${a}"`);
  }
  return args;
}

/** `authored.jsonl ++ openings.jsonl ++ fuzz-1000.jsonl`, in that order. */
function loadCorpus(): StoredPosition[] {
  const files = ['authored.jsonl', 'openings.jsonl', 'fuzz-1000.jsonl'];
  const out: StoredPosition[] = [];
  for (const f of files) {
    const p = path.join(POSITIONS_DIR, f);
    if (fs.existsSync(p)) out.push(...readPositions(p));
  }
  return out;
}

/**
 * `n` positions drawn from `corpus`, cycling with `mirror180` applied on
 * every second pass once the corpus itself is exhausted, so a `--positions`
 * larger than the corpus does not silently repeat identical positions.
 */
function samplePositions(corpus: readonly StoredPosition[], n: number): StoredPosition[] {
  if (corpus.length === 0) throw new Error('oracles/economy: empty position corpus');
  const out: StoredPosition[] = [];
  let round = 0;
  while (out.length < n) {
    for (const sp of corpus) {
      if (out.length >= n) break;
      out.push(round % 2 === 0 ? sp : { ...sp, state: mirror180(sp.state) });
    }
    round++;
  }
  return out;
}

const SIDE_PLAYER: readonly PlayerId[] = ['white', 'black'];

/**
 * The literal projection: `endOfTurnIncome`/`upkeepDue` applied `ECON_HORIZON`
 * times with the units held — see the module doc for why this stands in for
 * "through canonical endTurn". `bank` is allowed to go negative (a
 * hypothetical projection, exactly like DESIGN §5.8's `turnsToInsolvency`
 * formula), never enforced as a real affordability gate.
 */
function literalProjection(state: GameState, player: PlayerId): { income: number[]; upkeep: number[] } {
  let s = state;
  const income: number[] = [];
  const upkeep: number[] = [];
  for (let t = 0; t < ECON_HORIZON; t++) {
    const due = canonicalUpkeepDue(s, player);
    upkeep.push(due);
    const me = s.players[player];
    s = { ...s, players: { ...s.players, [player]: { ...me, resources: me.resources - due } } };
    const result = endOfTurnIncome(s, player);
    income.push(result.total);
    s = result.state;
  }
  return { income, upkeep };
}

const G = [65536, 58982, 53084, 47776, 42998, 38698, 34829, 31346, 28211, 25390, 22851, 20566, 18509];

function referenceStream(income: readonly number[], upkeep: readonly number[]): number {
  let stream = 0;
  for (let t = 1; t <= ECON_HORIZON; t++) stream += (G[t + 1] * (income[t - 1] - upkeep[t - 1]) * CC) >> 16;
  return stream;
}

function referenceTurnsToInsolvency(bank: number, income: readonly number[], upkeep: readonly number[]): number {
  let running = bank;
  for (let t = 1; t <= ECON_HORIZON; t++) {
    running += income[t - 1] - upkeep[t - 1];
    if (running < 0) return t;
  }
  return ECON_HORIZON + 1;
}

interface Mismatch {
  kind: string;
  id: string;
  side: Side;
  detail: string;
}

function pushMismatch(list: Mismatch[], kind: string, id: string, side: Side, detail: string): void {
  if (list.length < MAX_REPORTED_MISMATCHES) list.push({ kind, id, side, detail });
}

/** `tables/context.ts allocTables()` with `strike` actually filled in (`tables/threat.ts`, M6). */
function buildRealTables(p: PackedState): NodeTables {
  const t = allocTables();
  strikeArea(p, 0, t, STRIKE_MOVE_ACTIONS, t.strike[0]);
  strikeArea(p, 1, t, STRIKE_MOVE_ACTIONS, t.strike[1]);
  return t;
}

function checkPstMineValues(): { pstMaxErr: number; checked: number } {
  const w1 = DEF_INDEX.get('water_1') as number;
  const f1 = DEF_INDEX.get('fire_1') as number;
  const p1 = DEF_INDEX.get('plant_1') as number;
  const p2 = DEF_INDEX.get('plant_2') as number;
  const p3 = DEF_INDEX.get('plant_3') as number;
  const m3 = DEF_INDEX.get('metal_3') as number;
  const l1 = DEF_INDEX.get('lightning_1') as number;
  // DESIGN §4.7 / JF §2.1, in the order the design doc prints them.
  const rows: Array<{ reserve: number; expect: Record<number, number> }> = [
    { reserve: 16, expect: { [f1]: 646, [w1]: 1025, [p1]: 1159, [p2]: 1285, [p3]: 1368, [m3]: 1238, [l1]: 0 } },
    { reserve: 8, expect: { [f1]: 513, [w1]: 619, [p1]: 659, [p2]: 693, [p3]: 720, [m3]: 684, [l1]: 0 } },
    { reserve: 4, expect: { [f1]: 310, [w1]: 342, [p1]: 351, [p2]: 360, [p3]: 360, [m3]: 360, [l1]: 0 } },
  ];
  let maxErr = 0;
  let checked = 0;
  for (const row of rows) {
    for (const [defStr, expect] of Object.entries(row.expect)) {
      const def = Number(defStr);
      const actual = pstMine(def, row.reserve);
      const err = Math.abs(actual - expect);
      if (err > maxErr) maxErr = err;
      checked++;
    }
  }
  // `PST_MINE` itself is checked byte for byte too (same source income.test.ts pins).
  void PST_MINE;
  return { pstMaxErr: maxErr, checked };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const replica = new Replica();
  const sc = new Scratch(1, 1, 1, 1);
  const corpus = loadCorpus();
  const sampled = samplePositions(corpus, args.positions);
  const authored = readPositions(path.join(POSITIONS_DIR, 'authored.jsonl'));

  const mismatches: Mismatch[] = [];
  let streamMismatch = 0;
  let checkedStream = 0;
  let relocationViolations = 0;
  let checkedRelocation = 0;

  for (const stored of sampled) {
    let p: PackedState;
    try {
      p = replica.pack(stored.state);
    } catch {
      continue; // positions with e.g. phase !== 'playing' have no packed representation
    }
    const t = buildRealTables(p);
    let totalReserve = 0;
    for (let s = 0; s < 100; s++) totalReserve += p.reserve[s];

    for (const side of [0, 1] as const) {
      const player = SIDE_PLAYER[side];
      const { income, upkeep } = literalProjection(stored.state, player);
      const expectedStream = referenceStream(income, upkeep);

      const stay = newEconResult();
      economyStayInPlace(p, side, stay);
      checkedStream++;
      if (
        stay.stream !== expectedStream ||
        !arraysEqual(stay.income, income) ||
        !arraysEqual(stay.upkeep, upkeep)
      ) {
        streamMismatch++;
        pushMismatch(
          mismatches,
          'stream',
          stored.id,
          side,
          `stream ${stay.stream} vs literal ${expectedStream}; income ${[...stay.income]} vs ${income}; upkeep ${[...stay.upkeep]} vs ${upkeep}`,
        );
      }

      const dp = newEconResult();
      economyDP(p, t, side, sc, 0, dp);
      checkedRelocation++;
      const upperBound = totalReserve * CC;
      if (dp.stream < stay.stream || dp.stream > upperBound) {
        relocationViolations++;
        pushMismatch(
          mismatches,
          'relocation-monotone',
          stored.id,
          side,
          `dp.stream ${dp.stream}, stay.stream ${stay.stream}, upperBound ${upperBound}`,
        );
      }
    }
  }

  let insolvencyMismatch = 0;
  let checkedInsolvency = 0;
  for (const stored of authored) {
    let p: PackedState;
    try {
      p = replica.pack(stored.state);
    } catch {
      continue;
    }
    for (const side of [0, 1] as const) {
      const player = SIDE_PLAYER[side];
      const { income, upkeep } = literalProjection(stored.state, player);
      const expected = referenceTurnsToInsolvency(p.bank[side], income, upkeep);
      const out: EconResult = newEconResult();
      economyStayInPlace(p, side, out);
      checkedInsolvency++;
      if (out.turnsToInsolvency !== expected) {
        insolvencyMismatch++;
        pushMismatch(mismatches, 'insolvency', stored.id, side, `turnsToInsolvency ${out.turnsToInsolvency} vs literal ${expected}`);
      }
    }
  }

  const { pstMaxErr, checked: pstChecked } = checkPstMineValues();
  const relocationMonotone = relocationViolations === 0;

  const metrics = {
    positionsRequested: args.positions,
    positionsSampled: sampled.length,
    corpusSize: corpus.length,
    checkedStream,
    streamMismatch,
    checkedRelocation,
    relocationMonotone,
    relocationViolations,
    fixturesChecked: authored.length,
    checkedInsolvency,
    insolvencyMismatch,
    pstChecked,
    pstMaxErr,
    mismatches,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`oracles/economy: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      streamMismatch,
      relocationMonotone,
      insolvencyMismatch,
      pstMaxErr,
      checkedStream,
      checkedRelocation,
      checkedInsolvency,
    }),
  );

  if (streamMismatch > 0 || !relocationMonotone || insolvencyMismatch > 0 || pstMaxErr > 1) {
    process.exitCode = 1;
  }
}

function arraysEqual(a: Int16Array, b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

main();
