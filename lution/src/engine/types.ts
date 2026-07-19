// Core engine types: hooks, effect module contract, EngineAPI, and the
// read-only view handed to AI strategy code.

import type {
  CardId,
  CardInstance,
  InnerGameState,
  LogEntry,
  PlayerId,
  PlayerState,
} from '../../shared/types';

// === Hooks ===

// A handful of well-known hook names get autocomplete; any other string is
// still accepted (`string & {}` keeps literal-type suggestions alive while
// widening the type so it isn't a closed union). Unknown hook names with no
// registered handlers are no-ops — new cards can `api.emit('anything')`
// without engine surgery.
export type KnownHookName =
  | 'onDraw'
  | 'onPlay'
  | 'onEnterPlay'
  | 'onLeavePlay'
  | 'onDiscard'
  | 'onBeforeDestroy'
  | 'onTurnStart'
  | 'onTurnEnd'
  | 'onInnerGameStart'
  | 'onInnerGameEnd'
  | 'modifyScore'
  | 'interruptOpponentTurn';

export type HookName = KnownHookName | (string & {});

export interface HookEvent {
  name: HookName;
  // Whose turn it is / who triggered this event.
  activePlayer: PlayerId;
  // Free-form event-specific data. For `modifyScore`, payload is a mutable
  // `{ player: PlayerId; score: number }` accumulator that handlers adjust
  // in place as the fold proceeds.
  payload?: Record<string, unknown>;
}

export interface HookResult {
  // If true, the dispatcher stops invoking further handlers and signals the
  // caller to cancel/bounce the triggering action (e.g. onPlay cancellation
  // returns the card to hand instead of resolving it; onBeforeDestroy
  // cancellation aborts destroyKeeper's discard — the handler is expected to
  // have already relocated the card itself, e.g. via api.moveToHand()).
  cancel?: boolean;
}

export interface HookHandlerContext {
  api: EngineAPI;
  event: HookEvent;
  // The card and instance whose hook is firing.
  cardId: CardId;
  instance: CardInstance;
  owner: PlayerId;
}

export type HookHandler = (
  ctx: HookHandlerContext
) => HookResult | void | Promise<HookResult | void>;

export interface HookSpec {
  // Which zone the card instance must be in for this hook to be eligible.
  // Default: 'inPlay'.
  scope?: 'inPlay' | 'inHand' | 'always';
  // Which player's cards this hook applies to, relative to the event's
  // activePlayer. Default: 'owner'.
  side?: 'owner' | 'opponent' | 'any';
  // Higher priority runs first. Default: 0.
  priority?: number;
  handler: HookHandler;
}

// === Effect module contract ===

export type CardType = 'keeper' | 'action';

export interface CardEffect {
  cardId: CardId;
  cardType: CardType;
  // Base point value while in play (keepers) — folded through modifyScore
  // hooks to compute a player's score. Actions typically use 0.
  baseValue: number;
  hooks?: Partial<Record<HookName, HookSpec>>;
  strategy?: StrategyHints;
}

// === AI strategy hints ===

export interface ChoiceOption {
  id: string;
  [key: string]: unknown;
}

export interface StrategyHints {
  // Value used by chooseCardToPlay's argmax. Default: baseValue || 1.
  playValue?: number | ((view: AIGameView, instance: CardInstance) => number);
  // Value used when this card is evaluated as a keep/steal/destroy target.
  // Default: baseValue || 1.
  stealTargetValue?:
    | number
    | ((view: AIGameView, instance: CardInstance) => number);
  // Optional override that short-circuits the default EV comparison in
  // chooseKeepOrSteal for this specific card. Returning undefined defers to
  // the default EV calculation.
  keepOrStealAdvice?: (view: AIGameView) => 'keep' | 'steal' | undefined;
  // Resolves a requestChoice() call when this card is the source of the
  // choice, for the AI player. Falls back to seeded-random if absent.
  choose?: (view: AIGameView, options: ChoiceOption[]) => ChoiceOption;
}

// Read-only snapshot handed to AI strategy code — never a mutation surface.
export interface AIGameView {
  self: PlayerId;
  opponent: PlayerId;
  state: Readonly<InnerGameState>;
  score: (player: PlayerId) => number;
}

// === EngineAPI: the only mutation surface ===

export interface ChoiceSpec<T> {
  cardId: CardId;
  prompt: string;
  options: ChoiceOption[];
  // Resolves the chosen option back into a T (defaults to identity when T
  // is ChoiceOption).
  resolve?: (option: ChoiceOption) => T;
}

// Per-player pluggable resolver for requestChoice — human choices resolve
// via a UI-fed promise, AI choices via card strategy or seeded-random, and
// tests via a scripted queue. `view` is a fresh read-only snapshot from the
// responder's own player's perspective, built at call time.
export type ChoiceResponder = (
  spec: ChoiceSpec<unknown>,
  view: AIGameView
) => Promise<ChoiceOption> | ChoiceOption;

export interface RNG {
  next(): number;
  int(maxExclusive: number): number;
  shuffle<T>(items: T[]): T[];
}

export type DiscardSource = 'hand' | 'inPlay';

export interface EngineAPI {
  getState(): Readonly<InnerGameState>;
  getPlayer(id: PlayerId): Readonly<PlayerState>;
  // Deterministic, never-cached score fold: sum of inPlay baseValues folded
  // through modifyScore hooks in deterministic order.
  score(player: PlayerId): Promise<number>;
  // Read-only lookup of ANY card's registered base point value (0 for an
  // unknown cardId, mirroring the internal score() fold's `?? 0`
  // fallback). HookHandlerContext otherwise only exposes the resolving
  // card's OWN effect (via the module's closure) — effects that must
  // compare/rank OTHER cards by value (e.g. "destroy the opponent's most
  // valuable keeper") have no other way to see another card's baseValue.
  // Purely additive: doesn't change score()/any existing primitive's
  // behavior, just exposes a value those primitives already compute
  // internally.
  getCardBaseValue(cardId: CardId): number;
  // Read-only lookup of a card's display NAME from the registry (falls back
  // to the raw cardId for unknown ids). Added after a live UX bug
  // (2026-07-03): effects had no way to resolve names, so a requestChoice
  // surfaced raw instance ids ("inst-12") to the player. Any options shown
  // to a human MUST be labeled via this. Purely additive.
  getCardName(cardId: CardId): string;
  // Read-only lookup of a card's registered TYPE ('keeper' | 'action'),
  // undefined for an unknown/unimplemented cardId. Added alongside
  // r5-human-frost-pact, which needs to tell "this card has no base point
  // value at all" (an action card) apart from "this keeper's base value
  // happens to be 0" (e.g. r2-human-crystalline-vampire's entirely-dynamic
  // value) -- getCardBaseValue's `?? 0` fallback can't distinguish those on
  // its own. Purely additive.
  getCardType(cardId: CardId): CardType | undefined;

  // Instantly ends the inner game with `winner` as the winner, mirroring
  // what checkCheckpoint would set on state.result but without waiting for
  // either score to cross winPoints. Added for
  // r5-claude-the-halting-problem-s-solution ("When you play this card, you
  // win the game"). A no-op if state.result is already set (first result
  // wins; this never clobbers an existing win/draw) -- mirrors the
  // implicit invariant every checkCheckpoint call site already relies on
  // (see src/engine/engine.ts's runTurn, which only ever calls
  // checkCheckpoint while state.result is still null). Purely additive:
  // nothing currently calls this except that one card, so no existing flow
  // is affected.
  forceWin(winner: PlayerId): void;

  // Marks a HAND card instance as frozen: still drawable/holdable/
  // discardable like any other card, but resolvePlay (src/engine/engine.ts)
  // rejects a play attempt targeting it, and the built-in AI
  // (src/ai/player.ts's chooseCardToPlay) filters it out of consideration
  // so it never attempts one either. Added for r5-human-frost-pact
  // ("freeze a chosen card in your hand ... can't be played"). Distinct
  // from setScoreOverride (flattens a KEEPER's score contribution) and from
  // isLocked (an entire CARD TYPE not yet implemented) -- this flags a
  // single hand INSTANCE. There is deliberately no "unfreeze" counterpart
  // yet -- nothing in the current card set needs one; add one additively,
  // same pattern as clearScoreOverride, if a future card does. Purely
  // additive: an instance is never frozen unless some card calls this.
  freezeHandCard(instanceId: string): void;
  isHandCardFrozen(instanceId: string): boolean;

  // Score overrides: a minimal, additive primitive added alongside
  // r1-human-bone-chilling-breeze ("freeze all keepers ... they each
  // contribute only 1 point"). Setting an override on an instance replaces
  // BOTH its registered baseValue AND its own modifyScore hook's
  // contribution (the hook is simply not dispatched for that instance --
  // see src/engine/hooks.ts's dispatchHooks) with the flat override value
  // for every future score()/computeBaseScore call, until cleared. This is
  // what lets a freeze-style effect flatten a keeper's contribution to 1
  // point regardless of whether that keeper's value is a plain baseValue or
  // computed dynamically via its own modifyScore hook (e.g. a
  // "worth 1 point per keeper in play" or "grows every turn" card) --
  // without either card needing to know about the other. Purely additive:
  // instances with no override behave exactly as before, and no other hook
  // name or primitive is affected.
  setScoreOverride(instanceId: string, value: number): void;
  // Clears a previously set score override (e.g. a future "thaw" effect),
  // restoring the instance's normal baseValue + modifyScore-hook-derived
  // contribution. No-op if no override was set.
  clearScoreOverride(instanceId: string): void;
  // Reads the current score override for an instance, or undefined if none
  // is set.
  getScoreOverride(instanceId: string): number | undefined;

  // Keeper freeze immunity: a minimal, additive primitive added for
  // r7-claude-the-adiabatic-escrow-vault ("Your keepers can't be frozen").
  // Tracks a per-PLAYER reference count rather than a boolean, so multiple
  // immunity-granting keepers in play at once compose correctly (immunity
  // only lifts once every granter has left play) -- call
  // grantKeeperFreezeImmunity on enter, revokeKeeperFreezeImmunity on leave.
  // setScoreOverride -- the ONLY existing "freeze a keeper" primitive (see
  // its own doc comment above) -- consults isKeeperFreezeImmune for the
  // TARGET instance's current owner and silently no-ops the override when
  // immune, so r1-human-bone-chilling-breeze and r4-human-subzero-serpent
  // (today's only two callers) automatically respect this without either
  // card needing to know this one exists. Purely additive: every player's
  // count is 0 until some card calls grantKeeperFreezeImmunity, so any
  // existing card/test that never touches this is entirely unaffected.
  grantKeeperFreezeImmunity(player: PlayerId): void;
  revokeKeeperFreezeImmunity(player: PlayerId): void;
  isKeeperFreezeImmune(player: PlayerId): boolean;

  draw(player: PlayerId, count?: number): Promise<CardInstance[]>;
  moveToPlay(player: PlayerId, instanceId: string): Promise<void>;
  moveToDiscard(
    player: PlayerId,
    instanceId: string,
    from: DiscardSource
  ): Promise<void>;
  // Moves a card instance from its CURRENT controller's inPlay or discard
  // zone back to that same controller's hand (the controller is derived
  // from wherever the instance currently sits — no separate player param).
  // From inPlay: fires onLeavePlay (same convention as moveToDiscard's
  // leave-play path) but NOT onDiscard, since the card isn't being
  // discarded. From discard: no zone hooks fire (symmetric with
  // moveToPlay's hand->inPlay move firing only the entering-zone hook).
  // Throws if the instance is currently in a hand or drawPile (nothing to
  // "return" from) or not found at all. Declared as a Promise like its
  // sibling zone-movers because it must await the onLeavePlay dispatch
  // before mutating state.
  moveToHand(instanceId: string): Promise<void>;
  // Finds a specific card instance in `player`'s draw pile and resolves it
  // exactly as if it had just been played from hand: the card is moved into
  // hand, then immediately resolved (a keeper enters play via moveToPlay; an
  // action dispatches its onPlay hook and is discarded unless a handler
  // cancels it) -- all within this single call, so the intermediate hand
  // placement is never a separately-observable state. Added for
  // r7-human-rime-portal ("find a card in your deck and play it"); no
  // existing primitive can search a specific instance out of the draw pile
  // and actually resolve its play (draw() only pulls randomly off the top
  // into hand, without resolving anything). Throws if instanceId isn't
  // currently in that player's draw pile. Purely additive: nothing else
  // calls this today. Two documented, acceptable gaps versus a normal
  // engine-driven play: it does not consult the (runtime-only, not
  // EngineAPI-visible) `isLocked` guard, and a found cardId with no
  // registered effect module is simply left sitting in hand rather than
  // erroring.
  playCardFromDeck(player: PlayerId, instanceId: string): Promise<void>;
  // Like playCardFromDeck, but the searched draw pile and the resulting
  // controller can be TWO DIFFERENT players -- added for
  // r5-human-hunger-vortex ("find a card in your opponent's deck and play it
  // as your own"). Finds `instanceId` in `deckOwner`'s draw pile, but the
  // card enters `controller`'s hand and is `controller` who resolves the
  // play (a keeper enters `controller`'s play via moveToPlay; an action
  // dispatches onPlay with `controller` as the activePlayer/owner and is
  // discarded to `controller`'s discard unless a handler cancels it).
  // playCardFromDeck itself is untouched -- this is a separate primitive
  // that happens to share its resolution logic, not a signature change to
  // the existing one, so every existing caller/test of playCardFromDeck is
  // completely unaffected. Throws if instanceId isn't currently in
  // `deckOwner`'s draw pile. Same two documented gaps as playCardFromDeck:
  // no isLocked check, and a found cardId with no registered effect module
  // is simply left sitting in `controller`'s hand rather than erroring.
  playCardFromDeckAs(deckOwner: PlayerId, controller: PlayerId, instanceId: string): Promise<void>;
  // Synthesizes a brand-new card instance (never sourced from any existing
  // zone) and resolves it exactly as if `controller` had just played it --
  // added for r6-human-mirrorblob ("pick a card in your hand or your
  // opponent's hand -- copy the effect of that card"). Unlike
  // playCardFromDeck/playCardFromDeckAs, there is no source instance to
  // remove: the picked card stays exactly where it was (in whichever hand
  // it was chosen from) and only a fresh, independent instance resolves the
  // play. A keeper copy enters `controller`'s play permanently (from then
  // on it's indistinguishable from any other keeper of that cardId); an
  // action copy dispatches its onPlay hook once and, unless a handler
  // cancels it, lands in `controller`'s discard pile -- mirroring a normal
  // action's post-resolution lifecycle. A cancelled action copy has no hand
  // instance to "bounce back" to (unlike resolvePlay's own cancellation
  // path), so it's simply logged and dropped rather than resolved twice. A
  // cardId with no registered effect module is simply logged and dropped,
  // same documented-gap convention as playCardFromDeck/playCardFromDeckAs.
  // New instance ids are drawn from their own dedicated, state-persisted
  // counter (a reserved effectState key, same pattern as
  // setScoreOverride's SCORE_OVERRIDE_PREFIX) rather than
  // engine.ts's createInnerGame-local counter, which api.ts has no access
  // to and which isn't reconstructed on resume (src/ui/app.ts's
  // resumeRuntime calls createEngineApi directly over persisted state) --
  // so copy instance ids (prefixed "copy-", never "inst-") can never
  // collide with a real dealt instance. Purely additive: nothing else calls
  // this, so no existing card/test is affected.
  playCopyOf(controller: PlayerId, cardId: CardId): Promise<void>;
  // Destroys a keeper currently in play. First dispatches `onBeforeDestroy`
  // (scope 'inPlay', same collection rules as any other hook) BEFORE any
  // zone mutation; if any handler returns {cancel: true}, the destroy is
  // aborted and neither onLeavePlay nor onDiscard fire — the cancelling
  // handler is expected to have already relocated the card itself (e.g.
  // via api.moveToHand()), so it's legitimate for the card to no longer be
  // in inPlay afterward. Otherwise proceeds exactly as before: fires
  // onLeavePlay then onDiscard, same as moveToDiscard from 'inPlay', logged
  // distinctly as a destroy.
  destroyKeeper(owner: PlayerId, instanceId: string): Promise<void>;
  // Moves a card instance from one player's zone to another's zone of the
  // same kind (e.g. a steal-style effect). Does not fire onEnterPlay again
  // unless the target zone is 'inPlay'.
  changeController(
    instanceId: string,
    from: PlayerId,
    to: PlayerId
  ): Promise<void>;

  setFlag(cardId: CardId, key: string, value: unknown): void;
  getFlag(cardId: CardId, key: string): unknown;

  skipNextDraw(player: PlayerId): void;
  grantExtraTurn(player: PlayerId): void;

  emit(eventName: HookName, payload?: Record<string, unknown>): Promise<HookResult[]>;
  requestChoice<T = ChoiceOption>(
    player: PlayerId,
    spec: ChoiceSpec<T>
  ): Promise<T>;

  log(entry: Omit<LogEntry, 'turn' | 'player'> & { player?: PlayerId }): void;

  rng: RNG;
}

// === Player controllers (drive the turn loop's decisions) ===

// One per seat. Human controllers (M2+) resolve via UI-fed promises; the
// default AI controller lives in src/ai/player.ts; tests supply scripted
// controllers via tests/helpers.ts.
export interface PlayerController {
  // Returns the hand instance to play this turn, or null to pass.
  chooseCardToPlay(view: AIGameView): Promise<CardInstance | null> | CardInstance | null;
  choiceResponder: ChoiceResponder;
}
