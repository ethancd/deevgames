/**
 * JUDGE 4 for the E3.1 loss judgment (lane 6, `docs/hard-ai/e3/E3-PLAN.md`).
 *
 * "A canonical fact. Anything the rules engine can enumerate exactly (a kill
 * that exists, an upkeep bill, a spawn rectangle), which is not a judgment but
 * can show a feature is wrong about the position it claims to describe."
 *
 * Every number here comes from `src/game/**` — the canonical rules the harness
 * plays under — and NEVER from `src/ai/hard/**`. That is the whole point: a
 * disagreement between one of these facts and the feature that claims to
 * describe it is an engine-bug finding, and it cannot be one if both sides of
 * the comparison are computed by the same module.
 *
 * WHAT "NEXT TURN" MEANS. `kills` enumerates the (attacker, target) pairs that
 * exist ON THE BOARD OF THIS POSITION: attacker owned by `side`, target
 * adjacent-and-legal per `getValidAttacks`, and `canBeEliminated(target,
 * attacker)` true for a single attacker. For the side to move that is a kill
 * available in the turn about to be played; for the other side it is a kill
 * available once the turn passes, assuming the position is unchanged. It is a
 * lower bound on tactical opportunity: it counts no combined attacks (which
 * `canBeEliminatedByCombined` would), no kills reached by moving first, and no
 * kills a purchase creates. Reported both ways so a reader can see which.
 */
import type { GameState, PlayerId, Unit } from '../../../src/game/types';
import { getValidAttacks, canBeEliminated, calculateAttackPower, calculateDefense } from '../../../src/game/combat';
import { getValidMoves } from '../../../src/game/movement';
import { getUnitAt } from '../../../src/game/board';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { upkeepDue } from '../../../src/game/upkeep';
import { getUnitDefinition } from '../../../src/game/units';

export interface SideFacts {
  /** Σ catalogue cost of this player's units on the board, in crystals. */
  materialCrystals: number;
  units: number;
  /** `state.players[side].resources`. */
  bank: number;
  /** `upkeepDue` — the whole rent bill in crystals, the rules engine's own sum. */
  upkeepDue: number;
  /** `bank - upkeepDue`; negative means the bill cannot be paid in full from the bank. */
  upkeepShortfall: number;
  /** Single-attacker kills this player has on the board right now (see the header). */
  kills: number;
  /** Σ catalogue cost of the units those kills would remove, in crystals. */
  killValueCrystals: number;
  /** Kills the OPPONENT would need two or more attackers for, counted as pairs that fail alone. */
  killsTooStrongAlone: number;
  /** An enemy unit stands on this player's start corner. */
  homeOccupied: boolean;
  /** An enemy unit can step onto this player's start corner with one legal move. */
  homeReachableInOneMove: boolean;
  /** Own unit standing on own start corner (the "plug"). */
  homePlugged: boolean;
  /** `getAllSpawnPositions(side).length` — the spawn rectangle the rules allow. */
  spawnSquares: number;
  /**
   * Σ catalogue cost of THIS player's units that an enemy unit can eliminate
   * inside one turn by moving at most one step and then attacking, single
   * attacker, no purchase. This is the canonical analogue of the `Hanging`
   * feature's `hangingCc` (which sums the same priors over slots whose
   * `t.killActions` is at most `ACTIONS_PER_TURN`). It is a LOWER BOUND on
   * `hangingCc`: the tables allow multi-step approaches and this does not, so a
   * unit this counts is certainly hangable and a unit it misses may still be.
   */
  hangableValueCrystals: number;
  /** How many of this player's units that is. */
  hangableUnits: number;
}

export interface PositionFacts {
  white: SideFacts;
  black: SideFacts;
  /** The player to move in this position. */
  toMove: PlayerId;
  phase: string;
  turnNumber: number;
  upkeepPending: boolean;
  winner: PlayerId | null;
}

function costOf(u: Unit): number {
  return getUnitDefinition(u.definitionId).cost;
}

/**
 * The same unit with its per-turn flags reset, which is what "next turn" means.
 * `canMove`/`canAttack` read `canActThisTurn`, `hasAttacked`, `attackedThisTurn`
 * and `lastAttackKilled`, and at a turn's END STATE those flags still carry
 * whatever the turn just played left behind — for the mover's own units
 * certainly, and for the opponent's whenever its previous turn set them. Asking
 * "what can this side do next turn" on the raw flags therefore undercounts.
 * Every enumeration below runs on `fresh` units for that reason; the board they
 * stand on is untouched.
 */
function fresh(u: Unit): Unit {
  return { ...u, canActThisTurn: true, hasMoved: false, hasAttacked: false, attackedThisTurn: [], lastAttackKilled: false };
}

function sideFacts(state: GameState, side: PlayerId): SideFacts {
  const board = state.board;
  const mine = board.units.filter(u => u.owner === side);
  const theirs = board.units.filter(u => u.owner !== side);
  let kills = 0;
  let killValueCrystals = 0;
  let tooStrong = 0;
  for (const raw of mine) {
    const attacker = fresh(raw);
    for (const pos of getValidAttacks(attacker, board)) {
      const target = getUnitAt(board, pos);
      if (!target || target.owner === side) continue;
      if (canBeEliminated(target, attacker)) {
        kills++;
        killValueCrystals += costOf(target);
      } else if (calculateAttackPower(attacker, target) < calculateDefense(target)) {
        tooStrong++;
      }
    }
  }
  const corner = state.players[side].startCorner;
  const onCorner = getUnitAt(board, corner);
  let reachable = false;
  for (const enemy of theirs) {
    if (getValidMoves(enemy, board).some(p => p.x === corner.x && p.y === corner.y)) {
      reachable = true;
      break;
    }
  }
  // Hangable: an enemy attacker, optionally one step first, that eliminates a
  // unit of `side` outright. The one-step board is built by copying the unit
  // list with the attacker relocated, which is what `getValidAttacks` reads.
  let hangableValueCrystals = 0;
  let hangableUnits = 0;
  for (const mineUnit of mine) {
    let hangable = false;
    for (const rawEnemy of theirs) {
      const enemy = fresh(rawEnemy);
      const squares = [enemy.position, ...getValidMoves(enemy, board)];
      for (const sq of squares) {
        if (sq !== enemy.position && getUnitAt(board, sq) !== null) continue;
        const moved = sq === enemy.position ? enemy : { ...enemy, position: sq };
        const hypothetical =
          sq === enemy.position ? board : { ...board, units: board.units.map(u => (u.id === enemy.id ? moved : u)) };
        if (!getValidAttacks(moved, hypothetical).some(pp => pp.x === mineUnit.position.x && pp.y === mineUnit.position.y)) continue;
        if (canBeEliminated(mineUnit, moved)) { hangable = true; break; }
      }
      if (hangable) break;
    }
    if (hangable) { hangableUnits++; hangableValueCrystals += costOf(mineUnit); }
  }
  const due = upkeepDue(state, side);
  return {
    materialCrystals: mine.reduce((n, u) => n + costOf(u), 0),
    units: mine.length,
    bank: state.players[side].resources,
    upkeepDue: due,
    upkeepShortfall: state.players[side].resources - due,
    kills,
    killValueCrystals,
    killsTooStrongAlone: tooStrong,
    homeOccupied: onCorner !== undefined && onCorner !== null && onCorner.owner !== side,
    homeReachableInOneMove: reachable,
    homePlugged: onCorner !== undefined && onCorner !== null && onCorner.owner === side,
    spawnSquares: getAllSpawnPositions(side, board).length,
    hangableValueCrystals,
    hangableUnits,
  };
}

/** Every canonical fact this lane checks a feature against, both seats. */
export function positionFacts(state: GameState): PositionFacts {
  return {
    white: sideFacts(state, 'white'),
    black: sideFacts(state, 'black'),
    toMove: state.turn.currentPlayer,
    phase: state.turn.phase,
    turnNumber: state.turn.turnNumber,
    upkeepPending: state.upkeepPending === true,
    winner: state.winner ?? null,
  };
}

export interface FactCheck {
  /** The feature whose claim is being checked. */
  feature: string;
  /** What the engine's feature vector says, from the seat's point of view. */
  featureValue: number;
  /** What the rules engine says the same quantity is, from the same point of view. */
  canonicalValue: number;
  agrees: boolean;
  note: string;
}

/**
 * The four features whose definitions are pure arithmetic on facts the rules
 * engine also computes, checked from `seat`'s point of view. A disagreement is
 * an engine-bug candidate; an agreement exonerates the feature ON THIS
 * POSITION only.
 *
 * `HomeInvaded` is `[enemy on MY corner] − [enemy on THEIR corner]` in
 * `features.ts:178`, so a POSITIVE value means MY home is the invaded one.
 * Its weight is −4000, which is the sign that reading requires.
 */
export function factChecks(facts: PositionFacts, f: readonly number[], seat: PlayerId, F: Record<string, number>): FactCheck[] {
  const me = seat === 'white' ? facts.white : facts.black;
  const them = seat === 'white' ? facts.black : facts.white;
  const out: FactCheck[] = [];
  out.push({
    feature: 'Rent',
    featureValue: f[F.Rent],
    canonicalValue: me.upkeepDue - them.upkeepDue,
    agrees: f[F.Rent] === me.upkeepDue - them.upkeepDue,
    note: 'upkeepDue(me) − upkeepDue(them), crystals, from src/game/upkeep.ts',
  });
  const liquid = Math.min(me.bank, 8) - Math.min(them.bank, 8);
  out.push({
    feature: 'BankLiquid',
    featureValue: f[F.BankLiquid],
    canonicalValue: liquid,
    agrees: f[F.BankLiquid] === liquid,
    note: 'min(bank,8) difference, banks from state.players[*].resources',
  });
  const invaded = (me.homeOccupied ? 1 : 0) - (them.homeOccupied ? 1 : 0);
  out.push({
    feature: 'HomeInvaded',
    featureValue: f[F.HomeInvaded],
    canonicalValue: invaded,
    agrees: f[F.HomeInvaded] === invaded,
    note: '[enemy stands on my corner] − [enemy stands on their corner]',
  });
  const plug = (me.homePlugged ? 1 : 0) - (them.homePlugged ? 1 : 0);
  out.push({
    feature: 'HomePlug',
    featureValue: f[F.HomePlug],
    canonicalValue: plug,
    agrees: f[F.HomePlug] === plug,
    note: 'own unit standing on own start corner, difference',
  });
  // `Hanging` is `div100(hangingCc(me) − hangingCc(them))`, i.e. crystals of my
  // own material the enemy can kill inside a turn minus the same for them, and
  // its weight is −50: a POSITIVE value means MY material is the more hangable.
  // The canonical count below is a lower bound (one-step approaches only), so
  // only the SIGN is compared, and only when the canonical difference is not
  // zero. A sign disagreement is a semantics finding to report, not proof of a
  // bug, because the feature legitimately sees kills this count cannot.
  const hangCanon = me.hangableValueCrystals - them.hangableValueCrystals;
  out.push({
    feature: 'Hanging',
    featureValue: f[F.Hanging],
    canonicalValue: hangCanon,
    agrees: hangCanon === 0 || f[F.Hanging] === 0 || Math.sign(f[F.Hanging]) === Math.sign(hangCanon),
    note: 'sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature\'s hangingCc',
  });
  const spawnZero = (me.spawnSquares === 0 ? 1 : 0) - (them.spawnSquares === 0 ? 1 : 0);
  out.push({
    feature: 'SpawnZero',
    featureValue: f[F.SpawnZero],
    canonicalValue: spawnZero,
    agrees: f[F.SpawnZero] === spawnZero,
    note: '[getAllSpawnPositions is empty] difference; the feature is geom.zeroCliff, a table quantity, so a mismatch is a semantic difference to report, not automatically a bug',
  });
  return out;
}
