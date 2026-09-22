// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, it, expect } from 'vitest';
import { AIEngineV2, presetConfigFor, scaleConfigForBudget, type AIEngineConfig } from '../../src/ai/engine-v2';
import { AI_PACES, aiTurnBudgetMs } from '../../src/ai/turnTime';
import { createSearchHandler } from '../../src/ai/worker/handler';
import { AI_PROTOCOL, type SearchRequest } from '../../src/ai/worker/protocol';
import { createInitialGameState } from '../../src/game/board';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import type { AIDifficulty } from '../../src/ai/types';

/**
 * The paces of `src/ai/turnTime.ts` only mean something if the search actually
 * spends what they fund. These pin the scaling rule itself (pure, monotonic,
 * identity at `quick`, difficulty-preserving, invisible to the fixed-work lab
 * path) and then one real easy search, to prove a longer allowance buys real
 * work rather than a longer wait.
 */
const DIFFICULTIES: AIDifficulty[] = ['easy', 'medium', 'hard'];
let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });

it('leaves the quick allowance exactly as the preset had it', () => {
  for (const difficulty of DIFFICULTIES) {
    const preset = presetConfigFor(difficulty);
    expect(scaleConfigForBudget(preset, difficulty, aiTurnBudgetMs(difficulty, 'quick'))).toEqual(preset);
    // A mid-turn re-request asks for what the turn has LEFT, which is less
    // than the allowance; the preset is a floor, never scaled down.
    expect(scaleConfigForBudget(preset, difficulty, 1)).toEqual(preset);
    expect(scaleConfigForBudget(preset, difficulty, Infinity)).toEqual(preset);
  }
});

it('raises the search clock, the iteration cap and the tactical nodes with the budget, monotonically', () => {
  for (const difficulty of DIFFICULTIES) {
    const preset = presetConfigFor(difficulty);
    let previous = preset;
    for (let budgetMs = 500; budgetMs <= 60000; budgetMs += 500) {
      const scaled = scaleConfigForBudget(preset, difficulty, budgetMs);
      expect(scaled.mctsTimeLimit).toBeGreaterThanOrEqual(previous.mctsTimeLimit);
      expect(scaled.mctsIterations).toBeGreaterThanOrEqual(previous.mctsIterations);
      expect(scaled.tacticalNodes).toBeGreaterThanOrEqual(previous.tacticalNodes);
      previous = scaled;
    }
    // Every pace above quick buys strictly more of each.
    const quick = scaleConfigForBudget(preset, difficulty, aiTurnBudgetMs(difficulty, 'quick'));
    const deep = scaleConfigForBudget(preset, difficulty, aiTurnBudgetMs(difficulty, 'deep'));
    expect(deep.mctsTimeLimit).toBeGreaterThan(quick.mctsTimeLimit);
    expect(deep.mctsIterations).toBeGreaterThan(quick.mctsIterations);
    expect(deep.tacticalNodes).toBeGreaterThan(quick.tacticalNodes);
  }
});

it('spends most of every pace on the search and still leaves a dispatch margin', () => {
  for (const difficulty of DIFFICULTIES) {
    const preset = presetConfigFor(difficulty);
    for (const pace of AI_PACES) {
      const budgetMs = aiTurnBudgetMs(difficulty, pace);
      const scaled = scaleConfigForBudget(preset, difficulty, budgetMs);
      expect(scaled.mctsTimeLimit).toBeLessThan(budgetMs);
      // Above quick the search gets at least three quarters of the clock —
      // including the hard preset, whose own limit is a third of its quick
      // allowance because the hard engine normally owns that seat.
      if (pace !== 'quick') expect(scaled.mctsTimeLimit).toBeGreaterThanOrEqual(budgetMs * 0.75);
    }
  }
});

it('scales WORK only: difficulty keeps its own depth, beam and plan count', () => {
  for (const difficulty of DIFFICULTIES) {
    const preset = presetConfigFor(difficulty);
    for (const budgetMs of [1000, 3000, 10000, 30000, 60000]) {
      const scaled = scaleConfigForBudget(preset, difficulty, budgetMs);
      expect(scaled.tacticalDepth).toBe(preset.tacticalDepth);
      expect(scaled.beamWidth).toBe(preset.beamWidth);
      expect(scaled.outputPlans).toBe(preset.outputPlans);
      expect(scaled.progressiveWideningAlpha).toBe(preset.progressiveWideningAlpha);
      expect(scaled.fixedWork).toBe(preset.fixedWork);
    }
    // Easy at `deep` stays an Easy: it never reaches Medium's understanding.
    const easyDeep = scaleConfigForBudget(presetConfigFor('easy'), 'easy', aiTurnBudgetMs('easy', 'deep'));
    expect(easyDeep.tacticalDepth).toBe(presetConfigFor('easy').tacticalDepth);
    expect(easyDeep.tacticalDepth).toBeLessThan(presetConfigFor('medium').tacticalDepth);
  }
});

it('never touches a fixed-work configuration, whatever budget is offered', () => {
  for (const difficulty of DIFFICULTIES) {
    const fixed: AIEngineConfig = { ...presetConfigFor(difficulty), fixedWork: 5000 };
    for (const budgetMs of [1, 1000, 30000, 60000, Infinity]) {
      expect(scaleConfigForBudget(fixed, difficulty, budgetMs)).toBe(fixed);
    }
  }
});

it('leaves a caller that never opted in on the preset, whatever wall budget it passes', async () => {
  // `lab/ai/run.ts`'s `ai:tactics` and the ladder's per-decision `wall:` rungs
  // hand `findBestAction` a wall budget without asking for scaling, and their
  // searches must be the ones they always were.
  expect(presetConfigFor('easy').scaleToBudget).toBe(false);
  const engine = new AIEngineV2('easy');
  engine.setSeed(831); engine.setTacticalSolver(solver);
  const result = await engine.findBestAction(createInitialGameState(undefined, 4, 0, 'phasing'), 30000);
  expect(result.debug!.config).toEqual(presetConfigFor('easy'));
  expect(result.timeMs).toBeLessThan(aiTurnBudgetMs('easy', 'quick'));
});

it('is pure: the configuration handed in is never mutated', () => {
  const preset = presetConfigFor('easy');
  const before = { ...preset };
  scaleConfigForBudget(preset, 'easy', 60000);
  expect(preset).toEqual(before);
});

/**
 * The real thing: an easy seat given more of the clock must SEARCH longer and
 * do more work, not return at the same moment. Quick (1 s) against normal
 * (3 s) keeps the test to a few seconds; `deep` is the same arithmetic further
 * along the same line, pinned above.
 */
it('makes an easy search genuinely use a longer allowance', { timeout: 30_000 }, async () => {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  const run = async (budgetMs: number) => {
    const engine = new AIEngineV2('easy');
    engine.setSeed(831); engine.setTacticalSolver(solver); engine.setConfig({ scaleToBudget: true });
    return engine.findBestAction(state, budgetMs);
  };
  const quick = await run(aiTurnBudgetMs('easy', 'quick'));
  const normal = await run(aiTurnBudgetMs('easy', 'normal'));

  expect(quick.stats?.stopReason).toBe('deadline');
  expect(normal.stats?.stopReason).toBe('deadline');
  // It thinks for the longer clock ...
  expect(normal.timeMs).toBeGreaterThan(quick.timeMs * 1.5);
  // ... and inside the allowance, with room left to dispatch what it found.
  expect(normal.timeMs).toBeLessThan(aiTurnBudgetMs('easy', 'normal'));
  // ... and spends it on candidates, not on waiting.
  expect(normal.stats!.simulations).toBeGreaterThan(quick.stats!.simulations * 1.5);
  expect(normal.debug!.config.mctsIterations).toBeGreaterThan(quick.debug!.config.mctsIterations);
});

it('scales a v2 whole-turn request and leaves a per-action request on the preset', async () => {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  const base: SearchRequest = { version: AI_PROTOCOL, type: 'search', gameId: 'scaling', requestId: 1, revision: 0,
    player: 'white', state, difficulty: 'easy', seed: 831, decisionMs: 1200 };
  const handler = createSearchHandler(solver);
  const preset = presetConfigFor('easy');

  // `mode: 'turn'`'s `decisionMs` IS the turn's remaining allowance, so the
  // search sizes itself to it (1200 ms > easy's 1000 ms quick allowance).
  const turn = await handler({ ...base, mode: 'turn' });
  expect(turn.type).toBe('result'); if (turn.type !== 'result') return;
  expect(turn.result.debug!.config.mctsTimeLimit)
    .toBe(scaleConfigForBudget(preset, 'easy', 1200).mctsTimeLimit);

  // An `action` request carries a per-decision SHARE of that allowance and
  // stays the protocol-2 search it always was.
  const action = await handler({ ...base, requestId: 2 });
  expect(action.type).toBe('result'); if (action.type !== 'result') return;
  expect(action.result.debug!.config.mctsTimeLimit).toBe(preset.mctsTimeLimit);

  // Fixed work is the seeded lab path: it is never scaled, in either mode.
  const fixed = await handler({ ...base, requestId: 3, mode: 'turn', fixedWork: 5000 });
  expect(fixed.type).toBe('result'); if (fixed.type !== 'result') return;
  expect(fixed.result.debug!.config.mctsTimeLimit).toBe(preset.mctsTimeLimit);
  expect(fixed.result.debug!.config.tacticalNodes).toBe(preset.tacticalNodes);
});
