/**
 * `node --import tsx lab/hard-ai/oracles/geometry.ts --positions <n> [--out <path>]`
 * (DESIGN §5.8, MILESTONES.md M9).
 *
 * Six checks — the five the M9 gate criterion names field for field, plus the
 * `illegalHomeRaceLines` replay that keeps `homeRaceAvailable` honest beyond
 * its two archived fixtures (see `docs/hard-ai/design/DEVIATIONS.md` under M9):
 *
 *   - `blockingMismatch`: the replica's `core/spawn.ts blockingSet(p, side,
 *     candidate = null, cap, out)` against the canonical `server/analysis/
 *     geometry.ts blockingSet(state, player, budget)` (which always uses the
 *     "every empty square" candidate — the same thing `candidate = null`
 *     means on the replica side), on every side of every sampled position.
 *     Only canonical answers proven exact within budget (`optimality ===
 *     'proven'`, or the trivial `minimum === 0`/`1` shapes the canonical
 *     function short-circuits) are compared; a `best_found` (budget-limited)
 *     canonical answer is not ground truth and is skipped, counted
 *     separately as `blockingSkipped`.
 *   - `f5Ok`: SU §4.1's frozen numbers — a White Hi (fire_1) anchor at F5 =
 *     (5,4), on the default White start layout with the Hi standing in for
 *     the starting Hi, gives a 30-square rectangle, 27 empty; one enemy unit
 *     on C3 = (2,2) collapses that to 2, with `blocking` reading 1.
 *   - `f11Ok`: `spawnMaskWithout` on a constructed "C7-anchor" fixture (a
 *     lone plant_1 anchor at C7 = (2,6), matching the ENGINE_GAPS/strategy
 *     "moving the only anchor" scenario, SD F11) equals the canonical
 *     `getAllSpawnPositions` computed on the board with that unit removed,
 *     as a set — see `docs/hard-ai/design/DEVIATIONS.md` under M9 for why
 *     this fixture is constructed rather than reverse-engineered from the
 *     archived game (mirrors M1's `home-race`/`promotion-kill` precedent).
 *   - `homeRaceOk`: `tables/home.ts homeRaceAvailable` finds the `BUY
 *     lightning_1@G1 → J10` line on the M1-authored `home-race` fixture
 *     (archived game, White to move turn 3) and finds none on the
 *     `promotion-kill` fixture (one turn after Black's `BUY plant_1@I10`
 *     closed the window) — SU addendum 20b.
 *   - `illegalHomeRaceLines`: every `[BUY, END_PLACE, MOVE]` line
 *     `homeRaceAvailable` emits on the sampled corpus, replayed word by word
 *     through `Replica.isLegal`/`make`/`unmake`. DESIGN §5.10 injects these
 *     lines FORCED and replays them canonically, so an illegal line silently
 *     discards a found win; `homeRaceLinesEmitted` reports the denominator.
 *   - `anchorsVoidedCornerOk`: `core/spawn.ts anchorsVoidedBy(p, side,
 *     CORNER[side])` equals the side's own total unblocked-anchor count (an
 *     intruder on the corner voids every rectangle, since every rectangle
 *     contains it).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GameState, PlayerId } from '../../../src/game/types';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { blockingSet as canonicalBlockingSet } from '../../../server/analysis/geometry';
import { WorkBudget } from '../../../server/analysis/core';
import { Replica, newUndo } from '../../../src/ai/hard/core/state';
import { anchorsVoidedBy, blockingSet, spawnMaskWithout } from '../../../src/ai/hard/core/spawn';
import { bbNew, bbNext, type BB } from '../../../src/ai/hard/core/bits';
import { CORNER } from '../../../src/ai/hard/core/tables';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { AKind, PA_NONE, paA, paB, paC, paKind } from '../../../src/ai/hard/core/action';
import { allocTables } from '../../../src/ai/hard/tables/context';
import { HOME_RACE_LINE_LEN, homeRaceAvailable } from '../../../src/ai/hard/tables/home';
import { spawnInfo } from '../../../src/ai/hard/core/spawn';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import { findPosition, mirror180, readPositions, type StoredPosition } from '../positions/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/geometry.json');
const MAX_REPORTED_MISMATCHES = 20;
const SIDE_OF: readonly PlayerId[] = ['white', 'black'];
const BLOCKING_CAP = 8;

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
    else throw new Error(`oracles/geometry: unrecognised argument "${a}"`);
  }
  return args;
}

/** `authored.jsonl ++ openings.jsonl ++ fuzz-1000.jsonl`, in that order (economy.ts oracle's pattern). */
function loadCorpus(): StoredPosition[] {
  const files = ['authored.jsonl', 'openings.jsonl', 'fuzz-1000.jsonl'];
  const out: StoredPosition[] = [];
  for (const f of files) {
    const p = path.join(POSITIONS_DIR, f);
    if (fs.existsSync(p)) out.push(...readPositions(p));
  }
  return out;
}

function samplePositions(corpus: readonly StoredPosition[], n: number): StoredPosition[] {
  if (corpus.length === 0) throw new Error('oracles/geometry: empty position corpus');
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

interface Mismatch {
  kind: string;
  id: string;
  side?: Side;
  detail: string;
}

function pushMismatch(list: Mismatch[], kind: string, id: string, side: Side | undefined, detail: string): void {
  if (list.length < MAX_REPORTED_MISMATCHES) list.push({ kind, id, side, detail });
}

function squaresOf(mask: BB): number[] {
  const out: number[] = [];
  for (let s = bbNext(mask, -1); s >= 0; s = bbNext(mask, s)) out.push(s);
  return out;
}

function positionsOf(list: readonly { x: number; y: number }[]): number[] {
  return list.map(p => p.y * 10 + p.x).sort((a, b) => a - b);
}

// --- blockingMismatch --------------------------------------------------------

function runBlocking(sampled: readonly StoredPosition[], replica: Replica, mismatches: Mismatch[]) {
  const mask = bbNew();
  let checked = 0;
  let mismatch = 0;
  let skipped = 0;
  for (const stored of sampled) {
    let p: PackedState;
    try {
      p = replica.pack(stored.state);
    } catch {
      continue;
    }
    for (const side of [0, 1] as const) {
      const player = SIDE_OF[side];
      const budget = new WorkBudget(200_000, 20_000);
      const canonical = canonicalBlockingSet(stored.state, player, budget);
      const replicaMin = blockingSet(p, side, null, BLOCKING_CAP, mask);

      if (canonical.status === 'proven_impossible') {
        checked++;
        if (replicaMin <= BLOCKING_CAP) {
          mismatch++;
          pushMismatch(mismatches, 'blocking', stored.id, side, `canonical proven_impossible, replica ${replicaMin}`);
        }
        continue;
      }
      // proven_possible: `minimum` is exact when optimality is 'proven', or
      // trivially exact for the two short-circuits (full === 0 -> 0; a
      // single-square exact cover -> 1) regardless of the `optimality` field.
      const exact = canonical.optimality === 'proven' || canonical.minimum === 0 || canonical.minimum === 1;
      if (!exact) {
        skipped++;
        continue;
      }
      checked++;
      const expected = (canonical.minimum as number) > BLOCKING_CAP ? BLOCKING_CAP + 1 : (canonical.minimum as number);
      if (replicaMin !== expected) {
        mismatch++;
        pushMismatch(
          mismatches,
          'blocking',
          stored.id,
          side,
          `canonical minimum ${canonical.minimum} (optimality ${canonical.optimality}), replica ${replicaMin}`,
        );
      }
    }
  }
  return { checked, mismatch, skipped };
}

// --- f5Ok --------------------------------------------------------------------

function checkF5(replica: Replica): boolean {
  // The default White start layout (Hi@(1,0), Sjor@(1,1), Muju@(0,1)) with
  // the Hi relocated to F5 = (5,4): DESIGN/SU §4.1's frozen numbers.
  const open: GameState = buildTestState([
    { def: 'fire_1', owner: 'white', x: 5, y: 4 },
    { def: 'water_1', owner: 'white', x: 1, y: 1 },
    { def: 'plant_1', owner: 'white', x: 0, y: 1 },
  ]);
  const withEnemy: GameState = buildTestState([
    { def: 'fire_1', owner: 'white', x: 5, y: 4 },
    { def: 'water_1', owner: 'white', x: 1, y: 1 },
    { def: 'plant_1', owner: 'white', x: 0, y: 1 },
    { def: 'fire_1', owner: 'black', x: 2, y: 2 },
  ]);

  const openArea = getAllSpawnPositions('white', open.board).length;
  const withEnemyArea = getAllSpawnPositions('white', withEnemy.board).length;
  if (openArea !== 30 - 3) return false; // 27 empty
  if (withEnemyArea !== 2) return false;

  const p = replica.pack(withEnemy);
  const mask = bbNew();
  const replicaBlocking = blockingSet(p, 0, null, 2, mask);
  return replicaBlocking === 1;
}

// --- f11Ok ---------------------------------------------------------------------

function checkF11(replica: Replica): boolean {
  // "C7-anchor": a deep plant_1 anchor at C7 = (2,6) (SD F11, strategy-docs
  // "Moving the only anchor" — a constructed fixture, DEVIATIONS.md under
  // M9), plus a shallow second anchor at (4,2) that lies OUTSIDE the C7
  // rectangle, so removing the deep anchor leaves a non-empty, non-trivial
  // spawn mask. (With the C7 anchor alone both sides of the comparison are
  // the EMPTY set, which a `spawnMaskWithout` that returned nothing at all
  // would also satisfy — the check has to have something to compare.)
  // `spawnMaskWithout` of the C7 anchor must equal the canonical spawn set of
  // the board with exactly that unit removed.
  const state = buildTestState([
    { def: 'plant_1', owner: 'white', x: 2, y: 6 },
    { def: 'water_1', owner: 'white', x: 4, y: 2 },
  ]);
  const p = replica.pack(state);
  const slot = p.pieceAt[62]; // C7 = (2,6) -> sq = y*10+x = 62
  const mask = bbNew();
  spawnMaskWithout(p, 0, slot, mask);
  const withoutBoard = {
    ...state.board,
    units: state.board.units.filter(u => !(u.position.x === 2 && u.position.y === 6)),
  };
  const expected = positionsOf(getAllSpawnPositions('white', withoutBoard));
  return JSON.stringify(squaresOf(mask)) === JSON.stringify(expected) && expected.length > 0;
}

// --- homeRaceOk ----------------------------------------------------------------

function checkHomeRace(replica: Replica): boolean {
  const positions = readPositions(path.join(POSITIONS_DIR, 'authored.jsonl'));
  const lightningDef = DEF_INDEX.get('lightning_1') as number;

  const race = findPosition(positions, 'home-race');
  const pRace = replica.pack(race.state);
  const tRace = allocTables();
  spawnInfo(pRace, 0, tRace.spawn[0]);
  spawnInfo(pRace, 1, tRace.spawn[1]);
  const outRace = new Int32Array(8 * HOME_RACE_LINE_LEN);
  const nRace = homeRaceAvailable(pRace, tRace, 0, outRace);
  let foundLine = false;
  for (let i = 0; i < nRace; i++) {
    const base = i * HOME_RACE_LINE_LEN;
    const buy = outRace[base];
    const move = outRace[base + 2];
    if (
      paKind(buy) === AKind.BUY &&
      paA(buy) === lightningDef &&
      paB(buy) === 6 && // G1
      paKind(move) === AKind.MOVE &&
      paB(move) === CORNER[1] && // J10
      paC(move) === 4
    ) {
      foundLine = true;
    }
  }

  const closed = findPosition(positions, 'promotion-kill');
  const pClosed = replica.pack(closed.state);
  const tClosed = allocTables();
  spawnInfo(pClosed, 0, tClosed.spawn[0]);
  spawnInfo(pClosed, 1, tClosed.spawn[1]);
  const outClosed = new Int32Array(8 * HOME_RACE_LINE_LEN);
  const nClosed = homeRaceAvailable(pClosed, tClosed, 0, outClosed);

  return foundLine && nClosed === 0;
}

// --- illegalHomeRaceLines ---------------------------------------------------------

/**
 * Every `homeRaceAvailable` line emitted on the sampled corpus, replayed
 * through `Replica.isLegal`/`make`/`unmake` word by word (`PA_NONE` words are
 * skipped, exactly as the §5.10 consumer does). DESIGN §5.10 injects these
 * lines FORCED and replays them canonically, so an illegal line is a silently
 * discarded win rather than a conservative miss — and the two archived
 * fixtures `homeRaceOk` inspects are far too narrow to catch that.
 */
function runHomeRaceLegality(sampled: readonly StoredPosition[], replica: Replica, mismatches: Mismatch[]) {
  const t = allocTables();
  const out = new Int32Array(16 * HOME_RACE_LINE_LEN);
  const undo = newUndo();
  let lines = 0;
  let illegal = 0;
  for (const stored of sampled) {
    let p: PackedState;
    try {
      p = replica.pack(stored.state);
    } catch {
      continue;
    }
    const side = p.side;
    spawnInfo(p, 0, t.spawn[0]);
    spawnInfo(p, 1, t.spawn[1]);
    const n = homeRaceAvailable(p, t, side, out);
    for (let i = 0; i < n; i++) {
      lines++;
      let applied = 0;
      let badWord = -1;
      for (let w = 0; w < HOME_RACE_LINE_LEN; w++) {
        const a = out[i * HOME_RACE_LINE_LEN + w];
        if (a === PA_NONE) continue;
        if (!replica.isLegal(p, a)) {
          badWord = w;
          break;
        }
        replica.make(p, a, undo);
        applied++;
      }
      for (let k = 0; k < applied; k++) replica.unmake(p, undo);
      if (badWord >= 0) {
        illegal++;
        pushMismatch(
          mismatches,
          'homeRaceLegality',
          stored.id,
          side,
          `line ${i} word ${badWord} (kind ${paKind(out[i * HOME_RACE_LINE_LEN + badWord])}) rejected by Replica.isLegal`,
        );
      }
    }
  }
  return { lines, illegal };
}

// --- anchorsVoidedCornerOk -------------------------------------------------------

function checkAnchorsVoidedCorner(replica: Replica): boolean {
  const state = buildTestState([
    { def: 'plant_1', owner: 'white', x: 1, y: 1 },
    { def: 'fire_1', owner: 'white', x: 4, y: 0 },
    { def: 'water_1', owner: 'white', x: 0, y: 5 },
  ]);
  const p = replica.pack(state);
  const voided = anchorsVoidedBy(p, 0, CORNER[0]);
  return voided === 3;
}

// --- fixture helper --------------------------------------------------------------

interface UnitSpec {
  def: string;
  owner: PlayerId;
  x: number;
  y: number;
}

function buildTestState(units: readonly UnitSpec[]): GameState {
  const cells = [];
  for (let y = 0; y < 10; y++) {
    const row = [];
    for (let x = 0; x < 10; x++) row.push({ position: { x, y }, resourceLayers: 0 });
    cells.push(row);
  }
  return {
    actionsPerTurn: 4,
    blackCrystalHandicap: 0,
    victoryRule: 'home-or-elimination',
    inactivityRule: 'on',
    upkeepPending: false,
    reviewUpkeep: { white: false, black: false },
    inactivityPlies: 0,
    progressThisTurn: false,
    phase: 'playing',
    board: {
      cells,
      units: units.map((u, i) => ({
        id: `u${i}`,
        definitionId: u.def,
        owner: u.owner,
        position: { x: u.x, y: u.y },
        hasMoved: false,
        hasAttacked: false,
        attackedThisTurn: [],
        lastAttackKilled: false,
        canActThisTurn: true,
        damageTaken: 0,
        placedThisTurn: false,
        promotedThisPlacement: false,
      })),
      initialResourceLayers: cells.flat().map(c => c.resourceLayers),
    },
    players: {
      white: { id: 'white', resources: 0, startCorner: { x: 0, y: 0 }, resourcesGained: 0, resourcesUpkeep: 0 },
      black: { id: 'black', resources: 0, startCorner: { x: 9, y: 9 }, resourcesGained: 0, resourcesUpkeep: 0 },
    },
    turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: 4, turnNumber: 1 },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const replica = new Replica();
  const corpus = loadCorpus();
  const sampled = samplePositions(corpus, args.positions);
  const mismatches: Mismatch[] = [];

  const blocking = runBlocking(sampled, replica, mismatches);
  const f5Ok = checkF5(replica);
  const f11Ok = checkF11(replica);
  const homeRaceOk = checkHomeRace(replica);
  const homeRace = runHomeRaceLegality(sampled, replica, mismatches);
  const anchorsVoidedCornerOk = checkAnchorsVoidedCorner(replica);

  const metrics = {
    positionsRequested: args.positions,
    positionsSampled: sampled.length,
    corpusSize: corpus.length,
    blockingChecked: blocking.checked,
    blockingMismatch: blocking.mismatch,
    blockingSkipped: blocking.skipped,
    f5Ok,
    f11Ok,
    homeRaceOk,
    homeRaceLinesEmitted: homeRace.lines,
    illegalHomeRaceLines: homeRace.illegal,
    anchorsVoidedCornerOk,
    mismatches,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`oracles/geometry: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      blockingChecked: blocking.checked,
      blockingMismatch: blocking.mismatch,
      f5Ok,
      f11Ok,
      homeRaceOk,
      homeRaceLinesEmitted: homeRace.lines,
      illegalHomeRaceLines: homeRace.illegal,
      anchorsVoidedCornerOk,
    }),
  );

  if (blocking.mismatch > 0 || !f5Ok || !f11Ok || !homeRaceOk || homeRace.illegal > 0 || !anchorsVoidedCornerOk) {
    process.exitCode = 1;
  }
}

main();
