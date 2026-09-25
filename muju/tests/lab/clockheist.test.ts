// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createBot, botNames } from '../../lab/harness/bots/index';
import { playGame, buildView } from '../../lab/harness/runner';
import { legalActions } from '../../lab/harness/legal';
import { mulberry32 } from '../../lab/harness/rng';
import { createInitialGameState, getAdjacentPositions } from '../../src/game/board';
import { getMovementRange } from '../../src/game/movement';
import { getUnitDefinition } from '../../src/game/units';
import type { BoardState, GameState, PendingSummon, PlayerId, Unit, Position } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import type { GameRecord, ReplayFile } from '../../lab/harness/types';
import { resolveEngine } from '../../lab/hard-ai/ladder/engines';
import { applyAction } from '../../src/ai/simulate';
import { getAllSpawnPositions } from '../../src/game/spawning';

/**
 * ClockHeist (STRATEGOS W1.12: `~/.claude/plans/can-you-respond-to-piped-book.md`
 * Part B.1). Two kinds of coverage, per the plan's testing philosophy (Part A
 * item 6: paired positions that differ in one fact must flip the decision) and
 * the plan's own list for this step:
 *
 *   - Harness-level: legal over seeded games against Random and against a
 *     small-work Hard, deterministic given its rng, and registered on the
 *     ladder under its own name.
 *   - Authored positions, each in a pair (or triple) that changes exactly one
 *     fact and must flip the decision: the clock value (2 vs 3) and the mined
 *     lead (ahead vs level vs behind) around the lock; the phase (Action vs
 *     Place) inside the lock; the lead (behind vs level) around a free kill;
 *     and one survivor's square or one pending arrival around the free kill's
 *     safety veto.
 *
 * "Out of reach" is checked against an oracle built from the movement and
 * combat rules themselves (`ruleStrikeSquares`: `getMovementRange` with
 * blockers, then adjacency), not against ClockHeist's own empty-board formula,
 * so a retreat or a veto that the rules do not justify fails here.
 *
 * "Hard-25k" is the plan's own name and is registered as-is in
 * `lab/harness/bots/index.ts` (a low, fixed-work Hard preset, `profile: 'lab'`;
 * fixed work is deterministic and machine independent, unlike a wall-clock
 * preset).
 */

// ---------- harness-level: legality, determinism, registry ----------

async function run(white: string, black: string, seed: number, maxTurns = 60, recordReplay = false): Promise<{ record: GameRecord; replay: ReplayFile | null }> {
  return playGame({
    bots: { white: createBot(white), black: createBot(black) },
    seed,
    engineHash: 'test',
    runId: 'test',
    options: { recordReplay, maxTurns },
  });
}

describe('ClockHeist', () => {
  it('is registered and its name does not match the AntiRush/Guard upkeep-order regex', () => {
    expect(botNames()).toContain('ClockHeist');
    // lab/harness/runner.ts: a name matching this pattern gets upkeep resolved
    // home-unit-first instead of ClockHeist's ordinary cost-descending order
    // (see clockheist.ts's header for what the grep found and why it matters).
    expect(/AntiRush|Guard/.test('ClockHeist')).toBe(false);
  });

  // A scripted bot that returns an action outside the legal set makes the
  // runner THROW (`lab/harness/runner.ts`), so a completed game is itself the
  // legality proof for the ClockHeist seat; `illegalActions` is only ever
  // counted for engine seats.
  it('plays only legal actions over several seeded games against Random', async () => {
    for (const seed of [4001, 4002, 4003]) {
      const { record } = await run('ClockHeist', 'Random', seed);
      expect(record.invariantViolation, `seed ${seed}`).toBeNull();
      expect(record.winType, `seed ${seed}`).not.toBe('invariant-violation');
      expect(record.turns).toBeGreaterThan(0);
    }
    for (const seed of [4004, 4005]) {
      // ClockHeist as Black too -- its posture logic reads `view.player`, not
      // a hard-coded seat, so this catches a white-only assumption.
      const { record } = await run('Random', 'ClockHeist', seed);
      expect(record.invariantViolation, `seed ${seed}`).toBeNull();
      expect(record.winType, `seed ${seed}`).not.toBe('invariant-violation');
    }
  }, 60000); // explicit per-test budget, matching tests/lab/harness.test.ts's convention

  it('plays only legal actions over seeded games against a small-work Hard (Hard-25k)', async () => {
    for (const seed of [4101, 4102]) {
      const { record } = await run('ClockHeist', 'Hard-25k', seed, 40);
      expect(record.invariantViolation, `seed ${seed}`).toBeNull();
      // Hard-25k is a REPLICA search: a divergence from the canonical engine
      // is counted as an anomaly, not applied as an illegal action, so this is
      // the field to check on that side (`lab/hard-ai/bots/hard.ts`).
      expect(record.players.black.illegalActions, `seed ${seed}`).toBe(0);
      expect(record.anomalies, `seed ${seed}`).toEqual([]);
    }
  }, 60000); // explicit per-test budget: two full games at a small fixed-work Hard

  it('is deterministic per seed: same rng, same game, step for step', async () => {
    const a = await run('ClockHeist', 'Rush', 909090, 60, true);
    const b = await run('ClockHeist', 'Rush', 909090, 60, true);
    expect(a.record.winType).toBe(b.record.winType);
    expect(a.record.plies).toBe(b.record.plies);
    expect(a.replay!.steps.length).toBeGreaterThan(10);
    // Unit ids embed a wall-clock stamp (`createInitialGameState`), so they are
    // dropped; every step's board, cells, banks and action otherwise match.
    const steps = (r: ReplayFile | null) => JSON.stringify(r!.steps, (k, v) => (k === 'unitId' ? undefined : v));
    expect(steps(a.replay)).toBe(steps(b.replay));
  }, 30000); // explicit per-test budget; see the E0.5 timeout note in tests/lab/harness.test.ts

  it('resolves on the ladder registry under its own name', () => {
    const engine = resolveEngine('ClockHeist');
    expect(engine.name).toBe('ClockHeist');
    // Plan B.1b: the ladder identity is the name alone.
    expect(engine.configHash({ mode: 'fixed', units: 0 })).toBe('scripted:ClockHeist');
    const bot = engine.createBot({ mode: 'fixed', units: 0 });
    expect(bot.kind).toBe('scripted');
    expect(bot.name).toBe('ClockHeist');
  });
});

// ---------- authored positions ----------

function makeUnit(id: string, definitionId: string, owner: PlayerId, position: Position): Unit {
  return {
    id, definitionId, owner, position,
    hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken: 0, lastAttackKilled: false,
  };
}

interface Scenario {
  units: Unit[];
  /** Mined totals (`resourcesGained`; no Black handicap in these positions). */
  white: number;
  black: number;
  clock: number;
  phase?: 'action' | 'place';
  whiteBank?: number;
  pending?: PendingSummon[];
}

/** A mid-turn Phasing position, White to move with a full action budget and
 * no upkeep pending. Cells, handicap and actionsPerTurn are production
 * defaults from a fresh initial state; every scenario fact is explicit. */
function authoredPosition(s: Scenario): GameState {
  const base = createInitialGameState(undefined, 4, 0, 'phasing');
  return {
    ...base,
    phase: 'playing',
    upkeepPending: false,
    inactivityPlies: s.clock,
    progressThisTurn: false,
    turn: { currentPlayer: 'white', phase: s.phase ?? 'action', actionsRemaining: 4, turnNumber: 9 },
    board: { ...base.board, units: s.units },
    pendingSummons: s.pending ?? [],
    players: {
      white: { ...base.players.white, resourcesGained: s.white, resources: s.whiteBank ?? 0 },
      black: { ...base.players.black, resourcesGained: s.black },
    },
  };
}

function decide(state: GameState): AIAction {
  const bot = createBot('ClockHeist');
  if (bot.kind !== 'scripted') throw new Error('ClockHeist must be a scripted bot');
  const view = buildView(state, 'white');
  const legal = legalActions(state, 'white');
  const action = bot.chooseAction({ view, legal, rng: mulberry32(1) });
  if (!action) throw new Error('ClockHeist returned no action for an authored position');
  return action;
}

const key = (p: Position) => `${p.x},${p.y}`;

/**
 * The oracle: every square `enemy` could attack on its next turn by the rules
 * themselves — the squares it can reach with `actions − 1` MOVE actions on
 * THIS board (`getMovementRange`, which respects blockers), plus its own, each
 * dilated by one (attacks are adjacent). ClockHeist's empty-board formula must
 * contain this set; a retreat destination inside it is not out of reach.
 * The set is a lower bound on real reach, not the whole of it: a lethal hit
 * unlocks another attack, so a piece can also strike through a square whose
 * occupant it kills first (the W1.12 re-review's cleave test, below).
 */
function ruleStrikeSquares(board: BoardState, enemy: { position: Position; definitionId: string }, actions = 4): Set<string> {
  const speed = getUnitDefinition(enemy.definitionId).speed;
  const origins = [enemy.position, ...(speed > 0
    ? getMovementRange(enemy.position, speed, actions - 1, board).map(r => r.position) : [])];
  const out = new Set<string>();
  for (const o of origins) for (const t of getAdjacentPositions(o)) out.add(key(t));
  return out;
}

describe('ClockHeist authored positions: the lock (ahead at clock >= 3)', () => {
  /**
   * White fire_1 (speed 2) on a paying cell (4,4); Black water_1 (speed 1) at
   * (4,7), three squares away — out of its ONE-move reach (speed + 1 = 2) but
   * inside its real next-turn reach (three moves, then the hit: 4). No attack
   * is available to anyone this ply. Around the base case (ahead, clock 3),
   * each variant changes one fact.
   */
  const w1 = makeUnit('w1', 'fire_1', 'white', { x: 4, y: 4 });
  const b1 = makeUnit('b1', 'water_1', 'black', { x: 4, y: 7 });
  const units = [w1, b1];

  it('the threat is real: by the rules, water_1 at (4,7) can strike (4,4) next turn', () => {
    const board = authoredPosition({ units, white: 20, black: 5, clock: 3 }).board;
    expect(ruleStrikeSquares(board, b1).has(key(w1.position))).toBe(true);
  });

  it('ahead at clock 3: retreats the threatened unit to a square the rules put out of reach', () => {
    const state = authoredPosition({ units, white: 20, black: 5, clock: 3 });
    const action = decide(state);
    expect(action.type).toBe('MOVE');
    if (action.type !== 'MOVE') return;
    expect(action.unitId).toBe('w1');
    const after: BoardState = { ...state.board, units: state.board.units.map(u => u.id === 'w1' ? { ...u, position: action.to } : u) };
    expect(ruleStrikeSquares(after, b1).has(key(action.to)), `retreated to ${key(action.to)}`).toBe(false);
  });

  it('ahead at clock 2 (one fact changed: the clock): no lock, so it stays and passes', () => {
    const action = decide(authoredPosition({ units, white: 20, black: 5, clock: 2 }));
    expect(action).toEqual({ type: 'END_ACTION_PHASE' });
  });

  it('level at clock 3 (one fact changed: the lead): no lock, so it stays and passes', () => {
    const action = decide(authoredPosition({ units, white: 20, black: 20, clock: 3 }));
    expect(action).toEqual({ type: 'END_ACTION_PHASE' });
  });

  it('locked in the PLACE phase (one fact changed: the phase): still drones a tier-1 miner', () => {
    // White's three starting units stand on (1,0), (1,1) and (0,1), so the
    // home square (0,0) is a legal spawn; ten crystals buy any tier-1 unit.
    const start = createInitialGameState(undefined, 4, 0, 'phasing').board.units.filter(u => u.owner === 'white');
    const state = authoredPosition({ units: [...start, b1], white: 20, black: 5, clock: 3, phase: 'place', whiteBank: 10 });
    expect(legalActions(state, 'white').some(a => a.type === 'BUY_UNIT')).toBe(true);
    const action = decide(state);
    expect(action.type).toBe('BUY_UNIT');
    if (action.type !== 'BUY_UNIT') return;
    const def = getUnitDefinition(action.definitionId);
    expect(def.tier).toBe(1);
    expect(def.mining).toBeGreaterThan(0);
  });
});

describe('ClockHeist authored positions: locked-lead mining economics (W1.12 follow-up)', () => {
  /**
   * W1.12 follow-up (the coordinator's step brief for this lane, "ClockHeist
   * hold economics"; plan Part B.1 names the lock, the brief splits it by
   * unit): a unit outside every enemy strike area keeps mining, a unit inside
   * one retreats. This pair changes exactly the mining unit's own square
   * (plan Part A item 6). It is the brief's named pair, and the pre-follow-up
   * lock ALSO passes it (it passed a safe unit and retreated a threatened
   * one); the follow-up's new behaviour is pinned by the two describe blocks
   * below, each with cases that fail against the pre-follow-up lock (checked
   * in the W1.12 follow-up review, along with one mutation per guard).
   * Black's water_1 sits at (4,9); its next-turn reach is
   * `speed * (actions - 1) + 1 = 1*3+1 = 4` squares. (4,4) is Manhattan
   * distance 5 away -- out of reach; (4,5) is distance 4 -- inside it.
   * Fire_1 mines on both squares (row y=4 and y=5 both hold resource layers
   * 8, `src/game/resourceMap.ts` `UNEQUAL_ROUTES_MAP`), so the only fact this
   * pair varies is safety, never richness.
   */
  const paying1 = makeUnit('w1', 'fire_1', 'white', { x: 4, y: 4 });
  const paying2 = makeUnit('w1', 'fire_1', 'white', { x: 4, y: 5 });
  const threat = makeUnit('b1', 'water_1', 'black', { x: 4, y: 9 });

  it('ahead at clock >= 3, unit outside every enemy strike area on a mining cell: stays and mines', () => {
    const state = authoredPosition({ units: [paying1, threat], white: 20, black: 5, clock: 3 });
    // The rules agree it is truly out of reach, not just past ClockHeist's
    // own empty-board estimate.
    expect(ruleStrikeSquares(state.board, threat).has(key(paying1.position))).toBe(false);
    // Nothing to improve: the unit is already safe and already mining, and
    // fire_1 mines 1 a turn (`src/game/units.ts`), so no reachable cell can
    // pay it strictly more -- the lock moves a safe unit only for a STRICT
    // yield gain, so it passes.
    expect(decide(state)).toEqual({ type: 'END_ACTION_PHASE' });
  });

  it('the same unit one square inside an enemy strike area (one fact changed: its square): retreats', () => {
    const state = authoredPosition({ units: [paying2, threat], white: 20, black: 5, clock: 3 });
    expect(ruleStrikeSquares(state.board, threat).has(key(paying2.position))).toBe(true);
    const action = decide(state);
    expect(action.type).toBe('MOVE');
    if (action.type !== 'MOVE') return;
    expect(action.unitId).toBe('w1');
    const after: BoardState = { ...state.board, units: state.board.units.map(u => u.id === 'w1' ? { ...u, position: action.to } : u) };
    expect(ruleStrikeSquares(after, threat).has(key(action.to)), `retreated to ${key(action.to)}`).toBe(false);
  });
});

/** The same position with every cell's reserve set to `fill`, except the
 * squares named in `rich` (`"x,y"` -> reserve). Lets a test say exactly which
 * cells pay, so a pair can differ in one cell's reserve and nothing else. */
function withReserves(state: GameState, fill: number, rich: Record<string, number> = {}): GameState {
  const cells = state.board.cells.map(row => row.map(c => ({ ...c, resourceLayers: rich[key(c.position)] ?? fill })));
  return { ...state, board: { ...state.board, cells } };
}

const dist = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('ClockHeist authored positions: a safe unit on a mined-out cell under the lock (W1.12 follow-up)', () => {
  /**
   * The follow-up's reason for existing: before it, a locked unit whose cell
   * had mined out could never move again. White fire_1 (speed 2, mines 1) at
   * (4,2) on an EMPTY cell, seven squares from Black's water_1 at (4,9) (reach
   * 4) -- safe. Every cell is empty except the one each case names, so the
   * only fact that varies is WHERE the one paying cell is. Both candidate cells
   * are one legal MOVE away and outside the rules' strike squares; the pair
   * isolates the "not toward the enemy" guard.
   */
  const w1 = makeUnit('w1', 'fire_1', 'white', { x: 4, y: 2 });
  const b1 = makeUnit('b1', 'water_1', 'black', { x: 4, y: 9 });
  const locked = () => authoredPosition({ units: [w1, b1], white: 20, black: 5, clock: 3 });

  it('the only paying cell lies away from the enemy (4,0): it steps there to keep mining', () => {
    const state = withReserves(locked(), 0, { '4,0': 8 });
    expect(ruleStrikeSquares(state.board, b1).has('4,0')).toBe(false);
    expect(decide(state)).toEqual({ type: 'MOVE', unitId: 'w1', to: { x: 4, y: 0 } });
  });

  it('the only paying cell is safe but closer to the enemy (4,4) (one fact changed): it passes', () => {
    const state = withReserves(locked(), 0, { '4,4': 8 });
    // Safe by the rules (so the refusal is the direction guard, not safety) ...
    expect(ruleStrikeSquares(state.board, b1).has('4,4')).toBe(false);
    // ... but it shortens the distance to the nearest enemy from 7 to 5.
    expect(dist({ x: 4, y: 4 }, b1.position)).toBeLessThan(dist(w1.position, b1.position));
    expect(decide(state)).toEqual({ type: 'END_ACTION_PHASE' });
  });

  /**
   * Isolates the "never INTO reach" guard from the direction guard: a second,
   * faster Black piece (fire_1, reach 2 x 3 + 1 = 7) at (9,6), nine squares
   * from w1. (6,2) is exactly seven from it -- inside its strike area -- yet
   * no closer to the NEAREST enemy than w1 is now (7 from each). (2,2) is
   * outside both strike areas. Only the paying cell differs.
   */
  const b2 = makeUnit('b2', 'fire_1', 'black', { x: 9, y: 6 });
  const lockedTwo = () => authoredPosition({ units: [w1, b1, b2], white: 20, black: 5, clock: 3 });

  it('the only paying cell (6,2) is not toward the nearest enemy but inside a second enemy\'s strike area: it passes', () => {
    const state = withReserves(lockedTwo(), 0, { '6,2': 8 });
    expect(ruleStrikeSquares(state.board, b2).has(key(w1.position))).toBe(false);
    expect(ruleStrikeSquares(state.board, b2).has('6,2')).toBe(true);
    const nearest = (p: Position) => Math.min(dist(p, b1.position), dist(p, b2.position));
    expect(nearest({ x: 6, y: 2 })).toBeGreaterThanOrEqual(nearest(w1.position));
    expect(decide(state)).toEqual({ type: 'END_ACTION_PHASE' });
  });

  it('the only paying cell (2,2) is outside both strike areas (one fact changed): it steps there', () => {
    const state = withReserves(lockedTwo(), 0, { '2,2': 8 });
    expect(ruleStrikeSquares(state.board, b1).has('2,2') || ruleStrikeSquares(state.board, b2).has('2,2')).toBe(false);
    expect(decide(state)).toEqual({ type: 'MOVE', unitId: 'w1', to: { x: 2, y: 2 } });
  });
});

describe('ClockHeist authored positions: where a threatened unit retreats under the lock (W1.12 follow-up)', () => {
  /**
   * White fire_1 at (4,5), four squares from Black's water_1 at (4,9): inside
   * its strike area. The oracle below takes w1's legal MOVEs, keeps those the
   * RULES put out of reach (`ruleStrikeSquares` on the board after the move),
   * and ranks them the way the brief orders a retreat: farthest from the enemy
   * first, then the richest. On an empty-reserve board the farthest safe
   * squares are a set of ties (distance 6); the pair makes a different one of
   * them the only paying square, so a distance-only retreat (the
   * pre-follow-up order, ties broken by the rng) cannot pass both. A third case
   * puts the only paying square one step LESS safe: safety must still win.
   */
  const w1 = makeUnit('w1', 'fire_1', 'white', { x: 4, y: 5 });
  const b1 = makeUnit('b1', 'water_1', 'black', { x: 4, y: 9 });
  const base = () => authoredPosition({ units: [w1, b1], white: 20, black: 5, clock: 3 });

  function safeDestinations(state: GameState): Position[] {
    return legalActions(state, 'white')
      .filter((a): a is Extract<AIAction, { type: 'MOVE' }> => a.type === 'MOVE' && a.unitId === 'w1')
      .map(a => a.to)
      .filter(to => {
        const after: BoardState = { ...state.board, units: state.board.units.map(u => u.id === 'w1' ? { ...u, position: to } : u) };
        return !ruleStrikeSquares(after, b1).has(key(to));
      });
  }

  it('the oracle sees several equally safest squares (the premise of the pair)', () => {
    const safe = safeDestinations(base());
    const far = Math.max(...safe.map(p => dist(p, b1.position)));
    expect(safe.filter(p => dist(p, b1.position) === far).length).toBeGreaterThan(1);
  });

  for (const rich of ['2,5', '6,5']) {
    it(`among the safest squares it takes the only paying one (${rich})`, () => {
      const probe = base();
      const safe = safeDestinations(probe);
      const far = Math.max(...safe.map(p => dist(p, b1.position)));
      expect(safe.some(p => key(p) === rich && dist(p, b1.position) === far)).toBe(true);
      const action = decide(withReserves(probe, 0, { [rich]: 8 }));
      expect(action).toEqual({ type: 'MOVE', unitId: 'w1', to: { x: Number(rich.split(',')[0]), y: Number(rich.split(',')[1]) } });
    });
  }

  it('safety outranks richness: the only paying square one step less safe (4,4) is passed over', () => {
    const state = withReserves(base(), 0, { '4,4': 8 });
    const safe = safeDestinations(state);
    const far = Math.max(...safe.map(p => dist(p, b1.position)));
    expect(safe.some(p => key(p) === '4,4')).toBe(true);
    expect(dist({ x: 4, y: 4 }, b1.position)).toBe(far - 1);
    const action = decide(state);
    expect(action.type).toBe('MOVE');
    if (action.type !== 'MOVE') return;
    expect(dist(action.to, b1.position)).toBe(far);
  });
});

describe('ClockHeist authored positions: free kills', () => {
  /**
   * White fire_1 at (5,5) next to a Black plant_1 at (5,6): fire beats plant
   * (`src/game/elements.ts`), so 2 + 1 = 3 power meets plant_1's full defense
   * 3 — a legal one-hit kill with no damage pre-applied.
   */
  const w1 = makeUnit('w1', 'fire_1', 'white', { x: 5, y: 5 });
  const target = makeUnit('b1', 'plant_1', 'black', { x: 5, y: 6 });
  const kill = { type: 'ATTACK', unitId: 'w1', targetPosition: { x: 5, y: 6 } };

  it('behind: takes the free kill', () => {
    expect(decide(authoredPosition({ units: [w1, target], white: 5, black: 20, clock: 5 }))).toEqual(kill);
  });

  it('level (one fact changed: the lead): declines it -- free kills only while strictly behind', () => {
    expect(decide(authoredPosition({ units: [w1, target], white: 20, black: 20, clock: 5 })).type).not.toBe('ATTACK');
  });

  /**
   * A second Black water_1 (speed 1, next-turn reach 4). At (5,9) it is four
   * squares from the attacker and can walk three and strike; at (9,6) it is
   * five away and cannot. Only its square differs.
   */
  const near = makeUnit('b2', 'water_1', 'black', { x: 5, y: 9 });
  const far = makeUnit('b2', 'water_1', 'black', { x: 9, y: 6 });

  it('a survivor that can strike the attacker next turn vetoes the kill (and the rules agree it can)', () => {
    const state = authoredPosition({ units: [w1, target, near], white: 5, black: 20, clock: 5 });
    const afterKill: BoardState = { ...state.board, units: state.board.units.filter(u => u.id !== 'b1') };
    expect(ruleStrikeSquares(afterKill, near).has(key(w1.position))).toBe(true);
    expect(decide(state).type).not.toBe('ATTACK');
  });

  it('the same survivor one square farther (one fact changed: its square) does not', () => {
    const state = authoredPosition({ units: [w1, target, far], white: 5, black: 20, clock: 5 });
    const afterKill: BoardState = { ...state.board, units: state.board.units.filter(u => u.id !== 'b1') };
    expect(ruleStrikeSquares(afterKill, far).has(key(w1.position))).toBe(false);
    expect(decide(state)).toEqual(kill);
  });

  /**
   * A paid Black arrival acts on Black's next turn, so it counts as a striker.
   * Black's metal_1 (speed 0) at home anchors the spawn and threatens nothing
   * near (5,5); the pending lightning_1 (speed 3, reach 10) six squares away
   * does. Only the pending summon differs.
   */
  const anchor = makeUnit('b3', 'metal_1', 'black', { x: 9, y: 9 });
  const arrival: PendingSummon = { id: 'p1', owner: 'black', definitionId: 'lightning_1', position: { x: 8, y: 8 }, cost: 3 };

  it('without a pending arrival: takes the kill', () => {
    expect(decide(authoredPosition({ units: [w1, target, anchor], white: 5, black: 20, clock: 5 }))).toEqual(kill);
  });

  it('with a paid Black arrival in reach (one fact changed): declines it', () => {
    const state = authoredPosition({ units: [w1, target, anchor], white: 5, black: 20, clock: 5, pending: [arrival] });
    expect(ruleStrikeSquares(state.board, arrival).has(key(w1.position))).toBe(true);
    expect(decide(state).type).not.toBe('ATTACK');
  });
});

describe('ClockHeist authored positions: spawn declogging (W1.12 FINAL)', () => {
  /**
   * W1.12 FINAL (module doc comment): a unit standing on a still-paying cell
   * now steps off it, even without a richness gain, when doing so relieves a
   * clogged spawn rectangle. White fire_1 (speed 2, mining 1) alone at
   * (0,1); its own spawn rectangle is home-to-self (0,0)-(0,1), both
   * occupied -- room 1, at `SPAWN_ROOM_FLOOR`. Reserves are zeroed
   * everywhere except (0,1) itself (paying, current) and (0,3) (paying,
   * reachable in one MOVE, speed 2): the ONLY other fact that could make
   * this bot move at all. Stepping to (0,3) frees (0,1) and widens the
   * rectangle to home-to-(0,3) -- four cells, three empty -- a strict
   * increase in `getAllSpawnPositions`, checked directly below rather than
   * trusted. Black's water_1 sits at its own home corner (9,9), far outside
   * either square's real next-turn reach in the base case; the pair moves
   * it to (0,7), whose reach (`speed * (actions-1) + 1 = 4`) covers (0,3)
   * but not (0,1) -- the ONLY changed fact between the two cases.
   */
  const w1 = makeUnit('w1', 'fire_1', 'white', { x: 0, y: 1 });
  const reserves = { '0,1': 8, '0,3': 8 };

  it('a unit on a still-paying spawn square with a fresh paying cell outward and safe: steps off', () => {
    const b1 = makeUnit('b1', 'water_1', 'black', { x: 9, y: 9 });
    const state = withReserves(authoredPosition({ units: [w1, b1], white: 0, black: 0, clock: 0 }), 0, reserves);
    const before = getAllSpawnPositions('white', state.board).length;
    expect(before).toBeLessThanOrEqual(3); // room is tight: the premise of this pair
    expect(ruleStrikeSquares(state.board, b1).has('0,3')).toBe(false);
    const movedBoard = { ...state.board, units: state.board.units.map(u => u.id === 'w1' ? { ...u, position: { x: 0, y: 3 } } : u) };
    expect(getAllSpawnPositions('white', movedBoard).length, 'the move must provably widen the spawn zone').toBeGreaterThan(before);
    expect(decide(state)).toEqual({ type: 'MOVE', unitId: 'w1', to: { x: 0, y: 3 } });
  });

  it("the same outward cell inside an enemy strike area (one fact changed: the threat's square): it stays", () => {
    const b1 = makeUnit('b1', 'water_1', 'black', { x: 0, y: 7 });
    const state = withReserves(authoredPosition({ units: [w1, b1], white: 0, black: 0, clock: 0 }), 0, reserves);
    expect(ruleStrikeSquares(state.board, b1).has('0,1')).toBe(false); // current cell stays safe -- isolates the destination
    expect(ruleStrikeSquares(state.board, b1).has('0,3')).toBe(true);
    expect(decide(state)).toEqual({ type: 'END_ACTION_PHASE' });
  });

  /**
   * Same pair, replayed through `chooseLocked` (ahead, clock >= 3) instead of
   * the unlocked branch: plan B.1's own words, "units outside every enemy
   * strike area keep mining (they may still step off spawn squares to keep
   * buying room)". `destYield (1) <= miningYieldAt (1)` here (no richness
   * gain: fire_1 mines 1 on both cells), so the pre-existing strictly-fresher
   * branch alone would pass -- this pair is what pins the new fallback under
   * the lock specifically.
   */
  it('the same pair under the lock (ahead, clock >= 3): steps off; unsafe: stays', () => {
    const safe = withReserves(authoredPosition({
      units: [w1, makeUnit('b1', 'water_1', 'black', { x: 9, y: 9 })], white: 20, black: 5, clock: 3,
    }), 0, reserves);
    expect(decide(safe)).toEqual({ type: 'MOVE', unitId: 'w1', to: { x: 0, y: 3 } });

    const unsafe = withReserves(authoredPosition({
      units: [w1, makeUnit('b1', 'water_1', 'black', { x: 0, y: 7 })], white: 20, black: 5, clock: 3,
    }), 0, reserves);
    expect(decide(unsafe)).toEqual({ type: 'END_ACTION_PHASE' });
  });

  /**
   * Isolates the widen PROOF (`wouldOpenSpawnRoom`) from the room-tight gate:
   * a second white unit, w2, sits at (0,4) -- ALSO a candidate anchor whose
   * own rectangle already counts (0,3) as empty (`getAllSpawnPositions` is a
   * union over every own unit). Room is tight (3, at the floor) and (0,3)
   * pays and is safe, so a version of `declogScore` that dropped the widen
   * recount (kept only safety + room-tight) would happily move either unit
   * onto it -- but neither move actually grows the union: w1 moving there
   * (freeing (0,1), a strict SUBSET of w2's existing rectangle) nets zero,
   * and w2 moving there (shrinking its own rectangle toward home) nets
   * negative. A heuristic ("is (0,3) farther from home than my square") would
   * pass both; only the exact recount catches it.
   */
  /**
   * Isolates the `finalScore` bypass in `chooseFrom` (module doc comment): a
   * genuine richness LOSS, not a tie. plant_3 (mining 8) at (0,1), reserve 8
   * (yield 8), steps to (0,2), reserve 1 (yield 1, still positive, still
   * widens the zone -- checked directly). `withPassiveEconomy`'s
   * mining-delta term (`bot-utils.ts`: `delta * 45`) would price this trade
   * at 1 - 8 = -7, i.e. -315 -- well past `declogScore`'s 200-tier -- so a
   * `chooseFrom` that ran every MOVE through it (the whole reason this fix
   * bypasses it for a still-paying unit) would refuse exactly the trade this
   * fix exists to make.
   */
  it('a genuine yield trade-down for room still steps off (bypasses withPassiveEconomy)', () => {
    const heavy = makeUnit('w1', 'plant_3', 'white', { x: 0, y: 1 });
    const b1 = makeUnit('b1', 'water_1', 'black', { x: 9, y: 9 });
    const state = withReserves(authoredPosition({ units: [heavy, b1], white: 0, black: 0, clock: 0 }), 0, { '0,1': 8, '0,2': 1 });
    const before = getAllSpawnPositions('white', state.board).length;
    expect(before).toBeLessThanOrEqual(3);
    const movedBoard = { ...state.board, units: state.board.units.map(u => u.id === 'w1' ? { ...u, position: { x: 0, y: 2 } } : u) };
    expect(getAllSpawnPositions('white', movedBoard).length).toBeGreaterThan(before);
    expect(decide(state)).toEqual({ type: 'MOVE', unitId: 'w1', to: { x: 0, y: 2 } });
  });

  it('a paying, safe, room-tight destination that is already counted via another unit: no move', () => {
    const w2 = makeUnit('w2', 'fire_1', 'white', { x: 0, y: 4 });
    const b1 = makeUnit('b1', 'water_1', 'black', { x: 9, y: 9 });
    const state = withReserves(
      authoredPosition({ units: [w1, w2, b1], white: 0, black: 0, clock: 0 }),
      0, { ...reserves, '0,4': 8 },
    );
    const before = getAllSpawnPositions('white', state.board).length;
    expect(before).toBeLessThanOrEqual(3); // room is tight: the premise
    expect(ruleStrikeSquares(state.board, b1).has('0,3')).toBe(false); // safe: isolates the widen check
    for (const moverId of ['w1', 'w2']) {
      const movedBoard = { ...state.board, units: state.board.units.map(u => u.id === moverId ? { ...u, position: { x: 0, y: 3 } } : u) };
      expect(getAllSpawnPositions('white', movedBoard).length, `${moverId} -> (0,3) must not widen the zone`).toBeLessThanOrEqual(before);
    }
    expect(decide(state)).toEqual({ type: 'END_ACTION_PHASE' });
  });
});

describe('ClockHeist authored positions: decongestion opens Place-phase buy room (W1.12 FINAL)', () => {
  /**
   * Integration case, driving the bot's OWN decisions across a full Action
   * phase into the Place phase: the initial position's three starting units
   * (`getStartingPositions`) plus a fourth exactly at the home corner clog
   * even the sole square the bare initial position leaves open (module doc
   * comment: "reduce the spawn zone to exactly one square, (0,0)"), so
   * `getAllSpawnPositions` starts at zero -- no legal BUY_UNIT exists yet.
   * Against the pre-W1.12-FINAL bot (18669c3b) no unit ever steps off a
   * paying cell for room alone, so this position's spawn zone stays empty
   * into the Place phase and the loop below would end in END_PLACE_PHASE,
   * never BUY_UNIT -- this is the review's own headline failure, reproduced
   * directly rather than asserted.
   */
  it('from a fully clogged spawn rectangle, the bot declogs and then buys a tier-1 miner', () => {
    const start = createInitialGameState(undefined, 4, 0, 'phasing').board.units.filter(u => u.owner === 'white');
    const filler = makeUnit('w4', 'fire_1', 'white', { x: 0, y: 0 });
    const threat = makeUnit('b1', 'water_1', 'black', { x: 9, y: 9 }); // its own corner: far from every candidate square
    let state = authoredPosition({ units: [...start, filler, threat], white: 0, black: 0, clock: 0, whiteBank: 10 });
    expect(getAllSpawnPositions('white', state.board)).toEqual([]);

    let guard = 0;
    while (state.turn.phase === 'action' || state.upkeepPending) {
      expect(guard++, 'the Action phase did not end within a bounded number of decisions').toBeLessThan(20);
      const bot = createBot('ClockHeist');
      if (bot.kind !== 'scripted') throw new Error('ClockHeist must be a scripted bot');
      const view = buildView(state, 'white');
      const legal = legalActions(state, 'white');
      const action = bot.chooseAction({ view, legal, rng: mulberry32(1) });
      if (!action) break;
      const next = applyAction(state, action);
      expect(next, `${JSON.stringify(action)} was rejected as illegal`).not.toBe(state);
      state = next;
    }
    expect(state.turn.phase).toBe('place');
    expect(state.turn.currentPlayer).toBe('white');
    expect(getAllSpawnPositions('white', state.board).length, 'declogging must have opened at least one buy square').toBeGreaterThan(0);

    const action = decide(state);
    expect(action.type).toBe('BUY_UNIT');
    if (action.type !== 'BUY_UNIT') return;
    const def = getUnitDefinition(action.definitionId);
    expect(def.tier).toBe(1);
    expect(def.mining).toBeGreaterThan(0);
  });
});

describe('ClockHeist authored positions: W1.12 re-review regressions (9fdf6b95 reverted)', () => {
  /**
   * The rework round's `chooseDefensiveKill` killed a raider even while
   * ClockHeist was ahead and locked, resetting a clock it was winning (module
   * doc comment, "W1.12 FIX ROUND, REVERTED ON RE-REVIEW"). Plan B.1 and the
   * W1.12 acceptance say ahead at clock >= 3 means retreat or pass. Here the
   * clock stands at 9, one short of INACTIVITY_LIMIT (`src/game/inactivity.ts`),
   * White leads 40-5, a Black fire_1 stands beside White's plant_1 (fire beats
   * plant: 2 + 1 = 3 meets defense 3), and White's water_1 could kill it
   * (water beats fire). A distant Black metal_1 keeps the kill from being an
   * elimination. The pair changes one fact, the lead.
   */
  const units = [
    makeUnit('w1', 'plant_1', 'white', { x: 5, y: 5 }),
    makeUnit('w2', 'water_1', 'white', { x: 6, y: 6 }),
    makeUnit('b1', 'fire_1', 'black', { x: 5, y: 6 }),
    makeUnit('b9', 'metal_1', 'black', { x: 9, y: 9 }),
  ];

  /** Let ClockHeist play White's whole turn from `state`, one decision at a
   * time, and return the position after it. */
  function playWhiteTurn(state: GameState): GameState {
    const bot = createBot('ClockHeist');
    if (bot.kind !== 'scripted') throw new Error('ClockHeist must be a scripted bot');
    let s = state;
    for (let i = 0; s.phase === 'playing' && s.turn.currentPlayer === 'white'; i++) {
      expect(i, 'White\'s turn did not end within a bounded number of decisions').toBeLessThan(30);
      const action = bot.chooseAction({ view: buildView(s, 'white'), legal: legalActions(s, 'white'), rng: mulberry32(1) });
      if (!action) throw new Error('ClockHeist returned no action');
      const next = applyAction(s, action);
      expect(next, `${JSON.stringify(action)} was rejected as illegal`).not.toBe(s);
      s = next;
    }
    return s;
  }

  it('ahead on the last kill-free ply: retreats or passes, and its own turn wins on the kill clock', () => {
    const state = authoredPosition({ units, white: 40, black: 5, clock: 9 });
    expect(legalActions(state, 'white')).toContainEqual({ type: 'ATTACK', unitId: 'w2', targetPosition: { x: 5, y: 6 } });
    expect(['MOVE', 'END_ACTION_PHASE']).toContain(decide(state).type);
    const after = playWhiteTurn(state);
    expect(after.phase).toBe('victory');
    expect(after.winner).toBe('white');
    expect(after.victoryReason).toBe('kill-clock');
  });

  it('behind (one fact changed: the lead): takes the free kill', () => {
    const state = authoredPosition({ units, white: 5, black: 40, clock: 9 });
    expect(decide(state)).toEqual({ type: 'ATTACK', unitId: 'w2', targetPosition: { x: 5, y: 6 } });
  });

  /**
   * The rework round's blocker-aware reach (`getMovementRange`, the same
   * computation as `ruleStrikeSquares`) treated ClockHeist's own pieces as
   * walls. A lethal hit unlocks another attack (`src/game/combat.ts
   * canAttack`), so a raider can kill the piece in its way and walk through.
   * White is behind; its fire_1 on (5,5) can kill the Black plant_1 on (5,6).
   * The Black water_1 on (5,8) stands behind White's fire_1 on (5,7); every
   * detour to a square beside (5,5) is longer than its three moves, so
   * blocker-aware reach calls the attacker safe. The rules do not: the test
   * plays Black's four-action line and the attacker dies. `enemyReach`
   * (speed 1 x 3 + 1 = 4 >= Manhattan 3) vetoes the kill.
   */
  it('a survivor that can kill its way through one of our pieces vetoes the free kill', () => {
    const cleaveUnits = [
      makeUnit('A', 'fire_1', 'white', { x: 5, y: 5 }),
      makeUnit('X', 'fire_1', 'white', { x: 5, y: 7 }),
      makeUnit('T', 'plant_1', 'black', { x: 5, y: 6 }),
      makeUnit('S', 'water_1', 'black', { x: 5, y: 8 }),
    ];
    const state = authoredPosition({ units: cleaveUnits, white: 5, black: 20, clock: 5 });
    const takeKill = { type: 'ATTACK', unitId: 'A', targetPosition: { x: 5, y: 6 } } as const;
    expect(legalActions(state, 'white')).toContainEqual(takeKill);
    // Blocker-aware reach misses the threat ...
    const afterKillBoard: BoardState = { ...state.board, units: state.board.units.filter(u => u.id !== 'T') };
    expect(ruleStrikeSquares(afterKillBoard, cleaveUnits[3]).has('5,5')).toBe(false);
    // ... but the rules let Black kill the attacker next turn.
    let s = applyAction(state, takeKill);
    for (let i = 0; s.turn.currentPlayer === 'white'; i++) {
      expect(i).toBeLessThan(10);
      const legal = legalActions(s, 'white');
      s = applyAction(s, legal.find(a => a.type === 'END_ACTION_PHASE') ?? legal.find(a => a.type === 'END_PLACE_PHASE') ?? legal[0]);
    }
    const line: AIAction[] = [
      { type: 'ATTACK', unitId: 'S', targetPosition: { x: 5, y: 7 } },
      { type: 'MOVE', unitId: 'S', to: { x: 5, y: 7 } },
      { type: 'MOVE', unitId: 'S', to: { x: 5, y: 6 } },
      { type: 'ATTACK', unitId: 'S', targetPosition: { x: 5, y: 5 } },
    ];
    for (const a of line) {
      expect(legalActions(s, 'black'), JSON.stringify(a)).toContainEqual(a);
      s = applyAction(s, a);
    }
    expect(s.board.units.some(u => u.id === 'A')).toBe(false);
    // So ClockHeist declines the kill.
    expect(decide(state).type).not.toBe('ATTACK');
  });
});
