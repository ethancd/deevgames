// EngineAPI implementation — the ONLY mutation surface for card effects,
// hook handlers, and the turn loop. Read views are structuredClone'd so
// nothing outside this module can mutate live state directly.
//
// Deliberately self-contained: only depends on shared/types, engine/types,
// engine/hooks, and engine/rng — NOT on engine/engine.ts — so there is no
// import cycle between api.ts (the low-level mutation surface) and
// engine.ts (the turn loop built on top of it).

import type {
  CardDef,
  CardId,
  CardInstance,
  InnerGameState,
  PlayerId,
  PlayerState,
} from '../../shared/types';
import type {
  AIGameView,
  CardEffect,
  CardType,
  ChoiceOption,
  ChoiceResponder,
  ChoiceSpec,
  DiscardSource,
  EngineAPI,
} from './types';
import { createBoundRng } from './rng';
import { dispatchHooks, makeCardOrderComparator, type DispatchDeps } from './hooks';

export interface CreateEngineApiParams {
  state: InnerGameState;
  registry: ReadonlyMap<CardId, CardDef>;
  effects: ReadonlyMap<CardId, CardEffect>;
  choiceResponders: Record<PlayerId, ChoiceResponder>;
  // M5 choice-point persistence: invoked synchronously right after a
  // newly-live (not replayed) requestChoice answer is pushed onto
  // state.pendingTurn.resolvedChoices — lets src/ui/app.ts persist the
  // just-recorded choice immediately (non-debounced), the same way
  // pendingHumanDraft is persisted the instant it's set. Never invoked for a
  // choice resolved from the replay cursor (see requestChoice below), and a
  // no-op (never called) when state.pendingTurn is unset. Purely additive:
  // omitting it (every existing caller/test) leaves requestChoice's behavior
  // otherwise unchanged.
  onChoiceRecorded?: () => void;
}

function otherPlayer(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

// Reserved effectState key prefix for EngineAPI.setScoreOverride/
// getScoreOverride/clearScoreOverride (see the doc comment on
// EngineAPI.setScoreOverride in src/engine/types.ts). Exported so
// engine.ts's computeBaseScore -- a separate hook-free score approximation
// used for AI heuristics -- can stay consistent with the real score()
// without duplicating the key-formatting logic.
const SCORE_OVERRIDE_PREFIX = '__scoreOverride__:';

export function readScoreOverride(state: InnerGameState, instanceId: string): number | undefined {
  const value = state.effectState[`${SCORE_OVERRIDE_PREFIX}${instanceId}`];
  return typeof value === 'number' ? value : undefined;
}

// Reserved effectState key prefix for EngineAPI.freezeHandCard/
// isHandCardFrozen (r5-human-frost-pact). Exported (mirroring
// readScoreOverride above) so src/ai/player.ts's chooseCardToPlay can filter
// frozen hand instances straight off an AIGameView snapshot without needing
// a live EngineAPI instance -- the same pattern engine.ts's computeBaseScore
// already uses for readScoreOverride.
const HAND_FROZEN_PREFIX = '__handFrozen__:';

export function readHandFrozen(state: InnerGameState, instanceId: string): boolean {
  return state.effectState[`${HAND_FROZEN_PREFIX}${instanceId}`] === true;
}

// Reserved effectState key prefix for EngineAPI.grantKeeperFreezeImmunity/
// revokeKeeperFreezeImmunity/isKeeperFreezeImmune
// (r7-claude-the-adiabatic-escrow-vault, "Your keepers can't be frozen").
// Stores a per-player REFERENCE COUNT rather than a boolean so multiple
// immunity-granting keepers compose correctly -- immunity only lifts once
// every granting keeper has left play. Exported for symmetry with the other
// reserved-prefix readers above.
const FREEZE_IMMUNITY_PREFIX = '__keeperFreezeImmunity__:';

export function readKeeperFreezeImmunityCount(state: InnerGameState, player: PlayerId): number {
  const value = state.effectState[`${FREEZE_IMMUNITY_PREFIX}${player}`];
  return typeof value === 'number' ? value : 0;
}

// Reserved effectState key for EngineAPI.playCopyOf's own instance-id
// counter (r6-human-mirrorblob). A brand-new instance created by playCopyOf
// is never sourced from any existing zone/draw pile, so there's no natural
// instanceId to reuse -- unlike engine.ts's createInnerGame, which has its
// own LOCAL closure counter (`instanceCounter`) for the initial deal, api.ts
// has no access to that counter (it's deliberately self-contained from
// engine.ts, see this file's header) and that counter isn't reconstructed
// on resume anyway (src/ui/app.ts's resumeRuntime calls createEngineApi
// directly over persisted state, never createInnerGame again). So this gets
// its own counter, persisted the same reserved-key way as every other
// additive primitive in this file (SCORE_OVERRIDE_PREFIX etc.), prefixed
// "copy-" (never "inst-") so a generated id can never collide with a real
// dealt instance's id.
const COPY_INSTANCE_COUNTER_KEY = '__copyInstanceCounter__';

// Hook-free score (sum of inPlay baseValues, minus any active score
// overrides) used only to build the read-only AIGameView handed to choice
// responders. The authoritative, hook-folded score lives on
// EngineAPI.score() below. Deliberately duplicated from engine.ts's
// computeBaseScore (rather than imported) to keep api.ts free of any
// dependency on engine.ts.
function baseScore(
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

function findInZone(zone: CardInstance[], instanceId: string): number {
  return zone.findIndex((i) => i.instanceId === instanceId);
}

const ALL_PLAYERS: PlayerId[] = ['human', 'claude'];

type ZoneName = 'hand' | 'inPlay' | 'discard' | 'drawPile';

interface LocatedInstance {
  player: PlayerId;
  zone: ZoneName;
}

// Finds which player controls an instance and which zone it currently sits
// in, scanning all four zones of both players. Used by moveToHand, which
// (unlike the other zone-movers) isn't told its controller up front — the
// controller is "whoever currently has this instance."
function locateInstance(state: InnerGameState, instanceId: string): LocatedInstance | undefined {
  for (const player of ALL_PLAYERS) {
    const ps = state.players[player];
    if (findInZone(ps.inPlay, instanceId) !== -1) return { player, zone: 'inPlay' };
    if (findInZone(ps.discard, instanceId) !== -1) return { player, zone: 'discard' };
    if (findInZone(ps.hand, instanceId) !== -1) return { player, zone: 'hand' };
    if (findInZone(ps.drawPile, instanceId) !== -1) return { player, zone: 'drawPile' };
  }
  return undefined;
}

export function createEngineApi(params: CreateEngineApiParams): EngineAPI {
  const { state, registry, effects, choiceResponders, onChoiceRecorded } = params;
  const compareCardOrder = makeCardOrderComparator(registry);
  // M5 choice-point persistence: cursor into state.pendingTurn.resolvedChoices
  // (the replay ledger). `cursorFor` remembers WHICH pendingTurn object the
  // cursor belongs to; whenever state.pendingTurn is a different reference
  // than last seen (a fresh turn started, or a freshly reconstructed runtime
  // built from persisted state), the cursor resets to 0. This is local
  // per-createEngineApi-call state, not persisted itself — it's re-derived
  // for free every time a new EngineAPI is built over a given state.
  let cursor = 0;
  let cursorFor: InnerGameState['pendingTurn'] | undefined;
  const rng = createBoundRng(
    () => state.rngState,
    (v) => {
      state.rngState = v;
    }
  );

  const dispatchDeps = (): DispatchDeps => ({
    api,
    players: state.players,
    effects,
    compareCardOrder,
  });

  function pushLog(
    player: PlayerId,
    type: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    state.log.push({ turn: state.turnNumber, player, type, message, data });
  }

  async function fireZoneHook(
    hookName: 'onEnterPlay' | 'onLeavePlay' | 'onDiscard' | 'onDraw',
    forPlayer: PlayerId,
    instance: CardInstance
  ): Promise<void> {
    await dispatchHooks(
      hookName,
      {
        name: hookName,
        activePlayer: forPlayer,
        payload: { instanceId: instance.instanceId, cardId: instance.cardId },
      },
      dispatchDeps()
    );
  }

  function getState(): Readonly<InnerGameState> {
    return structuredClone(state);
  }

  function getPlayer(id: PlayerId): Readonly<PlayerState> {
    return structuredClone(state.players[id]);
  }

  function getCardBaseValue(cardId: CardId): number {
    return effects.get(cardId)?.baseValue ?? 0;
  }

  // Display-name lookup for effects (labels shown to the human MUST use
  // this, never raw instance/card ids -- see the 2026-07-03 Subzero Serpent
  // UX bug). Falls back to the raw id for unknown cards.
  function getCardName(cardId: CardId): string {
    return registry.get(cardId)?.name ?? cardId;
  }

  function getCardType(cardId: CardId): CardType | undefined {
    return effects.get(cardId)?.cardType;
  }

  function forceWin(winner: PlayerId): void {
    // First result wins -- never clobber an existing win/draw (mirrors the
    // invariant checkCheckpoint's callers already rely on: it's only ever
    // consulted while state.result is still null).
    if (state.result) return;
    state.result = { outcome: 'win', winner };
    pushLog(winner, 'win', `${winner} wins the game instantly.`);
  }

  function freezeHandCard(instanceId: string): void {
    state.effectState[`${HAND_FROZEN_PREFIX}${instanceId}`] = true;
  }

  function isHandCardFrozen(instanceId: string): boolean {
    return readHandFrozen(state, instanceId);
  }

  async function score(player: PlayerId): Promise<number> {
    let total = 0;
    for (const instance of state.players[player].inPlay) {
      const override = readScoreOverride(state, instance.instanceId);
      total += override ?? (effects.get(instance.cardId)?.baseValue ?? 0);
    }
    const payload: Record<string, unknown> = { player, score: total };
    await dispatchHooks(
      'modifyScore',
      { name: 'modifyScore', activePlayer: player, payload },
      dispatchDeps()
    );
    return payload.score as number;
  }

  async function draw(player: PlayerId, count = 1): Promise<CardInstance[]> {
    const ps = state.players[player];
    const drawn: CardInstance[] = [];
    for (let i = 0; i < count; i++) {
      if (ps.drawPile.length === 0) {
        if (ps.discard.length === 0) {
          // Both piles empty: no-op, stop drawing further this call.
          break;
        }
        ps.drawPile = rng.shuffle(ps.discard);
        ps.discard = [];
        pushLog(player, 'reshuffle', `${player} shuffles their discard pile back into the draw pile.`);
      }
      const card = ps.drawPile.shift();
      if (!card) break;
      ps.hand.push(card);
      drawn.push(card);
      pushLog(player, 'draw', `${player} draws ${card.cardId}.`, { instanceId: card.instanceId, cardId: card.cardId });
    }
    for (const card of drawn) {
      await fireZoneHook('onDraw', player, card);
    }
    return drawn;
  }

  async function moveToPlay(player: PlayerId, instanceId: string): Promise<void> {
    const ps = state.players[player];
    const idx = findInZone(ps.hand, instanceId);
    if (idx === -1) {
      throw new Error(`moveToPlay: instance "${instanceId}" not found in ${player}'s hand`);
    }
    const [card] = ps.hand.splice(idx, 1);
    ps.inPlay.push(card);
    pushLog(player, 'play', `${player} plays ${card.cardId} as a keeper.`, { instanceId, cardId: card.cardId });
    await fireZoneHook('onEnterPlay', player, card);
  }

  async function moveToDiscard(
    player: PlayerId,
    instanceId: string,
    from: DiscardSource
  ): Promise<void> {
    const ps = state.players[player];
    const zone = from === 'hand' ? ps.hand : ps.inPlay;
    const idx = findInZone(zone, instanceId);
    if (idx === -1) {
      throw new Error(`moveToDiscard: instance "${instanceId}" not found in ${player}'s ${from}`);
    }
    const card = zone[idx];
    // onLeavePlay must see the card still sitting in inPlay (its scope is
    // 'inPlay' by default), so fire it BEFORE removing the card from the
    // zone; only then splice it out.
    if (from === 'inPlay') {
      await fireZoneHook('onLeavePlay', player, card);
    }
    const removeIdx = findInZone(zone, instanceId);
    if (removeIdx === -1) {
      throw new Error(`moveToDiscard: instance "${instanceId}" was removed from ${player}'s ${from} by a hook handler`);
    }
    zone.splice(removeIdx, 1);
    ps.discard.push(card);
    pushLog(player, 'discard', `${player} discards ${card.cardId} from ${from}.`, { instanceId, cardId: card.cardId });
    await fireZoneHook('onDiscard', player, card);
  }

  async function moveToHand(instanceId: string): Promise<void> {
    const located = locateInstance(state, instanceId);
    if (!located) {
      throw new Error(`moveToHand: instance "${instanceId}" not found in any zone`);
    }
    const { player, zone } = located;
    if (zone === 'hand' || zone === 'drawPile') {
      throw new Error(`moveToHand: instance "${instanceId}" is already in ${player}'s ${zone}, cannot move it to hand`);
    }
    const ps = state.players[player];

    if (zone === 'inPlay') {
      const card = ps.inPlay[findInZone(ps.inPlay, instanceId)];
      // Same convention as moveToDiscard's leave-play path: fire onLeavePlay
      // BEFORE removing the card from inPlay so its scope sees it still
      // there, then re-look-up the index in case the handler moved it.
      await fireZoneHook('onLeavePlay', player, card);
      const removeIdx = findInZone(ps.inPlay, instanceId);
      if (removeIdx === -1) {
        throw new Error(`moveToHand: instance "${instanceId}" was removed from ${player}'s inPlay by a hook handler`);
      }
      ps.inPlay.splice(removeIdx, 1);
      ps.hand.push(card);
      pushLog(player, 'moveToHand', `${player}'s ${card.cardId} returns to hand from play.`, { instanceId, cardId: card.cardId });
      return;
    }

    // zone === 'discard': no zone hooks fire, symmetric with moveToPlay only
    // firing the entering-zone hook (onEnterPlay) and not a leaving-hand hook.
    const idx = findInZone(ps.discard, instanceId);
    const [card] = ps.discard.splice(idx, 1);
    ps.hand.push(card);
    pushLog(player, 'moveToHand', `${player}'s ${card.cardId} returns to hand from discard.`, { instanceId, cardId: card.cardId });
  }

  // Finds a specific card instance sitting in `player`'s draw pile and
  // resolves it exactly as if it had just been played from hand -- added
  // for r7-human-rime-portal ("find a card in your deck and play it").
  // Nothing in the existing zone-mover surface can do this: draw() only
  // pulls randomly off the TOP of the pile into hand (never resolves a
  // play), and moveToPlay/emit('onPlay') both require the instance to
  // ALREADY be sitting in hand (so scope: 'inHand' onPlay handlers -- the
  // documented convention, see _template.ts -- actually fire).
  //
  // Implemented self-contained here (mirroring resolvePlay's cardType
  // branch in src/engine/engine.ts) rather than by calling into engine.ts,
  // since api.ts is deliberately independent of engine.ts (see this file's
  // header) and effect modules only ever see EngineAPI, never the
  // InnerGameRuntime resolvePlay needs. The found card is spliced straight
  // from the draw pile into hand, then immediately resolved (keeper ->
  // moveToPlay; action -> dispatch onPlay, then discard unless cancelled)
  // -- all synchronously within this one call, so no other hook or player
  // ever observes the card "in hand" as a distinct, reactable state.
  //
  // Purely additive: nothing else calls this, so no existing card/test is
  // affected. Two known, acceptable gaps versus a normal resolvePlay
  // (documented rather than silently papered over): (1) it does not
  // consult resolvePlay's `isLocked` guard -- that predicate lives on the
  // InnerGameRuntime, not EngineAPI, and is out of reach from here; (2) a
  // found cardId with no registered effect module is simply left sitting
  // in hand (nothing to resolve) rather than erroring.
  async function playCardFromDeck(player: PlayerId, instanceId: string): Promise<void> {
    const ps = state.players[player];
    const idx = findInZone(ps.drawPile, instanceId);
    if (idx === -1) {
      throw new Error(`playCardFromDeck: instance "${instanceId}" not found in ${player}'s draw pile`);
    }
    const [card] = ps.drawPile.splice(idx, 1);
    ps.hand.push(card);
    pushLog(player, 'search', `${player} finds ${card.cardId} in their deck and plays it.`, {
      instanceId: card.instanceId,
      cardId: card.cardId,
    });

    const effect = effects.get(card.cardId);
    if (!effect) {
      return;
    }

    if (effect.cardType === 'keeper') {
      await moveToPlay(player, card.instanceId);
      return;
    }

    const results = await dispatchHooks(
      'onPlay',
      { name: 'onPlay', activePlayer: player, payload: { instanceId: card.instanceId, cardId: card.cardId } },
      dispatchDeps()
    );
    if (results.some((r) => r.cancel)) {
      // Same convention as resolvePlay's own cancellation path: a
      // cancelling onPlay handler leaves the card sitting in hand instead
      // of being discarded.
      return;
    }
    await moveToDiscard(player, card.instanceId, 'hand');
  }

  // Like playCardFromDeck, but `deckOwner` (whose draw pile is searched) and
  // `controller` (who ends up playing/controlling the result) can differ --
  // added for r5-human-hunger-vortex ("find a card in your opponent's deck
  // and play it as your own"). Mirrors playCardFromDeck's body almost
  // exactly; the only real difference is that the found card is spliced out
  // of `deckOwner`'s draw pile but pushed into `controller`'s hand, and
  // every subsequent resolution step (moveToPlay / onPlay dispatch /
  // moveToDiscard) runs as `controller`, not `deckOwner`. Purely additive:
  // playCardFromDeck is untouched, so every existing caller keeps searching
  // and playing as the same single player it always did.
  async function playCardFromDeckAs(deckOwner: PlayerId, controller: PlayerId, instanceId: string): Promise<void> {
    const sourcePs = state.players[deckOwner];
    const idx = findInZone(sourcePs.drawPile, instanceId);
    if (idx === -1) {
      throw new Error(`playCardFromDeckAs: instance "${instanceId}" not found in ${deckOwner}'s draw pile`);
    }
    const [card] = sourcePs.drawPile.splice(idx, 1);
    const controllerPs = state.players[controller];
    controllerPs.hand.push(card);
    pushLog(controller, 'search', `${controller} finds ${card.cardId} in ${deckOwner}'s deck and plays it as their own.`, {
      instanceId: card.instanceId,
      cardId: card.cardId,
    });

    const effect = effects.get(card.cardId);
    if (!effect) {
      return;
    }

    if (effect.cardType === 'keeper') {
      await moveToPlay(controller, card.instanceId);
      return;
    }

    const results = await dispatchHooks(
      'onPlay',
      { name: 'onPlay', activePlayer: controller, payload: { instanceId: card.instanceId, cardId: card.cardId } },
      dispatchDeps()
    );
    if (results.some((r) => r.cancel)) {
      // Same convention as playCardFromDeck's own cancellation path: a
      // cancelling onPlay handler leaves the card sitting in the
      // controller's hand instead of being discarded.
      return;
    }
    await moveToDiscard(controller, card.instanceId, 'hand');
  }

  function nextCopyInstanceId(): string {
    const current = state.effectState[COPY_INSTANCE_COUNTER_KEY];
    const n = typeof current === 'number' ? current : 0;
    state.effectState[COPY_INSTANCE_COUNTER_KEY] = n + 1;
    return `copy-${n}`;
  }

  // See the EngineAPI.playCopyOf doc comment in src/engine/types.ts for the
  // full rationale. Deliberately mirrors playCardFromDeckAs's cardType
  // branch (keeper -> enters play; action -> dispatch onPlay then discard
  // unless cancelled) but starting from a synthesized instance rather than
  // one spliced out of a draw pile -- there's nothing to remove or throw
  // "not found" for.
  async function playCopyOf(controller: PlayerId, cardId: CardId): Promise<void> {
    const effect = effects.get(cardId);
    const card: CardInstance = { instanceId: nextCopyInstanceId(), cardId };
    const controllerPs = state.players[controller];

    if (!effect) {
      pushLog(controller, 'copy', `${controller} tries to copy ${getCardName(cardId)}, but it has no effect to copy.`, {
        cardId,
      });
      return;
    }

    pushLog(controller, 'copy', `${controller} copies the effect of ${getCardName(cardId)}.`, {
      instanceId: card.instanceId,
      cardId,
    });

    if (effect.cardType === 'keeper') {
      controllerPs.inPlay.push(card);
      await fireZoneHook('onEnterPlay', controller, card);
      return;
    }

    // Action: an onPlay handler's documented scope is 'inHand' (see
    // _template.ts) -- dispatchHooks only ever considers an instance that's
    // actually sitting in the zone its scope expects, so the ephemeral copy
    // must briefly land in the controller's hand for a scope:'inHand'
    // handler to find it at all (mirrors resolvePlay/playCardFromDeckAs's
    // own sequencing). It's removed again immediately after: to the
    // controller's discard on a normal resolution (matching a real
    // action's post-play lifecycle), or simply spliced back out with
    // nothing left behind if a handler cancels -- there's no meaningful
    // hand state to "bounce back" to for a card that was never really
    // drawn.
    controllerPs.hand.push(card);
    const results = await dispatchHooks(
      'onPlay',
      { name: 'onPlay', activePlayer: controller, payload: { instanceId: card.instanceId, cardId } },
      dispatchDeps()
    );
    const handIdx = findInZone(controllerPs.hand, card.instanceId);
    if (handIdx !== -1) controllerPs.hand.splice(handIdx, 1);
    if (results.some((r) => r.cancel)) {
      pushLog(controller, 'copy', `${controller}'s copy of ${getCardName(cardId)} fizzles.`, { cardId });
      return;
    }
    controllerPs.discard.push(card);
  }

  async function destroyKeeper(owner: PlayerId, instanceId: string): Promise<void> {
    const ps = state.players[owner];
    const idx = findInZone(ps.inPlay, instanceId);
    if (idx === -1) {
      throw new Error(`destroyKeeper: instance "${instanceId}" not found in ${owner}'s inPlay`);
    }
    const card = ps.inPlay[idx];

    // Dispatched BEFORE any zone mutation so a handler (e.g. Recursive
    // Refund Clause) can intercept and relocate the card itself — via
    // api.moveToHand() — instead of letting it hit the discard pile.
    const beforeResults = await dispatchHooks(
      'onBeforeDestroy',
      {
        name: 'onBeforeDestroy',
        activePlayer: owner,
        payload: { instanceId: card.instanceId, cardId: card.cardId },
      },
      dispatchDeps()
    );
    if (beforeResults.some((r) => r.cancel)) {
      // A handler cancelled the destroy and is expected to have already
      // moved the card elsewhere itself, so the card may legitimately no
      // longer be in inPlay here — do NOT apply the "removed by a hook
      // handler" guard in this branch, that guard only makes sense for the
      // non-cancelled path below.
      pushLog(owner, 'destroy', `${owner}'s ${card.cardId} would be destroyed, but a hook intercepted it.`, { instanceId, cardId: card.cardId });
      return;
    }

    await fireZoneHook('onLeavePlay', owner, card);
    const removeIdx = findInZone(ps.inPlay, instanceId);
    if (removeIdx === -1) {
      throw new Error(`destroyKeeper: instance "${instanceId}" was removed from ${owner}'s inPlay by a hook handler`);
    }
    ps.inPlay.splice(removeIdx, 1);
    ps.discard.push(card);
    pushLog(owner, 'destroy', `${owner}'s ${card.cardId} is destroyed.`, { instanceId, cardId: card.cardId });
    await fireZoneHook('onDiscard', owner, card);
  }

  async function changeController(instanceId: string, from: PlayerId, to: PlayerId): Promise<void> {
    const fromPs = state.players[from];
    const toPs = state.players[to];
    const zones: Array<{ name: 'hand' | 'inPlay' | 'discard'; list: CardInstance[] }> = [
      { name: 'hand', list: fromPs.hand },
      { name: 'inPlay', list: fromPs.inPlay },
      { name: 'discard', list: fromPs.discard },
    ];

    let found: { zoneName: 'hand' | 'inPlay' | 'discard'; card: CardInstance; list: CardInstance[] } | undefined;
    for (const zone of zones) {
      const idx = findInZone(zone.list, instanceId);
      if (idx !== -1) {
        found = { zoneName: zone.name, card: zone.list[idx], list: zone.list };
        break;
      }
    }
    if (!found) {
      throw new Error(`changeController: instance "${instanceId}" not found in any of ${from}'s zones`);
    }
    const { zoneName, card, list } = found;

    if (zoneName === 'inPlay') {
      await fireZoneHook('onLeavePlay', from, card);
    }

    const removeIdx = findInZone(list, instanceId);
    if (removeIdx === -1) {
      throw new Error(`changeController: instance "${instanceId}" was removed from ${from}'s ${zoneName} by a hook handler`);
    }
    list.splice(removeIdx, 1);

    const targetList = zoneName === 'hand' ? toPs.hand : zoneName === 'inPlay' ? toPs.inPlay : toPs.discard;
    targetList.push(card);
    pushLog(to, 'changeController', `${card.cardId} changes control from ${from} to ${to}.`, {
      instanceId,
      cardId: card.cardId,
      from,
      to,
    });

    if (zoneName === 'inPlay') {
      await fireZoneHook('onEnterPlay', to, card);
    }
  }

  function setScoreOverride(instanceId: string, value: number): void {
    // "Your keepers can't be frozen" (r7-claude-the-adiabatic-escrow-vault):
    // if the TARGET instance's current owner is freeze-immune, silently
    // skip applying the override. Every caller today (freezeHandCard is a
    // separate primitive; setScoreOverride's own callers are
    // r1-human-bone-chilling-breeze and r4-human-subzero-serpent) is
    // completely unaffected unless some card has actually granted immunity.
    const located = locateInstance(state, instanceId);
    if (located && isKeeperFreezeImmune(located.player)) return;
    state.effectState[`${SCORE_OVERRIDE_PREFIX}${instanceId}`] = value;
  }

  function clearScoreOverride(instanceId: string): void {
    delete state.effectState[`${SCORE_OVERRIDE_PREFIX}${instanceId}`];
  }

  function getScoreOverride(instanceId: string): number | undefined {
    return readScoreOverride(state, instanceId);
  }

  function grantKeeperFreezeImmunity(player: PlayerId): void {
    state.effectState[`${FREEZE_IMMUNITY_PREFIX}${player}`] = readKeeperFreezeImmunityCount(state, player) + 1;
  }

  function revokeKeeperFreezeImmunity(player: PlayerId): void {
    const next = readKeeperFreezeImmunityCount(state, player) - 1;
    state.effectState[`${FREEZE_IMMUNITY_PREFIX}${player}`] = Math.max(0, next);
  }

  function isKeeperFreezeImmune(player: PlayerId): boolean {
    return readKeeperFreezeImmunityCount(state, player) > 0;
  }

  function setFlag(cardId: CardId, key: string, value: unknown): void {
    state.effectState[`${cardId}:${key}`] = value;
  }

  function getFlag(cardId: CardId, key: string): unknown {
    return state.effectState[`${cardId}:${key}`];
  }

  function skipNextDraw(player: PlayerId): void {
    state.players[player].skipNextDraw = true;
  }

  function grantExtraTurn(player: PlayerId): void {
    state.players[player].extraTurns += 1;
  }

  async function emit(eventName: string, payload?: Record<string, unknown>) {
    return dispatchHooks(
      eventName,
      { name: eventName, activePlayer: state.activePlayer, payload },
      dispatchDeps()
    );
  }

  async function requestChoice<T>(player: PlayerId, spec: ChoiceSpec<T>): Promise<T> {
    if (state.pendingTurn !== cursorFor) {
      cursorFor = state.pendingTurn;
      cursor = 0;
    }
    const resolve = spec.resolve ?? ((o: ChoiceOption) => o as unknown as T);

    const pending = state.pendingTurn;
    if (pending && cursor < pending.resolvedChoices.length) {
      const entry = pending.resolvedChoices[cursor];
      const matchedOption = entry.cardId === spec.cardId ? spec.options.find((o) => o.id === entry.optionId) : undefined;
      if (matchedOption) {
        // Replay: resolve to the recorded answer without touching the live
        // responder or consuming any RNG -- this is exactly what makes the
        // rest of the turn replay deterministically after a reload.
        cursor += 1;
        return resolve(matchedOption);
      }
      // Mismatch (wrong card, or an optionId that no longer matches any
      // current option): the recording can no longer be trusted from here on
      // -- discard the rest of it and fall through to live resolution for
      // this and every subsequent requestChoice this turn. Never throws.
      console.warn(
        `requestChoice: recorded choice at cursor ${cursor} does not match card "${spec.cardId}" ` +
          `(recorded cardId "${entry.cardId}") -- discarding remaining recorded choices and resolving live.`
      );
      pending.resolvedChoices.length = cursor;
    }

    const snapshot = structuredClone(state);
    const view: AIGameView = {
      self: player,
      opponent: otherPlayer(player),
      state: snapshot,
      score: (p: PlayerId) => baseScore(snapshot, effects, p),
    };
    const responder = choiceResponders[player];
    const chosen = await responder(spec as ChoiceSpec<unknown>, view);

    if (state.pendingTurn) {
      state.pendingTurn.resolvedChoices.push({ cardId: spec.cardId, optionId: chosen.id });
      cursor = state.pendingTurn.resolvedChoices.length;
      onChoiceRecorded?.();
    }

    return resolve(chosen);
  }

  function log(entry: { player?: PlayerId; type: string; message: string; data?: Record<string, unknown> }): void {
    pushLog(entry.player ?? state.activePlayer, entry.type, entry.message, entry.data);
  }

  const api: EngineAPI = {
    getState,
    getPlayer,
    score,
    getCardBaseValue,
    getCardName,
    getCardType,
    forceWin,
    freezeHandCard,
    isHandCardFrozen,
    setScoreOverride,
    clearScoreOverride,
    getScoreOverride,
    grantKeeperFreezeImmunity,
    revokeKeeperFreezeImmunity,
    isKeeperFreezeImmune,
    draw,
    moveToPlay,
    moveToDiscard,
    moveToHand,
    playCardFromDeck,
    playCardFromDeckAs,
    playCopyOf,
    destroyKeeper,
    changeController,
    setFlag,
    getFlag,
    skipNextDraw,
    grantExtraTurn,
    emit,
    requestChoice,
    log,
    rng,
  };

  return api;
}
