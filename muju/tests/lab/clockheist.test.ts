// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createBot, botNames } from '../../lab/harness/bots/index';
import { playGame, buildView } from '../../lab/harness/runner';
import { legalActions } from '../../lab/harness/legal';
import { mulberry32 } from '../../lab/harness/rng';
import { createInitialGameState } from '../../src/game/board';
import type { GameState, PlayerId, Unit, Position } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import type { GameRecord } from '../../lab/harness/types';
import { resolveEngine } from '../../lab/hard-ai/ladder/engines';

/**
 * ClockHeist (STRATEGOS W1.12: `~/.claude/plans/can-you-respond-to-piped-book.md`
 * Part B.1). Two kinds of coverage, per the plan's testing philosophy (Part A
 * item 6: paired positions that differ in one fact must flip the decision) and
 * the plan's own list for this step:
 *
 *   - Harness-level: legal over seeded games against Random and against a
 *     small-work Hard, deterministic given its rng, and registered on the
 *     ladder under its own name.
 *   - Authored positions, in two flipped pairs, each changing exactly one
 *     fact: (1) ahead vs behind at the SAME clock value 3, to show the
 *     retreat-and-pass posture needs BOTH "ahead" and "clock >= 3", not clock
 *     alone; and (2) one surviving threatening enemy present vs absent, to
 *     show the free-kill safety veto ("not left inside an enemy strike area")
 *     actually depends on every survivor, not just the unit being killed.
 *
 * "Hard-25k" is this tree's nearest equivalent to the plan's "Hard-25k" note
 * (a low, fixed-work Hard preset already registered as `Hard-25k` in
 * `lab/harness/bots/index.ts` -- fixed work is deterministic and machine
 * independent, unlike a wall-clock preset).
 */

// ---------- harness-level: legality, determinism, registry ----------

async function run(white: string, black: string, seed: number, maxTurns = 60): Promise<GameRecord> {
  const { record } = await playGame({
    bots: { white: createBot(white), black: createBot(black) },
    seed,
    engineHash: 'test',
    runId: 'test',
    options: { recordReplay: false, maxTurns },
  });
  return record;
}

describe('ClockHeist', () => {
  it('is registered and its name does not match the AntiRush/Guard upkeep-order regex', () => {
    expect(botNames()).toContain('ClockHeist');
    // lab/harness/runner.ts: a name matching this pattern gets upkeep resolved
    // home-unit-first instead of ClockHeist's ordinary cost-descending order
    // (see clockheist.ts's header for what the grep found and why it matters).
    expect(/AntiRush|Guard/.test('ClockHeist')).toBe(false);
  });

  it('plays only legal actions over several seeded games against Random', async () => {
    for (const seed of [4001, 4002, 4003]) {
      const record = await run('ClockHeist', 'Random', seed);
      expect(record.invariantViolation, `seed ${seed}`).toBeNull();
      expect(record.winType, `seed ${seed}`).not.toBe('invariant-violation');
      expect(record.players.white.illegalActions, `seed ${seed}: ClockHeist cannot cheat`).toBe(0);
      expect(record.players.black.illegalActions, `seed ${seed}`).toBe(0);
      expect(record.turns).toBeGreaterThan(0);
    }
    for (const seed of [4004, 4005]) {
      // ClockHeist as Black too -- its posture logic reads `view.player`, not
      // a hard-coded seat, so this catches a white-only assumption.
      const record = await run('Random', 'ClockHeist', seed);
      expect(record.invariantViolation, `seed ${seed}`).toBeNull();
      expect(record.players.black.illegalActions, `seed ${seed}`).toBe(0);
    }
  }, 60000); // explicit per-test budget, matching tests/lab/harness.test.ts's convention

  it('plays only legal actions over seeded games against a small-work Hard (Hard-25k)', async () => {
    for (const seed of [4101, 4102]) {
      const record = await run('ClockHeist', 'Hard-25k', seed, 40);
      expect(record.invariantViolation, `seed ${seed}`).toBeNull();
      expect(record.players.white.illegalActions, `seed ${seed}`).toBe(0);
      // Hard-25k is a REPLICA search: a divergence from the canonical engine
      // is counted as an anomaly, not applied as an illegal action, so this is
      // the field to check on that side (`lab/hard-ai/bots/hard.ts`).
      expect(record.anomalies, `seed ${seed}`).toEqual([]);
    }
  }, 60000); // explicit per-test budget: two full games at a small fixed-work Hard

  it('is deterministic per seed: same rng, same game', async () => {
    const a = await run('ClockHeist', 'Rush', 909090);
    const b = await run('ClockHeist', 'Rush', 909090);
    expect(a.winner).toBe(b.winner);
    expect(a.winType).toBe(b.winType);
    expect(a.turns).toBe(b.turns);
    expect(a.plies).toBe(b.plies);
    expect(a.players.white.unitsKilled).toBe(b.players.white.unitsKilled);
    expect(a.materialCurve).toEqual(b.materialCurve);
  }, 30000); // explicit per-test budget; see the E0.5 timeout note in tests/lab/harness.test.ts

  it('resolves on the ladder registry under its own name', () => {
    const engine = resolveEngine('ClockHeist');
    expect(engine.name).toBe('ClockHeist');
    const bot = engine.createBot({ mode: 'fixed', units: 0 });
    expect(bot.kind).toBe('scripted');
    expect(bot.name).toBe('ClockHeist');
  });
});

// ---------- authored positions ----------

function makeUnit(id: string, definitionId: string, owner: PlayerId, position: Position, damageTaken = 0): Unit {
  return {
    id, definitionId, owner, position,
    hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken, lastAttackKilled: false,
  };
}

/** A minimal, otherwise-legal mid-turn Phasing position: White to move, full
 * action budget, no upkeep pending. `units` and every other field the
 * scenario cares about are supplied by the caller; everything else comes from
 * a fresh initial state so cells/handicap/actionsPerTurn stay production
 * defaults. */
function authoredPosition(units: Unit[], white: { gained: number }, black: { gained: number }, inactivityPlies: number): GameState {
  const base = createInitialGameState(undefined, 4, 0, 'phasing');
  return {
    ...base,
    phase: 'playing',
    upkeepPending: false,
    inactivityPlies,
    progressThisTurn: false,
    turn: { currentPlayer: 'white', phase: 'action', actionsRemaining: 4, turnNumber: 9 },
    board: { ...base.board, units },
    players: {
      white: { ...base.players.white, resourcesGained: white.gained },
      black: { ...base.players.black, resourcesGained: black.gained },
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

describe('ClockHeist authored positions', () => {
  /**
   * Pair 1 (flips ONE fact: which side is ahead on mined total). Same board
   * both times -- White's fire_1 adjacent to a Black water_1 already damaged
   * down to 0 effective defense (`calculateDefense = base - damageTaken`), so
   * the attack is legal AND a guaranteed free kill with no other survivor to
   * make it unsafe. Clock is fixed at exactly the RETREAT_CLOCK threshold (3)
   * in both cases, so clock value alone cannot explain a difference.
   */
  const w1 = makeUnit('w1', 'fire_1', 'white', { x: 5, y: 5 });
  const b1Killable = makeUnit('b1', 'water_1', 'black', { x: 5, y: 6 }, 2); // base defense 2, damageTaken 2 -> defense 0

  it('ahead at clock >= 3: does not take the free kill (retreats or passes)', () => {
    const state = authoredPosition([w1, b1Killable], { gained: 20 }, { gained: 5 }, 3);
    const action = decide(state);
    expect(action.type).not.toBe('ATTACK');
    expect(action.type).not.toBe('BUY_UNIT');
    expect(action.type).not.toBe('PROMOTE_UNIT');
    if (action.type === 'MOVE') {
      // A genuine retreat: strictly farther from the one threat than
      // ClockHeist's own `speed + 1` safety margin (water_1 speed 1 -> reach 2).
      const dist = Math.abs(action.to.x - b1Killable.position.x) + Math.abs(action.to.y - b1Killable.position.y);
      expect(dist).toBeGreaterThan(2);
    } else {
      expect(action.type).toBe('END_ACTION_PHASE');
    }
  });

  it('behind at the SAME clock (3): takes the free kill instead of retreating', () => {
    const state = authoredPosition([w1, b1Killable], { gained: 5 }, { gained: 20 }, 3);
    const action = decide(state);
    expect(action).toEqual({ type: 'ATTACK', unitId: 'w1', targetPosition: { x: 5, y: 6 } });
  });

  /**
   * Pair 2 (flips ONE fact: a second, undamaged enemy is in range of the
   * attacker's square). Both positions are behind on mined total, so the
   * plain "take the free kill" rule applies in both -- only the strike-area
   * safety clause can be doing the work when the second case declines.
   */
  const isolatedTarget = makeUnit('b1', 'water_1', 'black', { x: 6, y: 5 }, 2); // defense 0, adjacent, only enemy
  const secondThreat = makeUnit('b2', 'water_1', 'black', { x: 7, y: 5 }); // full health, NOT adjacent (can't itself be attacked), but within speed(1)+1 of w1's square

  it('behind, only enemy: takes the free kill (no survivor left to punish it)', () => {
    const state = authoredPosition([w1, isolatedTarget], { gained: 5 }, { gained: 20 }, 5);
    const action = decide(state);
    expect(action).toEqual({ type: 'ATTACK', unitId: 'w1', targetPosition: { x: 6, y: 5 } });
  });

  it('behind, a second survivor in range: declines the very same free kill', () => {
    const state = authoredPosition([w1, isolatedTarget, secondThreat], { gained: 5 }, { gained: 20 }, 5);
    const action = decide(state);
    expect(action.type).not.toBe('ATTACK');
  });
});
