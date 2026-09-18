/**
 * `node --import tsx lab/hard-ai/oracles/threat.ts --positions <n>
 *  [--approach-positions <m>] [--out <path>]` (DESIGN §5.1, §5.2, §5.8;
 * MILESTONES.md M6).
 *
 * Three differential checks, matching the M6 gate criterion field for field:
 *
 *   - `strikeMismatch`: `tables/threat.ts strikeArea(p, side, t, 3)` against
 *     DESIGN F22's oracle — `dilate(getMovementRange(pos, speed, 3, board) ∪
 *     {pos})` unioned over the side's living units, as a SET of squares. The
 *     area, not `getAttackFrontier`'s perimeter.
 *   - `strikeIfBoughtMismatch`: `strikeIfBoughtArea(p, side, t)` against the
 *     brute force over `getAllSpawnPositions × getAffordablePurchases` of
 *     `dilate(getMovementRange(q, spd, 3, board) ∪ {q})` (DESIGN §5.2).
 *   - `approachMismatch`: `classifyApproach`'s `{cls, d}` against
 *     `server/analysis/tactics.ts:272 approachTable` — the canonical table —
 *     on every (attacker, target) pair of the sampled positions. The canonical
 *     table emits one row per (attacker, attack square); the rows are reduced
 *     to one verdict per attacker exactly the way `classifyApproach` reduces
 *     its own candidates: cheapest `moveActions` first, `strike-and-retreat`
 *     ahead of `stranded` on a tie. `server/**` is outside the root tsconfig
 *     and may only be imported from `lab/**` (DESIGN §5.8), which is why this
 *     comparison lives here and not in `tests/ai/hard/threat.test.ts`.
 *
 * THREE CLASSES OF CASE ARE EXCLUDED from the approach comparison, each
 * counted so the exclusion is visible in the artifact rather than silent (see
 * `docs/hard-ai/design/DEVIATIONS.md` under M6):
 *
 *   - `positionsSkippedProof`: positions whose MOVER already stands on the
 *     enemy home corner. Every `applyAction` re-runs `resolveHomeCheckmate`
 *     (simulate.ts:33), so the canonical line can end the game before the
 *     retreat is measured. Deciding that needs the home prover, which lands at
 *     M10 in `tactics/**` — a layer `tables/**` may not import (DESIGN §2).
 *     `Replica.needsProof` is exactly the canonical short-circuit's condition.
 *   - `pairsSkippedCorner`: pairs whose target sits next to the DEFENDER's home
 *     corner while that corner is EMPTY, so one of the attack squares is the
 *     corner itself and the approach move is a home invasion — same prover
 *     dependency. An occupied corner is not a candidate square for either
 *     implementation, so those pairs are still compared.
 *   - `pairsSkippedRepeat`: pairs where the attacker has already attacked this
 *     particular target this turn. `PackedState` keeps an attack COUNT, not the
 *     identities (DESIGN §3.1), so the replica cannot see the canonical table's
 *     `!u.attackedThisTurn?.includes(target.id)` clause.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getAdjacentPositions } from '../../../src/game/board';
import { getAffordablePurchases } from '../../../src/game/building';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { getMovementRange } from '../../../src/game/movement';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import type { GameState, PlayerId, Position, Unit } from '../../../src/game/types';
import { getUnitDefinition } from '../../../src/game/units';
import { Replica } from '../../../src/ai/hard/core/state';
import { bbNew, bbNext, Scratch, type BB } from '../../../src/ai/hard/core/bits';
import { CORNER } from '../../../src/ai/hard/core/tables';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import { allocTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import {
  refreshExposure,
  STRIKE_MOVE_ACTIONS,
  strikeArea,
  strikeIfBoughtArea,
} from '../../../src/ai/hard/tables/threat';
import {
  Approach,
  APPROACH_SCRATCH_BB,
  APPROACH_SCRATCH_I8,
  classifyApproach,
} from '../../../src/ai/hard/tables/approach';
import { actionReady } from '../../../server/analysis/core';
import { approachTable as canonicalApproachTable } from '../../../server/analysis/tactics';
import { mirror180, readPositions, type RulesBlock, type StoredPosition } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/threat.json');
const MAX_REPORTED_MISMATCHES = 20;

const SIDE_PLAYER: readonly PlayerId[] = ['white', 'black'];

interface Args {
  positions: number;
  approachPositions: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { positions: 5000, approachPositions: 500, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--approach-positions') args.approachPositions = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else throw new Error(`oracles/threat: unrecognised argument "${a}"`);
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

/** `n` positions from `corpus`, mirrored on every second pass (cf. `oracles/economy.ts`). */
function samplePositions(corpus: readonly StoredPosition[], n: number): StoredPosition[] {
  if (corpus.length === 0) throw new Error('oracles/threat: empty position corpus');
  const out: StoredPosition[] = [];
  let round = 0;
  while (out.length < n) {
    for (const sp of corpus) {
      if (out.length >= n) break;
      out.push(round % 2 === 0 ? sp : { ...sp, id: `${sp.id}#m`, state: mirror180(sp.state) });
    }
    round++;
  }
  return out;
}

/**
 * `n` positions spread evenly across `corpus` rather than taken from the
 * front. The corpus is ordered `authored ++ openings ++ fuzz`, so the first
 * `n` of it would be almost all opening positions — where the two armies are
 * still on their own sides of the board and every approach is `NONE`. Striding
 * keeps the approach sample mixed (openings, midgames, fuzz).
 */
function strideSample(corpus: readonly StoredPosition[], n: number): StoredPosition[] {
  if (corpus.length === 0) throw new Error('oracles/threat: empty position corpus');
  if (n >= corpus.length) return samplePositions(corpus, n);
  const out: StoredPosition[] = [];
  for (let i = 0; i < n; i++) out.push(corpus[Math.floor((i * corpus.length) / n)]);
  return out;
}

/** The three process-global rule knobs a stored position may move (corpus.ts:6). */
function applyRules(rules: RulesBlock): void {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
}

function key(p: Position): number {
  return p.y * 10 + p.x;
}

function squaresOf(mask: BB): number[] {
  const out: number[] = [];
  for (let s = bbNext(mask, -1); s >= 0; s = bbNext(mask, s)) out.push(s);
  return out;
}

function sameSquares(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** DESIGN F22: `dilate(getMovementRange(pos, speed, 3, board) ∪ {pos})` per unit. */
function oracleStrike(state: GameState, side: PlayerId): number[] {
  const seen = new Set<number>();
  for (const u of state.board.units) {
    if (u.owner !== side) continue;
    const speed = getUnitDefinition(u.definitionId).speed;
    const area: Position[] = [u.position];
    for (const r of getMovementRange(u.position, speed, STRIKE_MOVE_ACTIONS, state.board)) area.push(r.position);
    for (const pos of area) {
      seen.add(key(pos));
      for (const n of getAdjacentPositions(pos)) seen.add(key(n));
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** DESIGN §5.2: brute force over `getAllSpawnPositions × getAffordablePurchases`. */
function oracleStrikeIfBought(state: GameState, side: PlayerId): number[] {
  const defs = getAffordablePurchases(state.players[side].resources);
  if (defs.length === 0) return [];
  const seen = new Set<number>();
  for (const q of getAllSpawnPositions(side, state.board)) {
    for (const def of defs) {
      const area: Position[] = [q];
      for (const r of getMovementRange(q, def.speed, STRIKE_MOVE_ACTIONS, state.board)) area.push(r.position);
      for (const pos of area) {
        seen.add(key(pos));
        for (const n of getAdjacentPositions(pos)) seen.add(key(n));
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

interface Verdict {
  cls: number;
  d: number;
}

/**
 * The canonical table's rows for one attacker, reduced the way
 * `classifyApproach` reduces its own candidate squares: cheapest
 * `moveActions`, `strike-and-retreat` ahead of `stranded` on a tie.
 */
function reduceCanonicalRows(
  rows: ReturnType<typeof canonicalApproachTable>,
  attackerId: string,
): Verdict {
  let bestCost = -1;
  let bestCls: number = Approach.NONE;
  for (const row of rows) {
    if (row.attacker !== attackerId || !row.attackPossible || row.moveActions === null) continue;
    const cost = row.moveActions;
    const cls = row.classification === 'strike-and-retreat' ? Approach.RETREAT : Approach.STRAND;
    if (bestCost < 0 || cost < bestCost || (cost === bestCost && cls > bestCls)) {
      bestCost = cost;
      bestCls = cls;
    }
  }
  return bestCost < 0 ? { cls: Approach.NONE, d: -1 } : { cls: bestCls, d: bestCost };
}

/**
 * The defender's home corner is one of the target's attack squares AND is
 * empty, so an attacker could end its approach standing on it — a home
 * invasion `resolveHomeCheckmate` may adjudicate as a win before the retreat
 * is measured. An OCCUPIED corner is never a candidate attack square for
 * either implementation, so those pairs stay in the comparison.
 */
function cornerIsAnAttackSquare(state: GameState, target: Unit, defender: Side): boolean {
  const corner = CORNER[defender];
  if (!getAdjacentPositions(target.position).some(pos => key(pos) === corner)) return false;
  return !state.board.units.some(u => key(u.position) === corner);
}

interface Mismatch {
  kind: string;
  id: string;
  detail: string;
}

function pushMismatch(list: Mismatch[], kind: string, id: string, detail: string): void {
  if (list.length < MAX_REPORTED_MISMATCHES) list.push({ kind, id, detail });
}

/** Level-1 strike/exposure maps, since `buildTables` lands at M12. */
function level1(p: PackedState, t: NodeTables): NodeTables {
  for (let side = 0; side < 2; side++) {
    strikeArea(p, side as Side, t, STRIKE_MOVE_ACTIONS, t.strike[side]);
    strikeIfBoughtArea(p, side as Side, t, t.strikeIfBought[side]);
  }
  refreshExposure(t);
  t.side = p.side;
  t.level = 1;
  return t;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const replica = new Replica();
  const scratch = new Scratch(1, APPROACH_SCRATCH_BB, APPROACH_SCRATCH_I8);
  const tables = allocTables();
  const out = bbNew();
  const corpus = loadCorpus();
  const mismatches: Mismatch[] = [];

  // --- strike / strikeIfBought -------------------------------------------
  let strikeMismatch = 0;
  let strikeIfBoughtMismatch = 0;
  let strikeChecked = 0;
  let strikeIfBoughtNonEmpty = 0;
  let positionsPacked = 0;
  let positionsUnpackable = 0;

  for (const stored of samplePositions(corpus, args.positions)) {
    applyRules(stored.rules);
    let p: PackedState;
    try {
      p = replica.pack(stored.state);
    } catch {
      positionsUnpackable++;
      continue;
    }
    positionsPacked++;
    for (const side of [0, 1] as const) {
      strikeArea(p, side, tables, STRIKE_MOVE_ACTIONS, out);
      const expectedStrike = oracleStrike(stored.state, SIDE_PLAYER[side]);
      const actualStrike = squaresOf(out);
      if (!sameSquares(actualStrike, expectedStrike)) {
        strikeMismatch++;
        pushMismatch(mismatches, 'strike', stored.id, `side ${side}: ${actualStrike.length} squares vs oracle ${expectedStrike.length}`);
      }

      strikeIfBoughtArea(p, side, tables, out);
      const expectedBuy = oracleStrikeIfBought(stored.state, SIDE_PLAYER[side]);
      const actualBuy = squaresOf(out);
      if (expectedBuy.length > 0) strikeIfBoughtNonEmpty++;
      if (!sameSquares(actualBuy, expectedBuy)) {
        strikeIfBoughtMismatch++;
        pushMismatch(mismatches, 'strikeIfBought', stored.id, `side ${side}: ${actualBuy.length} squares vs oracle ${expectedBuy.length}`);
      }
      strikeChecked++;
    }
  }

  // --- approach -----------------------------------------------------------
  let approachMismatch = 0;
  let approachPairs = 0;
  let approachRetreats = 0;
  let approachStrands = 0;
  let approachNones = 0;
  let approachPositions = 0;
  let positionsSkippedProof = 0;
  let positionsSkippedTerminal = 0;
  let pairsSkippedCorner = 0;
  let pairsSkippedRepeat = 0;

  for (const stored of strideSample(corpus, args.approachPositions)) {
    applyRules(stored.rules);
    // The canonical table normalises the position first (`actionReady`: pay a
    // pending upkeep, leave the place phase); the replica must see the SAME
    // state, so it is packed from the normalised one.
    const ready = actionReady(stored.state).state;
    if (ready.phase !== 'playing') {
      positionsSkippedTerminal++;
      continue;
    }
    let p: PackedState;
    try {
      p = replica.pack(ready);
    } catch {
      positionsUnpackable++;
      continue;
    }
    if (replica.needsProof(p)) {
      positionsSkippedProof++;
      continue;
    }
    approachPositions++;
    const t = level1(p, tables);
    const mover = ready.turn.currentPlayer;
    const defender = (1 - p.side) as Side;

    for (const target of ready.board.units) {
      if (target.owner === mover) continue;
      const rows = canonicalApproachTable(ready, target);
      const nextToCorner = cornerIsAnAttackSquare(ready, target, defender);
      const targetSlot = p.pieceAt[key(target.position)];
      for (const attacker of ready.board.units) {
        if (attacker.owner !== mover) continue;
        if (nextToCorner) {
          pairsSkippedCorner++;
          continue;
        }
        if (attacker.attackedThisTurn?.includes(target.id)) {
          pairsSkippedRepeat++;
          continue;
        }
        const speed = getUnitDefinition(attacker.definitionId).speed;
        const expected = reduceCanonicalRows(rows, attacker.id);
        const actual = classifyApproach(p, t, key(attacker.position), speed, targetSlot, scratch, 0);
        approachPairs++;
        if (expected.cls === Approach.RETREAT) approachRetreats++;
        else if (expected.cls === Approach.STRAND) approachStrands++;
        else approachNones++;
        if ((actual.cls as number) !== expected.cls || actual.d !== expected.d) {
          approachMismatch++;
          pushMismatch(
            mismatches,
            'approach',
            stored.id,
            `attacker ${attacker.id}@${key(attacker.position)} vs ${target.id}@${key(target.position)}: ` +
              `replica {cls:${actual.cls},d:${actual.d}} vs canonical {cls:${expected.cls},d:${expected.d}}`,
          );
        }
      }
    }
  }

  const metrics = {
    positionsRequested: args.positions,
    approachPositionsRequested: args.approachPositions,
    corpusSize: corpus.length,
    positionsPacked,
    positionsUnpackable,
    strikeChecked,
    strikeMismatch,
    strikeIfBoughtMismatch,
    strikeIfBoughtNonEmpty,
    approachPositions,
    approachPairs,
    approachMismatch,
    approachRetreats,
    approachStrands,
    approachNones,
    positionsSkippedProof,
    positionsSkippedTerminal,
    pairsSkippedCorner,
    pairsSkippedRepeat,
    mismatches,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`oracles/threat: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      strikeMismatch,
      strikeIfBoughtMismatch,
      approachMismatch,
      strikeChecked,
      approachPairs,
      positionsSkippedProof,
      pairsSkippedCorner,
    }),
  );

  if (strikeMismatch > 0 || strikeIfBoughtMismatch > 0 || approachMismatch > 0) {
    process.exitCode = 1;
  }
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

main();
