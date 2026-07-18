// Default AI player: the decision-making surface used for the 'claude' seat
// headlessly (and reused for local human-vs-AI in M2+). No LLM calls happen
// during turns — every decision comes from strategy hints baked into effect
// modules at implementation time, per the plan's "AI play brain" decision.

import type { CardId, CardInstance, PlayerId } from '../../shared/types';
import type {
  AIGameView,
  CardEffect,
  ChoiceOption,
  ChoiceResponder,
  ChoiceSpec,
  PlayerController,
  RNG,
} from '../engine/types';
import { WIN_POINTS } from '../engine/engine';
import { readHandFrozen } from '../engine/api';
import { resolvePlayValue } from './defaults';

// === chooseCardToPlay ===
// Argmax of strategy.playValue (default baseValue || 1), with a win-now
// override: if playing a keeper would bring the player's own score to >=
// winPoints immediately, play it regardless of how it ranks by playValue.
//
// Non-blocking-implement-job feature: `isLocked` (default: nothing is
// locked) filters locked cards out of consideration entirely -- a hand made
// up ONLY of locked cards falls through to returning null (pass), same as
// an empty hand. This is the AI's half of the play guard; the engine-level
// backstop lives in resolvePlay (src/engine/engine.ts), which rejects a
// locked play regardless of whether this filter is applied upstream.
//
// Same treatment for a hand-FROZEN instance (EngineAPI.freezeHandCard,
// added for r5-human-frost-pact): read directly off the view's effectState
// snapshot via readHandFrozen (same convention r2-human-crystalline-vampire
// already uses for reading a score override straight from an AIGameView),
// so the AI never even considers attempting an illegal play that
// resolvePlay would reject.
export function chooseCardToPlay(
  view: AIGameView,
  effects: ReadonlyMap<CardId, CardEffect>,
  winPoints: number = WIN_POINTS,
  isLocked: (cardId: CardId) => boolean = () => false
): CardInstance | null {
  const hand = view.state.players[view.self].hand;
  if (hand.length === 0) return null;

  const currentScore = view.score(view.self);

  let winNow: CardInstance | null = null;
  let winNowValue = -Infinity;
  let best: CardInstance | null = null;
  let bestValue = -Infinity;

  for (const instance of hand) {
    if (isLocked(instance.cardId)) continue;
    if (readHandFrozen(view.state, instance.instanceId)) continue;
    const effect = effects.get(instance.cardId);
    if (!effect) continue;
    const value = resolvePlayValue(effect, view, instance);

    if (effect.cardType === 'keeper' && currentScore + effect.baseValue >= winPoints) {
      if (winNow === null || value > winNowValue || (value === winNowValue && instance.cardId < winNow.cardId)) {
        winNow = instance;
        winNowValue = value;
      }
    }

    if (best === null || value > bestValue || (value === bestValue && instance.cardId < best.cardId)) {
      best = instance;
      bestValue = value;
    }
  }

  return winNow ?? best;
}

// === STEAL RESHAPED 2026-07-02 (v3) ===
// keep (unchanged): each player's own new design enters their own deck.
// steal: a strict two-pick sequence --
//   1. the LOSER picks first, from the winner's new design OR any card in
//      the winner's deck.
//   2. the WINNER counter-raids, from the loser's new design OR any card in
//      the loser's deck EXCLUDING the card the loser just took in step 1.
// Both picks are FORCED (no "keep" option once steal has been chosen) and
// mechanically identical: maximize `value` across {design candidate} ∪
// {existing candidates}, destroying instead of taking whenever the current
// picker originally created the existing candidate (denial, not profit).
// `pickBestStealCandidate` is the one shared evaluator both chooseLoserSteal
// (step 1) and chooseWinnerPick (step 2) delegate to; the CALLER is
// responsible for excluding the just-taken card from chooseWinnerPick's
// candidate list (app.ts builds the winner's candidates from the loser's
// PRE-round deck, which structurally excludes it already).

export interface StealCandidate {
  cardId: CardId;
  value: number;
  source: 'design' | 'existing';
  // Only meaningful for 'existing' candidates: true if the seat CURRENTLY
  // MAKING THIS PICK originally created this card's type -- picking it
  // executes ('destroyed') instead of taking it.
  createdByPicker?: boolean;
}

export interface StealPickResult {
  cardId: CardId;
  source: 'design' | 'existing';
  outcome: 'taken' | 'destroyed';
  value: number;
}

// Deterministic argmax over candidates: highest value wins; ties prefer the
// design candidate over an existing one, then the lowest cardId.
function pickBestStealCandidate(candidates: StealCandidate[]): StealPickResult {
  if (candidates.length === 0) {
    throw new Error('pickBestStealCandidate: no candidates -- a steal pick always has at least the design.');
  }
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (c.value > best.value) {
      best = c;
      continue;
    }
    if (c.value === best.value) {
      if (best.source === 'existing' && c.source === 'design') {
        best = c;
        continue;
      }
      if (best.source === c.source && c.cardId < best.cardId) {
        best = c;
      }
    }
  }
  return {
    cardId: best.cardId,
    source: best.source,
    outcome: best.source === 'existing' && best.createdByPicker ? 'destroyed' : 'taken',
    value: best.value,
  };
}

// Step 1: the LOSER's forced pick from the winner's design/deck.
export function chooseLoserSteal(ctx: { candidates: StealCandidate[] }): StealPickResult {
  return pickBestStealCandidate(ctx.candidates);
}

// Step 2: the WINNER's forced counter-raid pick from the loser's design/deck
// (minus whatever the loser just took -- the caller excludes it from
// `candidates`). Renamed in spirit from the old "keep-or-steal" winner pick:
// under v3 the winner has no "keep" option here at all, so this is a pure
// argmax, same shape as chooseLoserSteal.
export function chooseWinnerPick(ctx: { candidates: StealCandidate[] }): StealPickResult {
  return pickBestStealCandidate(ctx.candidates);
}

// === chooseKeepOrSteal ===
// The LOSER's actual keep-vs-steal decision. EV(keep) is simply the loser's
// own design value (guaranteed, untouched). EV(steal) is the best value the
// loser can grab in step 1, minus the loss they can expect to eat in step 2
// once the winner counter-raids: the loser's own new design is ALWAYS lost
// (taken outright if the winner picks the design, or destroyed for nothing
// if the winner instead raids an existing card) -- and if the winner picks
// an existing card instead of the design, the loser loses THAT card too
// (taken or destroyed depending who created it), on top of the design.
// `pessimistic: true` (the normal case -- the loser never has final say)
// applies a small extra haircut on top of this already-conservative estimate.
export interface KeepOrStealContext {
  // Value of this seat's own new design -- what KEEP guarantees, and what
  // STEAL guarantees they forfeit.
  ownDesignValue: number;
  // Value of the WINNER's new design -- the step-1 "take the design" option.
  winnerDesignValue: number;
  // Every OTHER card currently in the WINNER's deck -- step-1 "existing"
  // options. `createdByPicker` here means "created by THIS seat (the
  // loser)" -- picking it would execute it instead of taking it.
  winnerDeckCandidates: StealCandidate[];
  // This seat's OWN existing deck (pre-round) -- what the winner's step-2
  // counter-raid can reach if this seat steals. `createdByPicker` here means
  // "created by the WINNER" (step 2's picker) -- taking it would instead
  // execute it.
  ownDeckCandidates: StealCandidate[];
  // When true (the normal case), this seat does not have final say over the
  // step-2 outcome -- a small conservative discount applies on top of the
  // already-pessimistic (worst-of-both) EV(steal) estimate.
  pessimistic?: boolean;
}

// Small conservative haircut applied to EV(steal) beyond its already-
// pessimistic construction, when this seat doesn't have final say over
// EITHER step's actual resolution (the loser sizing up an AI/human winner's
// likely response). Deliberately modest: this is advisory EV, not a hard
// game-state mutation.
const PESSIMISM_DISCOUNT = 1;

export function chooseKeepOrSteal(ctx: KeepOrStealContext): 'keep' | 'steal' {
  const stepOneCandidates: StealCandidate[] = [
    { cardId: '__winner-design__', value: ctx.winnerDesignValue, source: 'design' },
    ...ctx.winnerDeckCandidates,
  ];
  const stepOne = pickBestStealCandidate(stepOneCandidates);

  const counterRaidCandidates: StealCandidate[] = [
    { cardId: '__own-design__', value: ctx.ownDesignValue, source: 'design' },
    ...ctx.ownDeckCandidates,
  ];
  const counterRaid = pickBestStealCandidate(counterRaidCandidates);

  // The design is ALWAYS lost (taken or destroyed); an "existing" counter-
  // raid pick costs the loser that card TOO, on top of the design.
  const step2Loss =
    counterRaid.source === 'design' ? ctx.ownDesignValue : ctx.ownDesignValue + counterRaid.value;

  const evSteal = stepOne.value - step2Loss - (ctx.pessimistic ? PESSIMISM_DISCOUNT : 0);
  const evKeep = ctx.ownDesignValue;
  return evSteal > evKeep ? 'steal' : 'keep';
}

// === answerChoice ===
// Delegates to the source card's strategy.choose if present, else picks
// uniformly at random using the supplied seeded RNG.
export function answerChoice(
  spec: ChoiceSpec<unknown>,
  view: AIGameView,
  effects: ReadonlyMap<CardId, CardEffect>,
  rng: RNG
): ChoiceOption {
  const effect = effects.get(spec.cardId);
  const chooseFn = effect?.strategy?.choose;
  if (chooseFn) return chooseFn(view, spec.options);
  if (spec.options.length === 0) {
    throw new Error(`answerChoice: no options offered for card "${spec.cardId}"`);
  }
  const idx = rng.int(spec.options.length);
  return spec.options[idx];
}

export function createChoiceResponder(
  effects: ReadonlyMap<CardId, CardEffect>,
  rng: RNG
): ChoiceResponder {
  return (spec, view) => answerChoice(spec, view, effects, rng);
}

// Bundles the decision functions above into the PlayerController shape the
// engine's turn loop expects for a given seat. `isLocked` (default: nothing
// is locked) is threaded straight through to chooseCardToPlay.
export function createAIController(
  effects: ReadonlyMap<CardId, CardEffect>,
  rng: RNG,
  winPoints: number = WIN_POINTS,
  isLocked: (cardId: CardId) => boolean = () => false
): PlayerController {
  return {
    chooseCardToPlay: (view) => chooseCardToPlay(view, effects, winPoints, isLocked),
    choiceResponder: createChoiceResponder(effects, rng),
  };
}

// Convenience: build both seats' controllers sharing one effects map, each
// with its own RNG stream (so AI-vs-AI matches stay deterministic per-seed
// without the two seats' random choices interleaving on one shared stream).
export function createDefaultControllers(
  effects: ReadonlyMap<CardId, CardEffect>,
  rngs: Record<PlayerId, RNG>,
  winPoints: number = WIN_POINTS,
  isLocked: (cardId: CardId) => boolean = () => false
): Record<PlayerId, PlayerController> {
  return {
    human: createAIController(effects, rngs.human, winPoints, isLocked),
    claude: createAIController(effects, rngs.claude, winPoints, isLocked),
  };
}
