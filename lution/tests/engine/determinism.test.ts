import { describe, it, expect } from 'vitest';
import { createInnerGame, runInnerGame } from '../../src/engine/engine';
import { loadAllEffects } from '../../src/engine/effectsLoader';
import { createDefaultControllers } from '../../src/ai/player';
import { createRng } from '../../src/engine/rng';
import cardsJson from '../../data/cards.json';
import type { CardDef, CardId, PlayerId } from '../../shared/types';

function buildRuntimeInputs(seed: number) {
  const registryList = cardsJson as CardDef[];
  const registry = new Map<CardId, CardDef>(registryList.map((c) => [c.id, c]));
  const effects = loadAllEffects();
  const decks: Record<PlayerId, CardId[]> = {
    human: registryList.filter((c) => c.startingOwner === 'human').map((c) => c.id),
    claude: registryList.filter((c) => c.startingOwner === 'claude').map((c) => c.id),
  };
  const controllers = createDefaultControllers(effects, {
    human: createRng(seed + 1),
    claude: createRng(seed + 2),
  });
  return { registry, effects, decks, controllers };
}

async function runWithSeed(seed: number) {
  const { registry, effects, decks, controllers } = buildRuntimeInputs(seed);
  const runtime = createInnerGame({
    registry,
    effects,
    decks,
    seed,
    firstPlayer: 'human',
    choiceResponders: { human: controllers.human.choiceResponder, claude: controllers.claude.choiceResponder },
  });
  await runInnerGame(runtime, controllers);
  return runtime.state;
}

describe('seeded determinism', () => {
  it('the same seed produces an identical event log and result across independent runs', async () => {
    const a = await runWithSeed(424242);
    const b = await runWithSeed(424242);

    expect(a.result).toEqual(b.result);
    expect(a.log).toEqual(b.log);
    expect(a.turnNumber).toBe(b.turnNumber);
  });

  it('different seeds are not guaranteed identical (sanity check the harness actually varies)', async () => {
    const a = await runWithSeed(1);
    const b = await runWithSeed(2);
    // Not a strict correctness requirement, but if this ever flakes false it
    // means the RNG isn't actually seed-sensitive, which would be a real bug.
    expect(a.log).not.toEqual(b.log);
  });
});
