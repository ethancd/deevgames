/**
 * What a Gate 1 game IS, for the purposes of amendment A3 §2's effective sample
 * size: the position it started from, and the id-independent sequence of what
 * each engine then did.
 *
 * Preregistration amendment A3 §2: "The report hashes every game's action
 * sequence. A cell whose number of distinct games is below 90% of its game count
 * is INVALID." That statistic is only meaningful if two identical games hash the
 * same, and unit ids are minted with `Date.now()` and `Math.random()`
 * (`src/game/board.ts`), both at setup and for every purchase that arrives. So
 * the hash is taken over the SQUARE-based form of each action — the same
 * portable form the opening book itself is stored in
 * (`ladder/openings.ts#actionToOpeningAction`) — together with the turn number,
 * the side to move and the phase the action was taken in.
 *
 * WHY THE OPENING ID IS NOT IN THE HASH ANY MORE. It used to be, and that made
 * the statistic a no-op in a full row: every pair of a cell starts from its own
 * opening (A3 §1), so no two pairs could ever share a key and "distinct pairs
 * only" removed nothing it was written to remove. Worse, it hid a REAL
 * replication in the frozen dev book. `p1-g5-s245` (MOVE 1,0→3,0, MOVE 3,0→1,0,
 * END_ACTION_PHASE, PROMOTE 0,1, END_PLACE_PHASE) and `p1-g3-s3`
 * (END_ACTION_PHASE, PROMOTE 0,1, END_PLACE_PHASE) are a transposition: the
 * round trip changes nothing a rule reads, so both ids replay to the SAME
 * playable position at both handicaps — 48 ids, 47 start positions. `AIEngineV2`
 * is deterministic at a fixed work budget, so in each `aiv2-medium` cell those
 * two pairs are one game counted twice, and an id-keyed digest called them two.
 *
 * A game is therefore keyed by `startPositionDigest` — a semantic fingerprint of
 * the position, not of the route to it — together with its steps. Two games that
 * would replay into each other hash the same however they were labelled; two
 * games that diverge at any decision do not.
 */
import { createHash } from 'node:crypto';
import { getAttackCount } from '../../src/game/combat';
import type { AIAction } from '../../src/ai/types';
import type { GameState, Position, Unit } from '../../src/game/types';

/** Bumped whenever the canonical form below changes; part of every digest. */
export const START_POSITION_SCHEMA = 'muju-gate1-start-v1' as const;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const square = (p: Position) => `${p.x},${p.y}`;

/** The square a unit stands on in `before`. Throws rather than guess: every
 * id-bearing action is legality-checked against this position by the harness,
 * so a missing unit is a defect in the runner, not a game event. */
function squareOf(before: GameState, unitId: string, where: string): string {
  const unit = before.board.units.find(u => u.id === unitId);
  if (!unit) throw new Error(`${where}: no unit ${unitId} on the board in this position`);
  return square(unit.position);
}

/**
 * One unit, written so it names no minted id and carries only what a rule can
 * read.
 *
 * WHY EXACTLY THIS LIST. `src/ai/hard/types.ts` (`PackedState`) is the canonical
 * rules-complete encoding of a Phasing position, justified field by field
 * against the shipped rules in that file's RE references, and per unit it keeps
 * square, definition, owner, `damage`, `atkCount` and the flags
 * `F_CAN_ACT | F_LAST_KILLED | F_PLACED | F_PROMOTED`. It keeps NEITHER
 * `hasMoved` NOR `hasAttacked`: "`hasMoved` / `hasAttacked` are absent because
 * no rule reads them (RE §1.5)". Both claims hold in this tree — `hasMoved` has
 * no reader anywhere outside move application, and `hasAttacked` is read only by
 * `combat.ts#getAttackCount`, as a legacy floor under `attackedThisTurn.length`,
 * so the ATTACK COUNT is the semantic quantity and is what is recorded here.
 *
 * `attackedThisTurn` is a list of ids, so it cannot be hashed as it stands. Only
 * targets still ON the board can affect play (`getValidAttacks` refuses to
 * repeat a target and only ever considers occupied adjacent squares), so those
 * are recorded by square; the rest contribute through the count.
 */
function canonicalUnit(state: GameState, unit: Unit) {
  const hit = (unit.attackedThisTurn ?? [])
    .map(id => state.board.units.find(u => u.id === id))
    .filter((u): u is Unit => u !== undefined)
    .map(u => square(u.position))
    .sort();
  return {
    d: unit.definitionId, o: unit.owner, x: unit.position.x, y: unit.position.y,
    dmg: unit.damageTaken,
    act: unit.canActThisTurn === true,
    atk: getAttackCount(unit),
    killed: unit.lastAttackKilled === true,
    placed: unit.placedThisTurn === true,
    promoted: unit.promotedThisPlacement === true,
    hit,
  };
}

/**
 * The semantic form of a start position: everything a rule or an engine can
 * read, canonically ordered, with every minted id and every UI field removed.
 *
 * Two fields need a word of their own. `unitOrder` and `pendingOrder` record the
 * BIRTH and COMMIT sequences — the order `board.units` and `pendingSummons` are
 * themselves in. No rule reads either (`PackedState.ord` / `pendOrd`: "nothing
 * in the RULES reads it"), but arrival order and the tactics prover's
 * `buildOwned` do, so an engine's tie-breaking can see them. They are kept as
 * permutations of squares — id-free, and identical for two replays of one
 * opening — so this digest never merges two positions an engine could tell
 * apart. Erring that way is the safe direction: a false MERGE could understate
 * the sample size only if the two games then also matched step for step, while
 * a false SPLIT is exactly the defect this module was rewritten to remove.
 */
export function canonicalStartPosition(state: GameState, handicap: number) {
  const stateHandicap = state.blackCrystalHandicap ?? 0;
  if (stateHandicap !== handicap) {
    throw new Error(`Start position handicap ${stateHandicap} is not the ${handicap} this game is scheduled at`);
  }
  const units = state.board.units.map(u => canonicalUnit(state, u))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.o.localeCompare(b.o) || a.d.localeCompare(b.d));
  const pending = (state.pendingSummons ?? [])
    .map(s => ({ o: s.owner, d: s.definitionId, x: s.position.x, y: s.position.y, cost: s.cost }))
    .sort((a, b) => a.o.localeCompare(b.o) || a.y - b.y || a.x - b.x || a.d.localeCompare(b.d) || a.cost - b.cost);
  return {
    schema: START_POSITION_SCHEMA,
    rules: {
      ruleset: state.ruleset ?? null,
      actionsPerTurn: state.actionsPerTurn ?? null,
      blackCrystalHandicap: stateHandicap,
      victoryRule: state.victoryRule ?? null,
      inactivityRule: state.inactivityRule ?? null,
      reviewUpkeep: { white: state.reviewUpkeep?.white === true, black: state.reviewUpkeep?.black === true },
    },
    phase: state.phase,
    winner: state.winner,
    victoryReason: state.victoryReason ?? null,
    turn: {
      currentPlayer: state.turn.currentPlayer,
      phase: state.turn.phase,
      actionsRemaining: state.turn.actionsRemaining,
      turnNumber: state.turn.turnNumber,
    },
    upkeepPending: state.upkeepPending === true,
    clock: state.inactivityPlies ?? 0,
    progressThisTurn: state.progressThisTurn === true,
    banks: {
      white: {
        resources: state.players.white.resources, gained: state.players.white.resourcesGained,
        upkeep: state.players.white.resourcesUpkeep ?? 0, home: square(state.players.white.startCorner),
      },
      black: {
        resources: state.players.black.resources, gained: state.players.black.resourcesGained,
        upkeep: state.players.black.resourcesUpkeep ?? 0, home: square(state.players.black.startCorner),
      },
    },
    reserves: state.board.cells.map(row => row.map(cell => cell.resourceLayers)),
    initialReserves: [...(state.board.initialResourceLayers ?? [])],
    units,
    unitOrder: state.board.units.map(u => square(u.position)),
    pending,
    pendingOrder: (state.pendingSummons ?? []).map(s => `${s.owner}@${square(s.position)}`),
  };
}

/** The id-independent fingerprint of the position a Gate 1 game starts from. */
export function startPositionDigest(state: GameState, handicap: number): string {
  return sha256(JSON.stringify(canonicalStartPosition(state, handicap)));
}

/**
 * The same fingerprint with `unitOrder` and `pendingOrder` removed, for the
 * LATER-CONVERGENCE report.
 *
 * WHY A SECOND DIGEST RATHER THAN REUSING THE FIRST. `startPositionDigest` keeps
 * the birth and commit orders because an engine's tie-breaking can see them, and
 * erring towards SPLITTING is the safe direction when the number decides a cell's
 * effective sample size (A3 §2). The convergence report asks the opposite
 * question — "did two games of this cell walk into the same playable position?" —
 * and there a false split hides exactly what it was written to find: two games
 * whose boards, banks, reserves, clocks and side to move are identical differ
 * only in the order their units happened to be created, which no rule reads. So
 * this digest drops both permutations and nothing else.
 *
 * It gates NOTHING. Convergence is reported, per cell, with the earliest ply at
 * which it happened, so a reader can see how much of a row's apparent
 * independence survives the opening — and can see it without any threshold
 * deciding on their behalf.
 */
export function boundaryPositionDigest(state: GameState, handicap: number): string {
  const { unitOrder: _unitOrder, pendingOrder: _pendingOrder, ...rest } = canonicalStartPosition(state, handicap);
  return sha256(JSON.stringify({ kind: 'muju-gate1-boundary-v1', ...rest }));
}

/** One action, written so it names no minted id. */
export function canonicalAction(before: GameState, action: AIAction): string {
  const where = `gate1 trace (turn ${before.turn.turnNumber}, ${before.turn.currentPlayer})`;
  switch (action.type) {
    case 'MOVE':
      return `M ${squareOf(before, action.unitId, where)} ${square(action.to)}`;
    case 'ATTACK':
      return `A ${squareOf(before, action.unitId, where)} ${square(action.targetPosition)}`;
    case 'PROMOTE_UNIT':
      return `P ${squareOf(before, action.unitId, where)}`;
    case 'BUY_UNIT':
      return `B ${action.definitionId} ${square(action.position)}`;
    case 'PAY_UPKEEP':
      return `U ${action.keepUnitIds.map(id => squareOf(before, id, where)).sort().join('|')}`;
    case 'END_ACTION_PHASE':
      return 'EA';
    case 'END_PLACE_PHASE':
      return 'EP';
    case 'RESIGN':
      return 'R';
  }
}

/** The context an action was taken in, so a reordered game cannot collide with an identical one. */
export function canonicalStep(before: GameState, action: AIAction): string {
  const phase = before.upkeepPending ? 'upkeep' : before.turn.phase;
  return `${before.turn.turnNumber}/${before.turn.currentPlayer}/${phase}/${canonicalAction(before, action)}`;
}

/**
 * Accumulates the canonical steps of one game and hashes them under the SEMANTIC
 * start position (`startPositionDigest`), never under an opening id. The
 * handicap is already inside that digest, so it is not passed again.
 */
export function createTraceHasher(startSha256: string) {
  if (!/^[0-9a-f]{64}$/.test(startSha256)) {
    throw new Error(`Gate 1 trace needs a start-position sha256, got ${JSON.stringify(startSha256)}`);
  }
  const steps: string[] = [];
  return {
    steps,
    push(before: GameState, action: AIAction) {
      steps.push(canonicalStep(before, action));
    },
    /** The same moves from two POSITIONS are two games; the same moves from one
     * position reached by two different routes are one game. */
    digest(): string {
      return sha256(JSON.stringify({ start: startSha256, steps }));
    },
  };
}
