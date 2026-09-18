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
 *
 * E3.2 (lane 12) adds a FIFTH check and one option.
 *
 *   - `reserveViolations` / `reserveMonotone`: judge 4, the canonical fact that
 *     a board which strictly GAINS a crystal cannot be worth less. For every
 *     sampled position, side and living miner whose own cell is not already
 *     full, one crystal is added under that miner and `economyDP` is recomputed;
 *     a violation is a `stream` that FELL. This is the check
 *     `E3.1-SYNTHESIS.md` §5 B1 asks for ("`lab/hard-ai/oracles/economy.ts`
 *     needs a reserve-monotonicity check so the fix is verified against the
 *     rules rather than against the DP's own header"). Only `p.reserve` is
 *     perturbed, so the comparison isolates the DP: no other packed field and no
 *     table is rebuilt, and nothing else in the evaluator is consulted.
 *   - `--eval-fix b1,b2,...` (or `all`) runs every economy call under those
 *     `HardConfig.evalFix` flags (`src/ai/hard/config.ts`), so the same four
 *     checks can be read for a correctness arm. Absent is the champion.
 *
 * THE FIFTH CHECK IS NOT PART OF THE M8 PASS CRITERION and does not set the
 * exit code unless `--require-reserve-monotone` is passed. MILESTONES.md's M8
 * row names `streamMismatch`, `relocationMonotone`, `insolvencyMismatch` and
 * `pstMaxErr`, and B1 is a KNOWN open defect of the shipped DP: failing the M8
 * gate on it would turn a documented bug into a red gate for every milestone
 * downstream, which is a decision for the coordinator and not for this file.
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
import { RESERVE_VALUES } from '../../../src/ai/hard/core/income';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { DEAD, MAX_SLOTS } from '../../../src/ai/hard/types';
import type { EvalFix } from '../../../src/ai/hard/config';
import { mirror180, readPositions, type StoredPosition } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/economy.json');
const MAX_REPORTED_MISMATCHES = 20;

interface Args {
  positions: number;
  out: string;
  seed: number;
  /** `HardConfig.evalFix` every economy call runs under; `null` is the champion. */
  fix: EvalFix | null;
  /** The flag names as given, for the artifact. */
  fixNames: string[];
  requireReserveMonotone: boolean;
}

/** `--eval-fix b1,b4` / `--eval-fix all` -> the block, by the B-numbers of
 * `docs/hard-ai/e3/E3.1-SYNTHESIS.md` §5. */
function parseEvalFix(spec: string): { fix: EvalFix; names: string[] } {
  const names = spec === 'all' ? ['b1', 'b2', 'b3', 'b4', 'b5'] : spec.split(',').map(x => x.trim()).filter(x => x !== '');
  const fix: EvalFix = {};
  for (const n of names) {
    switch (n) {
      case 'b1': fix.relocationCompare = true; break;
      case 'b2': fix.rot180TieOrder = true; break;
      case 'b3': fix.infiltrationPerAnchor = true; break;
      case 'b4': fix.inv3RetreatConjunct = true; break;
      case 'b5': fix.rentOnce = true; break;
      default: throw new Error(`oracles/economy: --eval-fix expects b1..b5 or all, got "${n}"`);
    }
  }
  return { fix, names };
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    positions: 2000,
    out: DEFAULT_OUT,
    seed: 1,
    fix: null,
    fixNames: [],
    requireReserveMonotone: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--eval-fix') {
      const parsed = parseEvalFix(argv[++i]);
      args.fix = parsed.fix;
      args.fixNames = parsed.names;
    } else if (a === '--require-reserve-monotone') args.requireReserveMonotone = true;
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
function buildRealTables(p: PackedState, fix: EvalFix | null): NodeTables {
  const t = allocTables();
  t.evalFix = fix;
  strikeArea(p, 0, t, STRIKE_MOVE_ACTIONS, t.strike[0]);
  strikeArea(p, 1, t, STRIKE_MOVE_ACTIONS, t.strike[1]);
  return t;
}

/**
 * Judge 4: adding one crystal under a miner can never make the side's projected
 * stream FALL. Returns the number of (miner, +1 crystal) perturbations whose
 * `economyDP().stream` fell, and how many were tried.
 *
 * Only `p.reserve[c]` moves, and it is restored before returning: `economyDP`
 * reads `reserve`, `sq`, `owner`, `defId` and `bank` and nothing else, so no
 * other packed field and no table needs rebuilding for the comparison to be
 * exactly "the same position with one more crystal in the ground".
 */
function reserveMonotoneViolations(
  p: PackedState,
  t: NodeTables,
  side: Side,
  sc: Scratch,
  base: EconResult,
  probe: EconResult,
  onViolation: (square: number, before: number, after: number) => void,
): { tried: number; violations: number } {
  const cat = activeCatalog();
  const maxReserve = RESERVE_VALUES - 1;
  let tried = 0;
  let violations = 0;
  const seen = new Set<number>();
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const c = p.sq[slot];
    if (c === DEAD || p.owner[slot] !== side) continue;
    if (cat.mine[p.defId[slot]] === 0) continue;
    if (p.reserve[c] >= maxReserve) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    const before = p.reserve[c];
    p.reserve[c] = before + 1;
    economyDP(p, t, side, sc, 0, probe);
    p.reserve[c] = before;
    tried++;
    if (probe.stream < base.stream) {
      violations++;
      onViolation(c, base.stream, probe.stream);
    }
  }
  return { tried, violations };
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

  const rentOnce = args.fix !== null && args.fix.rentOnce === true;
  const ZERO_UPKEEP: readonly number[] = new Array<number>(ECON_HORIZON).fill(0);

  const mismatches: Mismatch[] = [];
  let streamMismatch = 0;
  let checkedStream = 0;
  let relocationViolations = 0;
  let checkedRelocation = 0;
  let reserveViolations = 0;
  let checkedReserve = 0;
  const reserveProbe = newEconResult();

  for (const stored of sampled) {
    let p: PackedState;
    try {
      p = replica.pack(stored.state);
    } catch {
      continue; // positions with e.g. phase !== 'playing' have no packed representation
    }
    const t = buildRealTables(p, args.fix);
    let totalReserve = 0;
    for (let s = 0; s < 100; s++) totalReserve += p.reserve[s];

    for (const side of [0, 1] as const) {
      const player = SIDE_PLAYER[side];
      const { income, upkeep } = literalProjection(stored.state, player);
      // E3.2 B5 (`rentOnce`): the DP's `stream` carries income ONLY, because
      // `Rent` is the single charge for upkeep (DESIGN.md:1348). The literal
      // reference has to ask the same question, or every position "mismatches"
      // by exactly the rent the flag removed. `out.upkeep` still reports the
      // real bill and is still compared to the literal one below.
      const expectedStream = referenceStream(income, rentOnce ? ZERO_UPKEEP : upkeep);

      const stay = newEconResult();
      economyStayInPlace(p, side, stay, args.fix);
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

      // E3.2 B1, judge 4: one more crystal under a miner, nothing else moved.
      const reserve = reserveMonotoneViolations(p, t, side, sc, dp, reserveProbe, (square, was, now) => {
        pushMismatch(
          mismatches,
          'reserve-monotone',
          stored.id,
          side,
          `+1 crystal at square ${square} lowered stream ${was} -> ${now}`,
        );
      });
      checkedReserve += reserve.tried;
      reserveViolations += reserve.violations;
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
      economyStayInPlace(p, side, out, args.fix);
      checkedInsolvency++;
      if (out.turnsToInsolvency !== expected) {
        insolvencyMismatch++;
        pushMismatch(mismatches, 'insolvency', stored.id, side, `turnsToInsolvency ${out.turnsToInsolvency} vs literal ${expected}`);
      }
    }
  }

  const { pstMaxErr, checked: pstChecked } = checkPstMineValues();
  const relocationMonotone = relocationViolations === 0;
  const reserveMonotone = reserveViolations === 0;

  const metrics = {
    evalFix: args.fixNames.length === 0 ? null : args.fixNames,
    positionsRequested: args.positions,
    positionsSampled: sampled.length,
    corpusSize: corpus.length,
    checkedStream,
    streamMismatch,
    checkedRelocation,
    relocationMonotone,
    relocationViolations,
    checkedReserve,
    reserveMonotone,
    reserveViolations,
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
      evalFix: metrics.evalFix,
      streamMismatch,
      relocationMonotone,
      insolvencyMismatch,
      pstMaxErr,
      reserveMonotone,
      reserveViolations,
      checkedStream,
      checkedRelocation,
      checkedInsolvency,
      checkedReserve,
    }),
  );

  if (streamMismatch > 0 || !relocationMonotone || insolvencyMismatch > 0 || pstMaxErr > 1) {
    process.exitCode = 1;
  }
  // The M8 criterion does not include the reserve check (see the header); only
  // a caller that asks for it is failed by it.
  if (args.requireReserveMonotone && !reserveMonotone) process.exitCode = 1;
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
