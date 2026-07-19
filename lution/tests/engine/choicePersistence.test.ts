// M5 choice-point persistence: deterministic single-turn replay (Option B,
// see the approved plan's §5). These tests drive the engine directly (no
// src/ui/app.ts import -- it's DOM-dependent and there is no AppController
// test harness, see .claude/napkin.md's Round 10 note) and reimplement
// app.ts's glue inline: a pre-turn baseline snapshot + the
// recordTurnDecision/onChoiceRecorded rebinding dance, exactly as
// src/ui/app.ts's runInnerGameLoop/recordTurnDecision/flushChoiceRecorded do.
//
// Both tests use the SAME shape of "attempt": build a runtime, seed a board,
// take a pre-turn baseline, attach a pendingTurn (sharing the resolvedChoices
// array between the live state and the baseline, mirroring
// recordTurnDecision), then force that turn's play via runTurn's existing
// `playInstanceId` option -- the same mechanism the real resume path uses.

import { describe, expect, it } from 'vitest';
import cardsJson from '../../data/cards.json';
import type { CardDef, CardId, InnerGameState, PlayerId } from '../../shared/types';
import { createInnerGame, runTurn, WIN_POINTS, type InnerGameRuntime } from '../../src/engine/engine';
import { createEngineApi } from '../../src/engine/api';
import { loadAllEffects, registerEffects } from '../../src/engine/effectsLoader';
import type { CardEffect, ChoiceOption, ChoiceResponder, PlayerController } from '../../src/engine/types';
import { testCardDef, testKeeperEffect } from '../helpers';

const TRIBUNAL: CardId = 'r4-claude-the-hostile-takeover-tribunal';

// --- shared test scaffolding -------------------------------------------

function buildRegistryAndEffects(
  extraRegistry: CardDef[] = [],
  extraEffects: CardEffect[] = []
): { registry: Map<CardId, CardDef>; effects: Map<CardId, CardEffect> } {
  const registryList: CardDef[] = [...(cardsJson as CardDef[]), ...extraRegistry];
  const registry = new Map<CardId, CardDef>(registryList.map((c) => [c.id, c]));
  const effects = loadAllEffects();
  for (const [id, effect] of registerEffects(extraEffects)) {
    effects.set(id, effect);
  }
  return { registry, effects };
}

// runTurn's `playInstanceId` option always forces the play, so the
// controllers' own chooseCardToPlay/choiceResponder are never consulted by
// runTurn itself (choiceResponders are wired separately, into
// createInnerGame/createEngineApi). These stubs exist purely to satisfy the
// PlayerController shape runTurn's signature requires.
function dummyControllers(): Record<PlayerId, PlayerController> {
  const unused: PlayerController = {
    chooseCardToPlay: () => null,
    choiceResponder: () => {
      throw new Error('dummyControllers: choiceResponder should never be invoked directly by runTurn');
    },
  };
  return { human: unused, claude: unused };
}

function neverResponder(seat: PlayerId): ChoiceResponder {
  return () => {
    throw new Error(`neverResponder: unexpected requestChoice call for ${seat} in this scenario`);
  };
}

// Answers `answers` in order, one per call; throws if called more times than
// scripted. `callCount()` lets a test assert exactly how many LIVE calls a
// given attempt made (the crux of proving replay actually skipped the
// recorded ones instead of re-asking).
function makeSequencedResponder(answers: ChoiceOption[]): { responder: ChoiceResponder; callCount: () => number } {
  let n = 0;
  const responder: ChoiceResponder = () => {
    const next = answers[n];
    n += 1;
    if (!next) throw new Error('makeSequencedResponder: ran out of scripted answers');
    return next;
  };
  return { responder, callCount: () => n };
}

// Answers the FIRST call with `firstAnswer`, then throws a sentinel error on
// every subsequent call -- simulates "the process was torn down right after
// recording the first choice, mid-resolution of the second."
const SENTINEL_TEARDOWN = 'SENTINEL_TEARDOWN';
function makeInterruptingResponder(firstAnswer: ChoiceOption): {
  responder: ChoiceResponder;
  callCount: () => number;
} {
  let n = 0;
  const responder: ChoiceResponder = () => {
    n += 1;
    if (n === 1) return firstAnswer;
    throw new Error(SENTINEL_TEARDOWN);
  };
  return { responder, callCount: () => n };
}

// Mirrors src/ui/app.ts's recordTurnDecision: attaches a brand-new pendingTurn
// to BOTH the live state and a separately-held baseline clone, sharing the
// SAME resolvedChoices array reference so every later append is visible
// through the baseline too, without any manual re-copying.
function attachPendingTurn(
  liveState: InnerGameState,
  baseline: InnerGameState,
  instanceId: string | null
): void {
  const resolvedChoices: Array<{ cardId: CardId; optionId: string }> = [];
  liveState.pendingTurn = { instanceId, resolvedChoices };
  baseline.pendingTurn = { instanceId, resolvedChoices };
}

describe('choice-point persistence (M5)', () => {
  it('reconstructing from persisted pendingTurn alone reproduces a bit-identical outcome after a mid-turn interruption (Tribunal, two forced ties)', async () => {
    const extraRegistry = [
      testCardDef('test-mine-tie-1', { createdInRound: 4 }),
      testCardDef('test-mine-tie-2', { createdInRound: 4 }),
      testCardDef('test-theirs-tie-1', { createdInRound: 4 }),
      testCardDef('test-theirs-tie-2', { createdInRound: 4 }),
    ];
    const extraEffects = [
      testKeeperEffect('test-mine-tie-1', 1),
      testKeeperEffect('test-mine-tie-2', 1),
      testKeeperEffect('test-theirs-tie-1', 3),
      testKeeperEffect('test-theirs-tie-2', 3),
    ];
    const { registry, effects } = buildRegistryAndEffects(extraRegistry, extraEffects);

    function buildRuntime(choiceResponders: Record<PlayerId, ChoiceResponder>): InnerGameRuntime {
      return createInnerGame({
        registry,
        effects,
        decks: { human: [], claude: [] },
        seed: 777,
        firstPlayer: 'human',
        choiceResponders,
        hands: { human: [TRIBUNAL], claude: [] },
        shuffleDecks: false,
      });
    }

    function seedBoard(state: InnerGameState): void {
      state.players.human.inPlay.push(
        { instanceId: 'synth-mine-tie-1', cardId: 'test-mine-tie-1' },
        { instanceId: 'synth-mine-tie-2', cardId: 'test-mine-tie-2' }
      );
      state.players.claude.inPlay.push(
        { instanceId: 'synth-theirs-tie-1', cardId: 'test-theirs-tie-1' },
        { instanceId: 'synth-theirs-tie-2', cardId: 'test-theirs-tie-2' }
      );
    }

    // --- Attempt 1: a live run torn down mid-turn, right after the FIRST
    // choice (which keeper to give up) is answered, while resolving the
    // SECOND (which keeper to seize). ---
    const attempt1 = makeInterruptingResponder({ id: 'synth-mine-tie-2' });
    const runtimeA = buildRuntime({ human: attempt1.responder, claude: neverResponder('claude') });
    seedBoard(runtimeA.state);
    const tribunalInstanceId = runtimeA.state.players.human.hand[0].instanceId;

    // Pre-turn baseline (taken BEFORE runTurn is called for this turn) is
    // what a real reload would have persisted -- NOT the post-draw live
    // state, which would double-draw/double-increment turnNumber on resume.
    const baselineA = structuredClone(runtimeA.state);
    attachPendingTurn(runtimeA.state, baselineA, tribunalInstanceId);

    let interruptedError: unknown = null;
    try {
      await runTurn(runtimeA, dummyControllers(), { playInstanceId: tribunalInstanceId });
    } catch (err) {
      interruptedError = err;
    }
    expect((interruptedError as Error)?.message).toBe(SENTINEL_TEARDOWN);
    expect(attempt1.callCount()).toBe(2); // choice 1 answered live, choice 2 attempted (and threw)
    expect(baselineA.pendingTurn?.resolvedChoices).toEqual([{ cardId: TRIBUNAL, optionId: 'synth-mine-tie-2' }]);

    // --- Reconstruct from persisted state alone: a brand-new runtime built
    // straight off a structuredClone of the baseline (severing every
    // in-memory reference back to runtimeA), with a NEW responder pair. ---
    const persisted: InnerGameState = structuredClone(baselineA);
    const attempt2 = makeSequencedResponder([{ id: 'synth-theirs-tie-2' }]);
    const apiB = createEngineApi({
      state: persisted,
      registry,
      effects,
      choiceResponders: { human: attempt2.responder, claude: neverResponder('claude') },
    });
    const runtimeB: InnerGameRuntime = {
      state: persisted,
      api: apiB,
      registry,
      effects,
      winPoints: WIN_POINTS,
      isLocked: () => false,
    };

    await runTurn(runtimeB, dummyControllers(), { playInstanceId: persisted.pendingTurn!.instanceId });
    // The FIRST choice's live responder must NOT be invoked again on
    // reconstruction -- proves the recorded entry was actually replayed, not
    // re-asked. Only the second (previously-unanswered) choice goes live.
    expect(attempt2.callCount()).toBe(1);
    runtimeB.state.pendingTurn = undefined; // mirror runInnerGameLoop's post-turn clear

    // --- Control: a third, single continuous run, uninterrupted, whose
    // responder answers the same two answers directly. ---
    const runtimeC = buildRuntime({
      human: makeSequencedResponder([{ id: 'synth-mine-tie-2' }, { id: 'synth-theirs-tie-2' }]).responder,
      claude: neverResponder('claude'),
    });
    seedBoard(runtimeC.state);
    const tribunalInstanceIdC = runtimeC.state.players.human.hand[0].instanceId;
    await runTurn(runtimeC, dummyControllers(), { playInstanceId: tribunalInstanceIdC });

    // Bit-identical outcome: reconstructed-after-interruption === uninterrupted control.
    expect(runtimeB.state.turnNumber).toBe(runtimeC.state.turnNumber);
    expect(runtimeB.state.players).toEqual(runtimeC.state.players);
    expect(runtimeB.state.log).toEqual(runtimeC.state.log);
    expect(runtimeB.state.effectState).toEqual(runtimeC.state.effectState);
    expect(runtimeB.state.rngState).toBe(runtimeC.state.rngState);
    expect(runtimeB.state.result).toEqual(runtimeC.state.result);
    expect(runtimeB.state.pendingTurn).toBeUndefined();
    expect(runtimeC.state.pendingTurn).toBeUndefined();
  });

  it('discards the WHOLE remaining recording and falls back to live resolution for every subsequent choice when a recorded cardId no longer matches', async () => {
    const SYNTH_CARD_ID: CardId = 'test-two-choice-action';
    const twoChoiceEffect: CardEffect = {
      cardId: SYNTH_CARD_ID,
      cardType: 'action',
      baseValue: 0,
      hooks: {
        onPlay: {
          scope: 'inHand',
          side: 'owner',
          handler: async (ctx) => {
            const first = await ctx.api.requestChoice(ctx.owner, {
              cardId: SYNTH_CARD_ID,
              prompt: 'Choice 1',
              options: [{ id: 'opt-a' }, { id: 'opt-b' }],
            });
            ctx.api.setFlag(SYNTH_CARD_ID, 'first', first.id);
            const second = await ctx.api.requestChoice(ctx.owner, {
              cardId: SYNTH_CARD_ID,
              prompt: 'Choice 2',
              options: [{ id: 'opt-x' }, { id: 'opt-y' }],
            });
            ctx.api.setFlag(SYNTH_CARD_ID, 'second', second.id);
          },
        },
      },
    };
    const { registry, effects } = buildRegistryAndEffects([], [twoChoiceEffect]);

    function buildRuntime(choiceResponders: Record<PlayerId, ChoiceResponder>): InnerGameRuntime {
      return createInnerGame({
        registry,
        effects,
        decks: { human: [], claude: [] },
        seed: 555,
        firstPlayer: 'human',
        choiceResponders,
        hands: { human: [SYNTH_CARD_ID], claude: [] },
        shuffleDecks: false,
      });
    }

    // --- Attempt 1: record one real choice (choice 1), torn down mid-turn
    // resolving choice 2. ---
    const attempt1 = makeInterruptingResponder({ id: 'opt-a' });
    const runtimeA = buildRuntime({ human: attempt1.responder, claude: neverResponder('claude') });
    const cardInstanceId = runtimeA.state.players.human.hand[0].instanceId;

    const baselineA = structuredClone(runtimeA.state);
    attachPendingTurn(runtimeA.state, baselineA, cardInstanceId);

    let interruptedError: unknown = null;
    try {
      await runTurn(runtimeA, dummyControllers(), { playInstanceId: cardInstanceId });
    } catch (err) {
      interruptedError = err;
    }
    expect((interruptedError as Error)?.message).toBe(SENTINEL_TEARDOWN);
    expect(baselineA.pendingTurn?.resolvedChoices).toEqual([{ cardId: SYNTH_CARD_ID, optionId: 'opt-a' }]);

    // Simulate persistence, then corrupt the recorded entry's cardId so it no
    // longer matches the card actually being replayed.
    const persisted: InnerGameState = structuredClone(baselineA);
    persisted.pendingTurn!.resolvedChoices[0].cardId = 'some-other-card-entirely';

    // Reconstruct with a responder that answers BOTH choices live, with
    // DIFFERENT answers than the (corrupted) recording -- proving the
    // outcome is determined by the fallback path, not the discarded entry.
    const attempt2 = makeSequencedResponder([{ id: 'opt-b' }, { id: 'opt-y' }]);
    const apiB = createEngineApi({
      state: persisted,
      registry,
      effects,
      choiceResponders: { human: attempt2.responder, claude: neverResponder('claude') },
    });
    const runtimeB: InnerGameRuntime = {
      state: persisted,
      api: apiB,
      registry,
      effects,
      winPoints: WIN_POINTS,
      isLocked: () => false,
    };

    await runTurn(runtimeB, dummyControllers(), { playInstanceId: persisted.pendingTurn!.instanceId });

    // Both choices went live -- the corrupted entry was discarded outright,
    // never partially trusted (a mismatch on entry 0 must not let entry 1,
    // if any existed, still be replayed).
    expect(attempt2.callCount()).toBe(2);
    expect(persisted.effectState[`${SYNTH_CARD_ID}:first`]).toBe('opt-b');
    expect(persisted.effectState[`${SYNTH_CARD_ID}:second`]).toBe('opt-y');
    // The corrupted entry is GONE (not merely skipped) -- the ledger now
    // holds only the two freshly-made live answers, appended in order, with
    // no trace of the discarded recording.
    expect(persisted.pendingTurn?.resolvedChoices).toEqual([
      { cardId: SYNTH_CARD_ID, optionId: 'opt-b' },
      { cardId: SYNTH_CARD_ID, optionId: 'opt-y' },
    ]);
  });
});
