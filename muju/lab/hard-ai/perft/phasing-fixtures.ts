/**
 * The Phasing perft fixture set (DESIGN §7.2, M2).
 *
 * Every fixture is a POSITION RECIPE, not a stored `GameState`: a seed, a rules
 * block and a predicate. `buildFixture` drives the CANONICAL engine
 * (`generateAllActions` + `applyAction`) from `createInitialGameState(...,
 * 'phasing')` with a seeded, purchase-biased walker and stops at the first state
 * the predicate accepts. That keeps the fixture file small, makes every fixture
 * reproducible from source, and guarantees the positions are reachable by legal
 * Phasing play rather than hand-assembled.
 *
 * Recipes are only as stable as this file: change the walker and the positions
 * change. `fixtures.json` therefore freezes a `positionDigest` per fixture
 * alongside its node counts, and `hard:perft --check` compares the digest FIRST
 * — so a drifted recipe reports as a drifted position, not as a perft
 * regression.
 *
 * One fixture (`home-occupation`) cannot be reached by a random walk in a
 * sensible number of plies, so its recipe ends with an explicit, documented
 * `transform`. The transform is still validated: the result must be a legal,
 * playing Phasing state whose legal-action list is non-empty.
 *
 * The eleven STANDARD fixtures this set replaces (`occupied-corner`,
 * `blocked-rectangle`, `cleave-chain`, `clock-9`, `upkeep-pending`,
 * `rich-place`, `endgame-dry`, `handicap-3`, `place-autoskip`, `home-race`,
 * `promotion-kill`) are not carried forward as dead data: their frozen numbers
 * and the positions they indexed (`lab/hard-ai/positions/authored.jsonl`) stay
 * retrievable from git at tag `standard-final` — the pre-M2 `fixtures.json` is
 * blob `a96e09d7` at commit `2922375e`.
 */
import type { GameState, PlayerId, Position, Unit } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { createInitialGameState, getStartCorner, getUnitAt, resetUnitActions } from '../../../src/game/board';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { seededRandom } from '../../../src/ai/runtime';
import { isValidSpawnPosition, getAllSpawnPositions } from '../../../src/game/spawning';
import { getHomeOccupier } from '../../../src/game/victory';
import { upkeepActions } from '../../../src/game/upkeep';
import { getUnitDefinition } from '../../../src/game/units';
import { getOpponent } from '../../../src/game/turn';
import type { PerftLimits } from '../../../src/ai/hard/verify/perft';
import { DEFAULT_RULES, type RulesBlock } from '../positions/corpus';

/** The cheapest tier-1 unit (`fire_1`/`lightning_1`), units.ts. */
export const CHEAPEST_TIER1 = 3;

export interface FixtureSpec {
  id: string;
  /** Why this position exists / what it pins down. */
  rationale: string;
  /** Seed for the walker (`seededRandom`, `src/ai/runtime.ts`). */
  seed: number;
  /** Plies to walk before abandoning one game. */
  maxPlies: number;
  /** Games to walk before giving up: game `k` uses seed `seed + k * 7919`.
   * A purchase-biased walker finishes many games by elimination long before a
   * predicate like "an upkeep choice is pending" can match, so one seed is not
   * enough. Defaults to `DEFAULT_ATTEMPTS`. */
  attempts?: number;
  /** Accepts the first position to use. Never sees a finished game. */
  want: (state: GameState) => boolean;
  /** Documented state surgery applied to the accepted position, if any. */
  transform?: (state: GameState) => GameState;
  /** Per-phase perft caps for this position (see `verify/perft.ts`). */
  limits: PerftLimits;
  handicap?: number;
  victoryRule?: RulesBlock['victoryRule'];
  inactivityRule?: RulesBlock['inactivityRule'];
  reviewUpkeep?: { white: boolean; black: boolean };
}

export interface BuiltFixture {
  spec: FixtureSpec;
  state: GameState;
  rules: RulesBlock;
  /** Game index whose walk matched (0-based). */
  attempt: number;
  /** Plies walked in that game before the predicate accepted. */
  plies: number;
  digest: string;
}

export const DEFAULT_ATTEMPTS = 200;

// --- helpers the predicates read --------------------------------------------

function squareOf(p: Position): number {
  return p.y * 10 + p.x;
}

export function pendingsOf(state: GameState, player: PlayerId) {
  return (state.pendingSummons ?? []).filter(s => s.owner === player);
}

function inPrepare(state: GameState): boolean {
  return state.phase === 'playing' && state.turn.phase === 'place' && !state.upkeepPending;
}

function bankOf(state: GameState): number {
  return state.players[state.turn.currentPlayer].resources;
}

// --- the walker --------------------------------------------------------------

/** Purchase-biased kind weights. A walker that rarely buys never produces a
 * Prepare-phase or arrival fixture, so BUY outweighs everything but ATTACK. */
const WEIGHT: Readonly<Record<AIAction['type'], number>> = Object.freeze({
  ATTACK: 22,
  BUY_UNIT: 34,
  PROMOTE_UNIT: 12,
  MOVE: 8,
  END_ACTION_PHASE: 4,
  END_PLACE_PHASE: 3,
  PAY_UPKEEP: 1,
  RESIGN: 0,
});

function pick(rng: () => number, actions: readonly AIAction[]): AIAction {
  let total = 0;
  for (const a of actions) total += WEIGHT[a.type];
  if (total <= 0) return actions[Math.floor(rng() * actions.length)];
  let roll = rng() * total;
  for (const a of actions) {
    roll -= WEIGHT[a.type];
    if (roll < 0) return a;
  }
  return actions[actions.length - 1];
}

export function rulesOf(spec: FixtureSpec): RulesBlock {
  return {
    ...DEFAULT_RULES,
    handicap: spec.handicap ?? 0,
    victoryRule: spec.victoryRule ?? DEFAULT_RULES.victoryRule,
    inactivityRule: spec.inactivityRule ?? DEFAULT_RULES.inactivityRule,
  };
}

export function initialFor(spec: FixtureSpec): GameState {
  const rules = rulesOf(spec);
  return {
    ...createInitialGameState(undefined, 4, rules.handicap, 'phasing'),
    victoryRule: rules.victoryRule,
    inactivityRule: rules.inactivityRule,
    reviewUpkeep: spec.reviewUpkeep ?? { white: false, black: false },
  };
}

export class FixtureUnreachable extends Error {}

/** Walks seeded Phasing games and returns the first accepted position. */
export function buildFixture(spec: FixtureSpec): BuiltFixture {
  const attempts = spec.attempts ?? DEFAULT_ATTEMPTS;
  const root = initialFor(spec);
  let accepted: GameState | null = null;
  let matched = -1;
  let plies = 0;
  let walked = 0;
  for (let attempt = 0; attempt < attempts && accepted === null; attempt++) {
    const rng = seededRandom((spec.seed + attempt * 7919) >>> 0);
    let state = root;
    plies = 0;
    matched = attempt;
    if (spec.want(state)) {
      accepted = state;
      break;
    }
    while (plies < spec.maxPlies) {
      if (state.phase !== 'playing') break;
      const actions = generateAllActions(state, state.turn.currentPlayer);
      if (actions.length === 0) break;
      const next = applyAction(state, pick(rng, actions));
      if (next === state) break;
      state = next;
      plies++;
      walked++;
      if (state.phase === 'playing' && spec.want(state)) {
        accepted = state;
        break;
      }
    }
  }
  if (accepted === null) {
    throw new FixtureUnreachable(
      `fixture "${spec.id}": predicate never matched in ${attempts} games of ≤${spec.maxPlies} plies ` +
        `(seeds ${spec.seed}..${(spec.seed + (attempts - 1) * 7919) >>> 0}, ${walked} plies walked)`,
    );
  }
  const built = spec.transform ? spec.transform(accepted) : accepted;
  if (built.phase !== 'playing') throw new FixtureUnreachable(`fixture "${spec.id}": transform left a finished game`);
  if (generateAllActions(built, built.turn.currentPlayer).length === 0) {
    throw new FixtureUnreachable(`fixture "${spec.id}": no legal action at the built position`);
  }
  return { spec, state: built, rules: rulesOf(spec), attempt: matched, plies, digest: positionDigest(built) };
}

// --- digest ------------------------------------------------------------------

/** Everything a perft count can depend on, in a stable order. */
export function positionCanonicalString(state: GameState): string {
  const units = state.board.units
    .map(u => `${squareOf(u.position)}:${u.owner}:${u.definitionId}:${u.damageTaken}:${u.canActThisTurn ? 1 : 0}:${u.placedThisTurn ? 1 : 0}:${u.promotedThisPlacement ? 1 : 0}:${(u.attackedThisTurn ?? []).length}`)
    .sort();
  const pend = (state.pendingSummons ?? [])
    .map(s => `${s.owner}:${squareOf(s.position)}:${s.definitionId}:${s.cost}`)
    .sort();
  const reserves: number[] = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) reserves.push(state.board.cells[y][x].resourceLayers);
  return [
    state.ruleset ?? 'standard',
    units.join('|'),
    pend.join('|'),
    reserves.join(''),
    state.players.white.resources,
    state.players.black.resources,
    state.turn.currentPlayer,
    state.turn.phase,
    state.turn.actionsRemaining,
    state.turn.turnNumber,
    state.upkeepPending ? 1 : 0,
    state.inactivityPlies ?? 0,
    state.progressThisTurn ? 1 : 0,
    state.blackCrystalHandicap ?? 0,
    state.victoryRule ?? 'home-or-elimination',
    state.inactivityRule ?? 'on',
    `${state.reviewUpkeep?.white ? 1 : 0}${state.reviewUpkeep?.black ? 1 : 0}`,
  ].join('#');
}

/** FNV-1a over `positionCanonicalString`, 8 hex digits. */
export function positionDigest(state: GameState): string {
  const text = positionCanonicalString(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// --- the documented transform ------------------------------------------------

/**
 * Parks the enemy unit that is nearest the mover's opponent's home corner ON
 * that corner, and clears the square it came from. Used only by
 * `home-occupation`, because a random walk needs thousands of plies to march a
 * unit 18 squares across the board. The resulting position is an ordinary
 * Phasing position: a real occupier, a defender to move, every rectangle of the
 * occupied side blocked.
 */
function occupyOpponentHome(state: GameState): GameState {
  const invader = state.turn.currentPlayer;
  const defender = getOpponent(invader);
  const corner = getStartCorner(defender);
  const distance = (u: Unit) => Math.abs(u.position.x - corner.x) + Math.abs(u.position.y - corner.y);
  const mine = state.board.units.filter(u => u.owner === invader).sort((a, b) => distance(a) - distance(b));
  if (mine.length === 0) throw new FixtureUnreachable('occupyOpponentHome: the invader has no units');
  const mover = mine[0];
  const sitting = getUnitAt(state.board, corner);
  const units = state.board.units
    .filter(u => u.id !== sitting?.id || u.id === mover.id)
    .map(u => (u.id === mover.id ? { ...u, position: { ...corner } } : u));
  // The occupation is established, so the defender is the side to move and
  // starts a fresh Act phase with its army reset: exactly the shape `startTurn`
  // hands the defender, and the shape `resolveHomeCheckmate` adjudicates from.
  return {
    ...state,
    board: resetUnitActions({ ...state.board, units }, defender),
    turn: { ...state.turn, currentPlayer: defender, phase: 'action', actionsRemaining: 4 },
    upkeepPending: false,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

// --- the fixture set ---------------------------------------------------------

/**
 * Six fixtures, chosen to cover the Phasing turn shape rather than to be many:
 * a Prepare phase with no affordable purchase, a rich Prepare phase, pendings on
 * both sides, a guaranteed arrival AND refund at the hand-off, an upkeep choice
 * pending in Prepare, and an established home occupation.
 *
 * `limits` are per fixture so the whole `--check` run stays well inside the
 * 3-minute budget: a rich Prepare position at `prepare: 3` is millions of nodes.
 * A fixture whose root is already in Prepare (or has an upkeep choice pending)
 * still carries a non-zero `act` budget: a macro turn never returns to the Act
 * phase, so the budget must go unused, and leaving it non-zero means an engine
 * that wrongly re-opened the Act phase would show up as a count mismatch rather
 * than be silently cut off.
 */
export const PHASING_FIXTURES: readonly FixtureSpec[] = Object.freeze([
  {
    id: 'prepare-broke',
    rationale: 'Prepare with a bank below the cheapest tier-1 cost: only promotions (if any) and END_PLACE_PHASE, which must still be explicitly played.',
    seed: 11,
    maxPlies: 4000,
    limits: { act: 4, prepare: 2 },
    want: s =>
      inPrepare(s) &&
      s.turn.turnNumber >= 3 &&
      bankOf(s) < CHEAPEST_TIER1 &&
      pendingsOf(s, s.turn.currentPlayer).length >= 1,
  },
  {
    id: 'prepare-rich',
    rationale: 'Prepare with a bank funding several tier-1 commitments and at least one promotion: the unordered-BUY-set canonicalisation carries this one.',
    seed: 23,
    maxPlies: 4000,
    limits: { act: 0, prepare: 2 },
    want: s =>
      inPrepare(s) &&
      bankOf(s) >= 2 * CHEAPEST_TIER1 + 2 &&
      getAllSpawnPositions(s.turn.currentPlayer, s.board).length >= 4,
  },
  {
    id: 'full-turn',
    rationale: 'A whole mid-game Phasing macro turn from a fresh Act phase: Act → END_ACTION_PHASE (income, automatic upkeep) → Prepare → END_PLACE_PHASE, the shape every other fixture only covers part of.',
    seed: 13,
    maxPlies: 4000,
    limits: { act: 2, prepare: 1 },
    want: s =>
      s.turn.phase === 'action' &&
      s.turn.actionsRemaining === 4 &&
      !s.upkeepPending &&
      s.turn.turnNumber >= 3 &&
      s.board.units.filter(u => u.owner === s.turn.currentPlayer).length >= 4,
  },
  {
    id: 'pendings-both-sides',
    rationale:
      'A commitment outstanding for each side. Reachable ONLY in the mover\'s Prepare phase after it has bought at least once: a mover\'s own commitments always resolve or refund at its own turn start, so a mover never enters its Act phase holding one. Pins that both planes can be non-empty at once, and that a hand-off resolves only the arriving side\'s.',
    seed: 37,
    maxPlies: 4000,
    limits: { act: 0, prepare: 1 },
    want: s =>
      inPrepare(s) &&
      s.turn.turnNumber >= 3 &&
      bankOf(s) >= CHEAPEST_TIER1 &&
      pendingsOf(s, 'white').length >= 1 &&
      pendingsOf(s, 'black').length >= 1,
  },
  {
    id: 'arrival-and-refund',
    rationale: 'The mover is in Prepare and the OPPONENT holds one currently valid and one currently invalid commitment, so every sequence ends in a hand-off that both materialises a unit and refunds a cost.',
    seed: 5,
    maxPlies: 6000,
    limits: { act: 0, prepare: 1 },
    want: s => {
      if (!inPrepare(s)) return false;
      // The hand-off runs the inactivity draw test BEFORE it resolves
      // commitments (turn.ts `handOffTurn` → `startTurn`), so a position with a
      // nearly-expired quiet clock would end the game instead of arriving.
      if ((s.inactivityPlies ?? 0) >= 7) return false;
      const them = pendingsOf(s, getOpponent(s.turn.currentPlayer));
      if (them.length < 2) return false;
      const valid = them.filter(p => isValidSpawnPosition(p.position, p.owner, s.board)).length;
      return valid >= 1 && valid < them.length;
    },
  },
  {
    id: 'upkeep-review-pending',
    rationale: 'Phasing settles upkeep inside END_ACTION_PHASE; with review enabled the mover must choose a keep-set before Prepare opens. Exercises genKeepSets below its 64-entry cap.',
    seed: 71,
    maxPlies: 4000,
    limits: { act: 4, prepare: 1 },
    reviewUpkeep: { white: true, black: true },
    want: s => {
      if (s.phase !== 'playing' || !s.upkeepPending) return false;
      const sets = upkeepActions(s).length;
      return sets >= 2 && sets <= 32;
    },
  },
  {
    id: 'home-occupation',
    rationale: 'An established occupation of the defender\'s home corner: every rectangle of the occupied side is blocked (so its commitments all refund), and home-checkmate adjudication runs in Prepare.',
    seed: 97,
    maxPlies: 600,
    limits: { act: 2, prepare: 1 },
    want: s =>
      s.turn.turnNumber >= 3 &&
      !s.upkeepPending &&
      s.board.units.filter(u => u.owner === 'white').length >= 3 &&
      s.board.units.filter(u => u.owner === 'black').length >= 3 &&
      getHomeOccupier(s.board, 'white') === undefined &&
      getHomeOccupier(s.board, 'black') === undefined,
    transform: occupyOpponentHome,
  },
]);

export function buildAllFixtures(): BuiltFixture[] {
  return PHASING_FIXTURES.map(buildFixture);
}

/** Cheap self-description for the artifact/report. */
export function describeFixture(built: BuiltFixture): Record<string, unknown> {
  const s = built.state;
  const mover = s.turn.currentPlayer;
  return {
    id: built.spec.id,
    plies: built.plies,
    digest: built.digest,
    mover,
    phase: s.turn.phase,
    actionsRemaining: s.turn.actionsRemaining,
    turnNumber: s.turn.turnNumber,
    upkeepPending: s.upkeepPending === true,
    bank: { white: s.players.white.resources, black: s.players.black.resources },
    units: { white: s.board.units.filter(u => u.owner === 'white').length, black: s.board.units.filter(u => u.owner === 'black').length },
    pendings: { white: pendingsOf(s, 'white').length, black: pendingsOf(s, 'black').length },
    homeOccupied: {
      white: getHomeOccupier(s.board, 'white') !== undefined,
      black: getHomeOccupier(s.board, 'black') !== undefined,
    },
    cheapestAffordable: getUnitDefinition('fire_1').cost <= s.players[mover].resources,
    legalActions: generateAllActions(s, mover).length,
  };
}
