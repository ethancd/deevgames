// The async inner-game turn loop: onTurnStart -> draw phase -> CHECKPOINT ->
// interruptOpponentTurn dispatch -> play phase -> CHECKPOINT -> onTurnEnd ->
// swap. Scoring is never cached — it's recomputed from scratch (via
// EngineAPI.score) at every checkpoint. Win checkpoints are evaluated only
// after each atomic step; both scores read together (both >= WIN_POINTS ->
// draw; exactly one -> winner).
//
// WIN_POINTS is a real (configurable) constant, not a stub — other modules
// (src/ai/player.ts, src/engine/match.ts) reference it as a default
// parameter value.

import type {
  CardDef,
  CardId,
  CardInstance,
  InnerGameResult,
  InnerGameState,
  PlayerId,
  PlayerState,
} from '../../shared/types';
import type {
  AIGameView,
  CardEffect,
  ChoiceResponder,
  EngineAPI,
  PlayerController,
} from './types';
import { createEngineApi, readScoreOverride } from './api';

export const WIN_POINTS = 10;

// One draw per turn (on top of the initial hand-of-3 dealt before turn 1).
// Not part of the exported params surface — the plan only calls out
// `handSize` (the initial deal) as configurable.
const DRAW_PER_TURN = 1;

export interface CreateInnerGameParams {
  registry: ReadonlyMap<CardId, CardDef>;
  effects: ReadonlyMap<CardId, CardEffect>;
  decks: Record<PlayerId, CardId[]>;
  seed: number;
  firstPlayer: PlayerId;
  choiceResponders: Record<PlayerId, ChoiceResponder>;
  handSize?: number;
  winPoints?: number;
  // Non-blocking-implement-job feature: a card is "locked" when its registry
  // entry has implemented === false && destroyed === false (see
  // shared/cardLock.ts for the canonical predicate). Locked cards can be
  // drawn/held/discarded/moved like any other CardId -- the engine never
  // needs an effect module for zone movement -- but resolvePlay rejects
  // playing one, exactly like any other illegal play. Queried DYNAMICALLY at
  // play time (not snapshotted at game creation) so a mid-game unlock takes
  // effect immediately without touching the runtime. Default () => false
  // keeps every existing caller (headless matches, tests) unaffected.
  isLocked?: (cardId: CardId) => boolean;
  // Test-only escape hatches (tests/helpers.ts createTestGame): when
  // `hands` is supplied for a player, that player's initial hand is set
  // EXACTLY to those card ids (bypassing the automatic draw-3-before-turn-1
  // deal for that seat) and their `decks[player]` pool is used purely as
  // the draw pile, untouched by the deal. When `shuffleDecks` is false, each
  // player's draw pile keeps the exact order given in `decks` instead of
  // being shuffled — lets tests build precise, unshuffled scenarios without
  // fighting the RNG.
  hands?: Partial<Record<PlayerId, CardId[]>>;
  shuffleDecks?: boolean;
  // M5 choice-point persistence: forwarded verbatim into the internal
  // createEngineApi call (see CreateEngineApiParams.onChoiceRecorded in
  // src/engine/api.ts for the full doc). Needed here (rather than only on
  // createEngineApi) because src/ui/app.ts's startNewInnerGame builds its
  // runtime via createInnerGame, not createEngineApi directly. Purely
  // additive.
  onChoiceRecorded?: () => void;
}

export interface InnerGameRuntime {
  state: InnerGameState;
  api: EngineAPI;
  registry: ReadonlyMap<CardId, CardDef>;
  effects: ReadonlyMap<CardId, CardEffect>;
  winPoints: number;
  // See CreateInnerGameParams.isLocked. Always present on the runtime (even
  // when createInnerGame's caller omitted it) so resolvePlay and any other
  // consumer can call it unconditionally.
  isLocked: (cardId: CardId) => boolean;
}

const PLAYERS: PlayerId[] = ['human', 'claude'];

export function emptyPlayerState(id: PlayerId): PlayerState {
  return {
    id,
    drawPile: [],
    hand: [],
    inPlay: [],
    discard: [],
    skipNextDraw: false,
    extraTurns: 0,
  };
}

// Silent initial deal (no hooks, no log-worthy shuffle-in — the discard pile
// is guaranteed empty before the first card is ever played) used only by
// createInnerGame's synchronous bootstrap. Real in-turn draws go through
// EngineAPI.draw, which fires onDraw and handles the empty-deck reshuffle.
function dealInitialHand(playerState: PlayerState, count: number): void {
  for (let i = 0; i < count; i++) {
    const card = playerState.drawPile.shift();
    if (!card) break;
    playerState.hand.push(card);
  }
}

export function createInnerGame(params: CreateInnerGameParams): InnerGameRuntime {
  const {
    registry,
    effects,
    decks,
    seed,
    firstPlayer,
    choiceResponders,
    handSize = 3,
    winPoints = WIN_POINTS,
    hands,
    shuffleDecks = true,
    isLocked = () => false,
    onChoiceRecorded,
  } = params;

  let instanceCounter = 0;
  const nextInstanceId = (): string => `inst-${instanceCounter++}`;

  const state: InnerGameState = {
    seed,
    rngState: seed,
    activePlayer: firstPlayer,
    turnNumber: 0,
    turnsTaken: { human: 0, claude: 0 },
    players: {
      human: emptyPlayerState('human'),
      claude: emptyPlayerState('claude'),
    },
    effectState: {},
    log: [],
    result: null,
  };

  const api = createEngineApi({ state, registry, effects, choiceResponders, onChoiceRecorded });

  for (const player of PLAYERS) {
    const pile: CardInstance[] = (decks[player] ?? []).map((cardId) => ({
      instanceId: nextInstanceId(),
      cardId,
    }));
    state.players[player].drawPile = shuffleDecks ? api.rng.shuffle(pile) : pile;
  }

  for (const player of PLAYERS) {
    const explicitHand = hands?.[player];
    if (explicitHand) {
      state.players[player].hand = explicitHand.map((cardId) => ({
        instanceId: nextInstanceId(),
        cardId,
      }));
      continue;
    }
    dealInitialHand(state.players[player], handSize);
  }

  return { state, api, registry, effects, winPoints, isLocked };
}

// Approximate, hook-free score used for AI heuristics (sum of inPlay base
// values, minus any active score overrides -- see EngineAPI.setScoreOverride
// in src/engine/types.ts -- so a frozen board doesn't look more valuable to
// the AI than score() would actually report). The authoritative score is
// EngineAPI.score(), which is async because it folds modifyScore hooks.
export function computeBaseScore(
  state: InnerGameState,
  effects: ReadonlyMap<CardId, CardEffect>,
  player: PlayerId
): number {
  let total = 0;
  for (const instance of state.players[player].inPlay) {
    const override = readScoreOverride(state, instance.instanceId);
    total += override ?? (effects.get(instance.cardId)?.baseValue ?? 0);
  }
  return total;
}

export function makeGameView(runtime: InnerGameRuntime, self: PlayerId): AIGameView {
  const snapshot = structuredClone(runtime.state);
  const opponent: PlayerId = self === 'human' ? 'claude' : 'human';
  return {
    self,
    opponent,
    state: snapshot,
    score: (player: PlayerId) => computeBaseScore(snapshot, runtime.effects, player),
  };
}

export async function checkCheckpoint(runtime: InnerGameRuntime): Promise<InnerGameResult | null> {
  // If some other primitive already forced a result onto state.result (e.g.
  // EngineAPI.forceWin -- see r5-claude-the-halting-problem-s-solution),
  // honor it immediately instead of recomputing from scores. Every existing
  // call site only ever invokes checkCheckpoint while state.result is still
  // null (each caller returns as soon as a non-null result is found), so
  // this is a no-op for every pre-existing flow -- purely additive.
  if (runtime.state.result) return runtime.state.result;
  const [humanScore, claudeScore] = await Promise.all([
    runtime.api.score('human'),
    runtime.api.score('claude'),
  ]);
  const humanWins = humanScore >= runtime.winPoints;
  const claudeWins = claudeScore >= runtime.winPoints;
  if (humanWins && claudeWins) return { outcome: 'draw' };
  if (humanWins) return { outcome: 'win', winner: 'human' };
  if (claudeWins) return { outcome: 'win', winner: 'claude' };
  return null;
}

export interface ResolvePlayResult {
  passed: boolean;
  cancelled: boolean;
}

// Resolves playing (or passing on) a single card, independent of the
// surrounding turn machinery (draw phase, checkpoints, interrupts) — the
// piece runTurn composes and tests/helpers.ts's `play()` calls directly for
// fine-grained zone/scoring assertions.
export async function resolvePlay(
  runtime: InnerGameRuntime,
  playerId: PlayerId,
  instanceId: string | null
): Promise<ResolvePlayResult> {
  if (instanceId === null) {
    runtime.api.log({ type: 'pass', message: `${playerId} passes (no card played).`, player: playerId });
    return { passed: true, cancelled: false };
  }

  const playerState = runtime.state.players[playerId];
  const instance = playerState.hand.find((i) => i.instanceId === instanceId);
  if (!instance) {
    throw new Error(`resolvePlay: instance "${instanceId}" not found in ${playerId}'s hand`);
  }
  // Locked-card play guard (engine-level backstop; the UI and AI are
  // expected to prevent this upstream). Checked BEFORE the effect lookup —
  // and read dynamically via runtime.isLocked rather than any snapshotted
  // flag — so a card whose module hasn't been hot-loaded yet is rejected
  // with a clear "locked" error instead of falling through to the generic
  // "no effect module registered" one below, and an unlock mid-game (the
  // same instanceId, isLocked flipping to false) is honored on the very
  // next play attempt.
  if (runtime.isLocked(instance.cardId)) {
    throw new Error(`resolvePlay: card "${instance.cardId}" is locked (not yet implemented) and cannot be played`);
  }
  // r5-human-frost-pact's "can't be played" hand-freeze guard (see
  // EngineAPI.freezeHandCard). Same shape as the isLocked guard directly
  // above -- an engine-level backstop behind the AI-side filter in
  // src/ai/player.ts's chooseCardToPlay -- checked dynamically so it always
  // reflects the instance's current frozen state.
  if (runtime.api.isHandCardFrozen(instance.instanceId)) {
    throw new Error(`resolvePlay: card instance "${instanceId}" is frozen and cannot be played`);
  }
  const effect = runtime.effects.get(instance.cardId);
  if (!effect) {
    throw new Error(`resolvePlay: no effect module registered for card "${instance.cardId}"`);
  }

  if (effect.cardType === 'keeper') {
    await runtime.api.moveToPlay(playerId, instanceId);
    return { passed: false, cancelled: false };
  }

  // Action: resolve onPlay while the card is still in hand (scope: 'inHand'
  // per the effect module contract); a cancelling handler bounces it back to
  // hand (it never left) instead of resolving + discarding it.
  const results = await runtime.api.emit('onPlay', { instanceId, cardId: instance.cardId });
  if (results.some((r) => r.cancel)) {
    return { passed: false, cancelled: true };
  }
  await runtime.api.moveToDiscard(playerId, instanceId, 'hand');
  return { passed: false, cancelled: false };
}

export interface RunTurnOptions {
  // Forces which card gets played this turn (or forces a pass when null),
  // bypassing the controller's chooseCardToPlay — used by tests that want a
  // full turn (draw phase + checkpoints + swap) without AI nondeterminism.
  playInstanceId?: string | null;
}

export async function runTurn(
  runtime: InnerGameRuntime,
  controllers: Record<PlayerId, PlayerController>,
  options: RunTurnOptions = {}
): Promise<void> {
  const { state, api } = runtime;
  const activePlayer = state.activePlayer;
  const opponent: PlayerId = activePlayer === 'human' ? 'claude' : 'human';

  state.turnNumber += 1;
  state.turnsTaken[activePlayer] += 1;

  await api.emit('onTurnStart', {});

  const playerState = state.players[activePlayer];
  if (playerState.skipNextDraw) {
    playerState.skipNextDraw = false;
    api.log({ type: 'draw', message: `${activePlayer} skips their draw this turn.`, player: activePlayer });
  } else {
    await api.draw(activePlayer, DRAW_PER_TURN);
  }

  let result = await checkCheckpoint(runtime);
  if (result) {
    state.result = result;
    return;
  }

  const interruptResults = await api.emit('interruptOpponentTurn', {});
  const interrupted = interruptResults.some((r) => r.cancel);

  if (!interrupted) {
    const forced = 'playInstanceId' in options;
    let instanceId: string | null;
    if (forced) {
      instanceId = options.playInstanceId ?? null;
    } else if (playerState.hand.length === 0) {
      instanceId = null;
    } else {
      const view = makeGameView(runtime, activePlayer);
      const chosen = await controllers[activePlayer].chooseCardToPlay(view);
      instanceId = chosen ? chosen.instanceId : null;
    }

    let attempt = await resolvePlay(runtime, activePlayer, instanceId);

    // "onPlay pre-hooks may cancel -> card bounces to hand and the agent
    // re-chooses". Bounded retry (guarded by hand size) so a controller that
    // keeps re-offering the same cancelled card can't loop forever; a
    // repeated or null re-choice is treated as a pass.
    let guard = 0;
    while (attempt.cancelled && !forced && guard < playerState.hand.length + 1) {
      guard += 1;
      if (playerState.hand.length === 0) break;
      const view = makeGameView(runtime, activePlayer);
      const chosen = await controllers[activePlayer].chooseCardToPlay(view);
      const nextId = chosen ? chosen.instanceId : null;
      if (nextId === null || nextId === instanceId) {
        attempt = await resolvePlay(runtime, activePlayer, null);
        break;
      }
      instanceId = nextId;
      attempt = await resolvePlay(runtime, activePlayer, instanceId);
    }
  }

  result = await checkCheckpoint(runtime);
  if (result) {
    state.result = result;
    return;
  }

  await api.emit('onTurnEnd', {});

  // A card's onTurnEnd handler can be the thing that pushes a player over
  // WIN_POINTS (e.g. an end-of-turn modifyScore-affecting mutation) -- check
  // for a result here too, not just after the draw/play phases, so a
  // game-ending effect is detected the instant it happens rather than after
  // an entire extra turn is played on top of it.
  result = await checkCheckpoint(runtime);
  if (result) {
    state.result = result;
    return;
  }

  if (state.players[activePlayer].extraTurns > 0) {
    state.players[activePlayer].extraTurns -= 1;
  } else {
    state.activePlayer = opponent;
  }
}

export interface RunInnerGameOptions {
  maxTurns?: number;
}

export async function runInnerGame(
  runtime: InnerGameRuntime,
  controllers: Record<PlayerId, PlayerController>,
  options: RunInnerGameOptions = {}
): Promise<InnerGameState> {
  const maxTurns = options.maxTurns ?? 100;

  await runtime.api.emit('onInnerGameStart', {});

  while (runtime.state.result === null) {
    if (runtime.state.turnNumber >= maxTurns) {
      throw new Error(`runInnerGame: exceeded maxTurns (${maxTurns}) without reaching a result`);
    }
    await runTurn(runtime, controllers);
  }

  await runtime.api.emit('onInnerGameEnd', {});

  return runtime.state;
}
