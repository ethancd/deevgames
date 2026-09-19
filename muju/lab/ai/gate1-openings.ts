/**
 * The opening book every Gate 1 row starts from, and the only one it may read.
 *
 * Preregistration amendment A3 §1 (`docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`):
 * "Each seat-mirrored pair starts from a distinct opening drawn, in file order,
 * from the frozen scripted-bot DEV book `muju/lab/hard-ai/ladder/openings/p1-dev.jsonl`
 * (sha256 `a58ca9d8…5c7`, 48 rows). Never `p1-val`, never the sealed book."
 *
 * A2 measured 1,024 games from the single canonical initial position, so the two
 * `aiv2-medium` cells each held ONE pair replicated 64 times. Distinct start
 * positions are the fix, and the guard below is what keeps the fix from being
 * pointed at a corpus it may not consume: `p1-val.jsonl` is the model-selection
 * split and `p1-sealed.jsonl` is consumed once, under Gate 2, by the row that
 * reads it. Any path but the dev book throws before a game is played.
 *
 * DISTINCT IDS ARE NOT DISTINCT POSITIONS. The book holds 48 ids and 47 start
 * positions at each handicap: `p1-g5-s245` walks a unit out and back before
 * ending its phases and therefore transposes into `p1-g3-s3` (see
 * `gate1-trace.ts`). The loader computes the SEMANTIC start-position hash of
 * every row at every handicap, names the collision it finds, and pins it against
 * `KNOWN_START_COLLISIONS` so a different book — or a change to what a position
 * means — cannot slip past unnoticed. The frozen book is never edited and no
 * opening is dropped: the row still plays all 48 pairs, and the report counts
 * the colliding pair once.
 */
import { loadOpenings, sha256, type OpeningSpec } from '../hard-ai/ladder/openings';
import { applyLadderOpening, validateLadderOpenings } from '../hard-ai/ladder/ruleset';
import { startPositionDigest } from './gate1-trace';
import type { ScheduleOpening } from './gate1-report';
import type { GameState } from '../../src/game/types';
import { resolve, basename } from 'node:path';

/** Repo-relative, from `muju/`. The runner is always invoked from there. */
export const DEV_BOOK_PATH = 'lab/hard-ai/ladder/openings/p1-dev.jsonl';
/** Pinned in `lab/hard-ai/ladder/openings/ALLOCATION-P1.md`, quoted as `a58ca9d8…5c7` by A3. */
export const DEV_BOOK_SHA256 = 'a58ca9d8aad304d82824ef38d7b12c776ea1547ba61a10cbfba1e387e78335c7';
export const DEV_BOOK_ROWS = 48;
/** The handicaps every Gate 1 cell is played at, and every opening must be legal at. */
export const HANDICAPS = [0, 3] as const;
/** Deterministic replacement ids; never collide with `board.ts`'s `owner_def_ts_rand`. */
const OPENING_ID_PREFIX = 'p1o';

/** One row of the book, replayed at one handicap, hashed semantically. */
export interface StartPosition {
  openingId: string;
  openingIndex: number;
  handicap: number;
  sha256: string;
}

/** Two or more ids that replay into the SAME position at one handicap. */
export interface StartCollision {
  handicap: number;
  sha256: string;
  /** In file order, so the report always names them the same way round. */
  openingIds: string[];
}

/**
 * The collisions the frozen dev book is KNOWN to contain, pinned so that the
 * loader asserts what it finds instead of merely reporting it. `p1-g5-s245`
 * (MOVE 1,0→3,0, MOVE 3,0→1,0, END_ACTION_PHASE, PROMOTE 0,1, END_PLACE_PHASE)
 * and `p1-g3-s3` (END_ACTION_PHASE, PROMOTE 0,1, END_PLACE_PHASE) differ only in
 * a round trip, and the only field that survives it — `hasMoved` — is read by no
 * rule (`src/ai/hard/types.ts` RE §1.5). 48 ids, 47 positions, at both
 * handicaps.
 */
export const KNOWN_START_COLLISIONS: readonly { handicap: number; openingIds: readonly string[] }[] = [
  { handicap: 0, openingIds: ['p1-g5-s245', 'p1-g3-s3'] },
  { handicap: 3, openingIds: ['p1-g5-s245', 'p1-g3-s3'] },
];
/** 48 rows, 47 distinct start positions per handicap. Stated in every report. */
export const DEV_BOOK_DISTINCT_START_POSITIONS = 47;

export interface Gate1Book {
  path: string;
  sha256: string;
  openings: OpeningSpec[];
  /** One entry per (opening, handicap), in file order then handicap order. */
  starts: StartPosition[];
  /** Distinct start-position hashes per handicap: `{ 0: 47, 3: 47 }` for the dev book. */
  distinctStartPositions: Record<number, number>;
  /** Every group of ids that share a start position. Empty means 48 for 48. */
  collisions: StartCollision[];
  /** The semantic start hash of one row at one handicap. Throws on an unknown pair. */
  startSha256(openingId: string, handicap: number): string;
}

/**
 * Refuses every corpus but the dev book, by resolved path AND file name. The
 * two checks are redundant on purpose: one of them catches `--book ../…/p1-val.jsonl`,
 * the other catches a symlink or a copy of the sealed file left under the dev
 * name. Neither ever opens the file it rejects.
 */
export function assertDevBookPath(path: string): void {
  const wanted = resolve(DEV_BOOK_PATH);
  if (resolve(path) !== wanted || basename(path) !== basename(DEV_BOOK_PATH)) {
    throw new Error(
      `Gate 1 replays ${DEV_BOOK_PATH} only (preregistration A3 §1); refused ${JSON.stringify(path)}. ` +
        'p1-val.jsonl is the model-selection split and p1-sealed.jsonl is consumed once under Gate 2; ' +
        'neither may be read here.',
    );
  }
}

/** Loads, hashes and rules-checks the dev book. Throws unless it is byte-identical to the frozen file. */
export function loadGate1Book(path: string = DEV_BOOK_PATH): Gate1Book {
  assertDevBookPath(path);
  const file = loadOpenings(path);
  if (file.sha256 !== DEV_BOOK_SHA256) {
    throw new Error(`Dev book hash mismatch: ${file.sha256} is not the frozen ${DEV_BOOK_SHA256}`);
  }
  // A3 quotes the pin by its ends; assert exactly what the amendment says, too.
  if (!file.sha256.startsWith('a58ca9d8') || !file.sha256.endsWith('5c7')) {
    throw new Error(`Dev book hash ${file.sha256} does not match A3's "a58ca9d8…5c7"`);
  }
  if (file.openings.length !== DEV_BOOK_ROWS) {
    throw new Error(`Dev book must hold ${DEV_BOOK_ROWS} rows, found ${file.openings.length}`);
  }
  const ids = new Set(file.openings.map(o => o.id));
  if (ids.size !== file.openings.length) throw new Error('Dev book holds a duplicate opening id');
  // `validateLadderOpenings` rejects a non-Phasing id and replays every row at
  // every handicap through the canonical legality check before a game starts.
  validateLadderOpenings(file.openings, HANDICAPS);
  const { starts, collisions, distinctStartPositions } = computeStartPositions(file.openings, HANDICAPS);
  assertKnownStartCollisions(collisions);
  for (const handicap of HANDICAPS) {
    if (distinctStartPositions[handicap] !== DEV_BOOK_DISTINCT_START_POSITIONS) {
      throw new Error(`Dev book has ${distinctStartPositions[handicap]} distinct start positions at handicap ` +
        `${handicap}, not the pinned ${DEV_BOOK_DISTINCT_START_POSITIONS}`);
    }
  }
  const byKey = new Map(starts.map(s => [`${s.openingId}@${s.handicap}`, s.sha256]));
  return {
    path, sha256: file.sha256, openings: file.openings, starts, collisions, distinctStartPositions,
    startSha256(openingId: string, handicap: number): string {
      const found = byKey.get(`${openingId}@${handicap}`);
      if (!found) throw new Error(`No start position for opening ${openingId} at handicap ${handicap}`);
      return found;
    },
  };
}

/**
 * Replays every row at every handicap and hashes the POSITION each one reaches
 * (`gate1-trace.ts#startPositionDigest`), so the caller can see how many
 * independent starting points the book actually supplies rather than how many
 * lines it has.
 */
export function computeStartPositions(openings: readonly OpeningSpec[], handicaps: readonly number[]): {
  starts: StartPosition[];
  collisions: StartCollision[];
  distinctStartPositions: Record<number, number>;
} {
  const starts: StartPosition[] = [];
  const collisions: StartCollision[] = [];
  const distinctStartPositions: Record<number, number> = {};
  for (const handicap of handicaps) {
    const byHash = new Map<string, string[]>();
    openings.forEach((opening, openingIndex) => {
      const digest = startPositionDigest(gate1StartState(opening, handicap), handicap);
      starts.push({ openingId: opening.id, openingIndex, handicap, sha256: digest });
      byHash.set(digest, [...(byHash.get(digest) ?? []), opening.id]); // file order preserved
    });
    distinctStartPositions[handicap] = byHash.size;
    for (const [digest, openingIds] of byHash) {
      if (openingIds.length > 1) collisions.push({ handicap, sha256: digest, openingIds });
    }
  }
  return { starts, collisions, distinctStartPositions };
}

/**
 * Asserts the collisions found are EXACTLY the ones pinned above, and says which
 * ids collide when they are not. A silent new collision would shrink the row's
 * effective sample without shrinking any number the report prints; a silently
 * vanished one would mean the book, or the definition of a position, moved.
 */
export function assertKnownStartCollisions(collisions: readonly StartCollision[]): void {
  const format = (groups: readonly { handicap: number; openingIds: readonly string[] }[]) =>
    groups.map(g => `h${g.handicap}:{${[...g.openingIds].join(' = ')}}`).sort().join(', ') || '(none)';
  const found = format(collisions);
  const expected = format(KNOWN_START_COLLISIONS);
  if (found !== expected) {
    throw new Error(`Gate 1 dev-book start-position collisions changed. Found ${found}; pinned ${expected}. ` +
      'Update KNOWN_START_COLLISIONS deliberately — the row\'s effective sample size depends on it.');
  }
}

/**
 * The book as the schedule consumes it: an id, and the semantic start hash of
 * the position that id reaches at each handicap the row plays.
 */
export function scheduleOpenings(book: Gate1Book, handicaps: readonly number[] = HANDICAPS): ScheduleOpening[] {
  return book.openings.map(opening => ({
    id: opening.id,
    starts: Object.fromEntries(handicaps.map(h => [h, book.startSha256(opening.id, h)])),
  }));
}

/**
 * Rewrites the minted unit and pending-summon ids of a replayed opening into
 * positional, deterministic ones.
 *
 * `createInitialGameState` mints `owner_def_Date.now()_random`, so two replays
 * of the same opening differ in every id. The row hashes what each engine did
 * (`gate1-trace.ts`) and stores replays for audit; leaving wall-clock noise in
 * the position would make two identical games look distinct, which is exactly
 * the property A3 §2 asks the report to measure. Ids minted later in the game
 * keep their runtime form — the trace hash is id-independent by construction.
 */
export function normalizeOpeningIds(state: GameState): GameState {
  const order = (a: { position: { x: number; y: number } }, b: { position: { x: number; y: number } }) =>
    a.position.y - b.position.y || a.position.x - b.position.x;
  const units = [...state.board.units].sort(order);
  const map = new Map<string, string>();
  units.forEach((unit, i) => map.set(unit.id, `${OPENING_ID_PREFIX}-u${i}`));
  const pending = [...(state.pendingSummons ?? [])].sort(
    (a, b) => order(a, b) || a.owner.localeCompare(b.owner) || a.definitionId.localeCompare(b.definitionId),
  );
  pending.forEach((summon, i) => {
    if (map.has(summon.id)) throw new Error('Pending summon shares an id with a board unit');
    map.set(summon.id, `${OPENING_ID_PREFIX}-s${i}`);
  });
  // Anything else that still names a minted id — a unit released at upkeep or a
  // disrupted summon, both already off the board — gets a deterministic id in
  // traversal order, which the replay fixes just as firmly as the board order.
  let extra = 0;
  const rename = (id: string) => {
    const known = map.get(id);
    if (known) return known;
    const minted = `${OPENING_ID_PREFIX}-x${extra++}`;
    map.set(id, minted);
    return minted;
  };
  for (const unit of state.board.units) {
    unit.id = rename(unit.id);
    if (unit.attackedThisTurn) unit.attackedThisTurn = unit.attackedThisTurn.map(rename);
  }
  for (const summon of state.pendingSummons ?? []) summon.id = rename(summon.id);
  // The per-turn telemetry the UI reads back also carries ids; a unit that has
  // already been removed keeps the id it was minted with, which is why `rename`
  // falls through rather than throwing.
  if (state.selectedUnit) state.selectedUnit = rename(state.selectedUnit);
  for (const take of state.lastIncome?.takes ?? []) take.unitId = rename(take.unitId);
  for (const released of state.lastUpkeep?.released ?? []) released.id = rename(released.id);
  for (const summon of [...(state.lastSummoning?.summoned ?? []), ...(state.lastSummoning?.disrupted ?? [])]) {
    summon.id = rename(summon.id);
  }
  const ids = new Set([...state.board.units.map(u => u.id), ...(state.pendingSummons ?? []).map(s => s.id)]);
  if (ids.size !== state.board.units.length + (state.pendingSummons?.length ?? 0)) {
    throw new Error('Opening id normalization produced a duplicate id');
  }
  // Fail closed on any field this function has not been taught: `board.ts` mints
  // `owner_definition_<Date.now()>_<random>`, so a surviving timestamp means a
  // start position that differs byte for byte between two replays of one opening.
  const leftover = JSON.stringify(state).match(/_\d{10,}_[a-z0-9]+/);
  if (leftover) throw new Error(`Opening still carries a minted id (${leftover[0]}); teach normalizeOpeningIds its field`);
  return state;
}

/**
 * The start position a Gate 1 game is played from: the opening replayed through
 * the helper that OWNS the P1 book (`ladder/ruleset.ts` → `openings/phasing.ts`,
 * which re-checks the `p1-` id, the canonical legality of every action and the
 * harness invariants), with deterministic ids.
 */
export function gate1StartState(opening: OpeningSpec, handicap: number, actionsPerTurn = 4): GameState {
  const state = applyLadderOpening(opening, {
    blackCrystalHandicap: handicap,
    actionsPerTurn: actionsPerTurn as GameState['actionsPerTurn'],
  });
  return normalizeOpeningIds(state);
}

/** Hash of the opening ids a row consumed, in the order it consumed them. */
export const openingsDigest = (ids: readonly string[]): string => sha256(JSON.stringify(ids));
