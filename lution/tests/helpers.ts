// Test harness: builds an InnerGameRuntime with EXACT (unshuffled) deck and
// hand contents plus scripted ChoiceResponders, so engine/AI tests can set
// up precise scenarios without fighting the RNG.
//
// Shuffling behavior: decks are shuffled (real, seed-derived randomness)
// UNLESS the caller supplies an explicit `decks` and/or `hands` override, in
// which case the exact given order/contents are used verbatim — that's the
// whole point of passing them. Callers that want realistic seeded games
// (e.g. determinism or full-match bound tests) simply omit `decks`/`hands`.

import cardsJson from '../data/cards.json';
import type { CardDef, CardId, InnerGameResult, InnerGameState, PlayerId } from '../shared/types';
import {
  checkCheckpoint,
  createInnerGame,
  resolvePlay,
  runTurn as engineRunTurn,
  WIN_POINTS,
  type InnerGameRuntime,
  type ResolvePlayResult,
  type RunTurnOptions,
} from '../src/engine/engine';
import { loadEffects, registerEffects } from '../src/engine/effectsLoader';
import type { CardEffect, ChoiceOption, ChoiceResponder, EngineAPI, PlayerController } from '../src/engine/types';
import { chooseCardToPlay } from '../src/ai/player';

export interface CreateTestGameParams {
  decks?: Partial<Record<PlayerId, CardId[]>>;
  hands?: Partial<Record<PlayerId, CardId[]>>;
  seed?: number;
  firstPlayer?: PlayerId;
  winPoints?: number;
  // Scripted answers to requestChoice, consumed in order (FIFO). Falls back
  // to the first offered option once the queue is empty.
  choices?: Partial<Record<PlayerId, ChoiceOption[]>>;
  // Synthetic cards for scenarios the real registry/effects can't express
  // (e.g. a card engineered to force a simultaneous-10 checkpoint).
  extraRegistry?: CardDef[];
  extraEffects?: CardEffect[];
  // Non-blocking-implement-job feature: passed straight through to
  // createInnerGame so locked-card tests don't need to hand-build a runtime.
  isLocked?: (cardId: CardId) => boolean;
}

export interface TestGameHandle {
  runtime: InnerGameRuntime;
  api: EngineAPI;
  registry: ReadonlyMap<CardId, CardDef>;
  effects: ReadonlyMap<CardId, CardEffect>;
  controllers: Record<PlayerId, PlayerController>;
  state: () => InnerGameState;
  // Plays the named card from the CURRENT active player's hand.
  play: (cardId: CardId) => Promise<ResolvePlayResult>;
  score: (player: PlayerId) => Promise<number>;
  runTurn: (options?: RunTurnOptions) => Promise<void>;
  checkpoint: () => Promise<InnerGameResult | null>;
}

// --- Small synthetic-card factories, shared across tests/engine and
// tests/ai suites, for scenarios the real registry/starter effects can't
// express (cancellation, interrupts, forced simultaneous-10, hook ordering,
// etc). Kept minimal on purpose — tests fill in only what they need via
// `overrides`.
export function testCardDef(id: CardId, overrides: Partial<CardDef> = {}): CardDef {
  return {
    id,
    name: id,
    effectText: 'Test-only card.',
    creatorId: 'starter',
    createdInRound: 0,
    destroyed: false,
    implemented: true,
    ...overrides,
  };
}

export function testKeeperEffect(
  id: CardId,
  baseValue: number,
  overrides: Partial<CardEffect> = {}
): CardEffect {
  return {
    cardId: id,
    cardType: 'keeper',
    baseValue,
    ...overrides,
  };
}

export function testActionEffect(id: CardId, overrides: Partial<CardEffect> = {}): CardEffect {
  return {
    cardId: id,
    cardType: 'action',
    baseValue: 0,
    ...overrides,
  };
}

function makeScriptedResponder(queue: ChoiceOption[]): ChoiceResponder {
  return (spec) => {
    if (queue.length > 0) {
      return queue.shift() as ChoiceOption;
    }
    if (spec.options.length === 0) {
      throw new Error(`scripted responder: no options offered for card "${spec.cardId}" and script is empty`);
    }
    return spec.options[0];
  };
}

export function createTestGame(params: CreateTestGameParams = {}): TestGameHandle {
  const registryList: CardDef[] = [...(cardsJson as CardDef[]), ...(params.extraRegistry ?? [])];
  const registry = new Map<CardId, CardDef>(registryList.map((c) => [c.id, c]));

  // loadEffects (not loadAllEffects): so extraRegistry rows carrying a
  // `composition` (M2) auto-compile with no extraEffects entry needed --
  // bespoke src/effects/*.ts modules still win precedence exactly as before.
  const effects = loadEffects(registryList);
  if (params.extraEffects?.length) {
    for (const [id, effect] of registerEffects(params.extraEffects)) {
      effects.set(id, effect);
    }
  }

  const starterDeck = (player: PlayerId): CardId[] =>
    registryList.filter((c) => c.startingOwner === player).map((c) => c.id);

  const decks: Record<PlayerId, CardId[]> = {
    human: params.decks?.human ?? starterDeck('human'),
    claude: params.decks?.claude ?? starterDeck('claude'),
  };

  const exact = params.decks !== undefined || params.hands !== undefined;

  const choiceQueues: Record<PlayerId, ChoiceOption[]> = {
    human: [...(params.choices?.human ?? [])],
    claude: [...(params.choices?.claude ?? [])],
  };
  const choiceResponders: Record<PlayerId, ChoiceResponder> = {
    human: makeScriptedResponder(choiceQueues.human),
    claude: makeScriptedResponder(choiceQueues.claude),
  };

  const seed = params.seed ?? 1;
  const firstPlayer = params.firstPlayer ?? 'human';
  const winPoints = params.winPoints ?? WIN_POINTS;

  const runtime = createInnerGame({
    registry,
    effects,
    decks,
    seed,
    firstPlayer,
    choiceResponders,
    winPoints,
    hands: params.hands,
    shuffleDecks: !exact,
    isLocked: params.isLocked,
  });

  const controllers: Record<PlayerId, PlayerController> = {
    human: {
      chooseCardToPlay: (view) => chooseCardToPlay(view, effects, winPoints),
      choiceResponder: choiceResponders.human,
    },
    claude: {
      chooseCardToPlay: (view) => chooseCardToPlay(view, effects, winPoints),
      choiceResponder: choiceResponders.claude,
    },
  };

  return {
    runtime,
    api: runtime.api,
    registry,
    effects,
    controllers,
    state: () => runtime.state,
    play: (cardId: CardId) => {
      const activePlayer = runtime.state.activePlayer;
      const instance = runtime.state.players[activePlayer].hand.find((i) => i.cardId === cardId);
      if (!instance) {
        throw new Error(`createTestGame.play: "${cardId}" not found in ${activePlayer}'s hand`);
      }
      return resolvePlay(runtime, activePlayer, instance.instanceId);
    },
    score: (player: PlayerId) => runtime.api.score(player),
    runTurn: (options?: RunTurnOptions) => engineRunTurn(runtime, controllers, options),
    checkpoint: () => checkCheckpoint(runtime),
  };
}
