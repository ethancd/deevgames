// Behavioral tests for the composition interpreter, through createTestGame
// -- one scenario per atom/mechanic named in the M1 plan's §4.2, several
// combined into richer scenarios where that mirrors how the real modules
// combine atoms.

import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect, testActionEffect } from '../helpers';
import { compileComposition } from '../../src/engine/compileComposition';
import type { CardComposition } from '../../shared/atoms';
import { createInnerGame, resolvePlay } from '../../src/engine/engine';
import { registerEffects } from '../../src/engine/effectsLoader';
import type { CardDef, CardId } from '../../shared/types';
import type { ChoiceOption, ChoiceSpec } from '../../src/engine/types';

describe('compileComposition', () => {
  it('a composed keeper scores from baseValue alone (no hooks)', async () => {
    const composition: CardComposition = { cardType: 'keeper', baseValue: 2, effects: [] };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-plain-keeper')],
      extraEffects: [compileComposition('test-plain-keeper', composition)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-plain-keeper'] },
    });

    expect(await game.score('human')).toBe(0);
    await game.play('test-plain-keeper');
    expect(await game.score('human')).toBe(2);
  });

  it('scoreDelta with count() matches the real keeper-count dynamic-scoring pattern', async () => {
    const composition: CardComposition = {
      cardType: 'keeper',
      baseValue: 0,
      effects: [],
      scoreDelta: { type: 'count', selector: { zone: 'inPlay', owner: 'any', pick: 'all' } },
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-uniter-alike'), testCardDef('test-filler-keeper')],
      extraEffects: [compileComposition('test-uniter-alike', composition), testKeeperEffect('test-filler-keeper', 1)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-uniter-alike'], claude: ['test-filler-keeper'] },
    });

    await game.play('test-uniter-alike');
    expect(await game.score('human')).toBe(1); // itself is the only keeper in play

    await resolvePlay(game.runtime, 'claude', game.state().players.claude.hand[0].instanceId);
    expect(await game.score('human')).toBe(2); // now 2 keepers total in play, worth 1 each to the Uniter-alike
  });

  it('freezeInPlay respects the existing keeper-freeze-immunity primitive', async () => {
    const freezeAllComposition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            atom: 'freezeInPlay',
            selector: { zone: 'inPlay', owner: 'any', pick: 'all' },
            to: { type: 'literal', value: 1 },
          },
        },
      ],
    };
    const game = createTestGame({
      extraRegistry: [
        testCardDef('test-freeze-all-alike'),
        testCardDef('test-big-keeper-h'),
        testCardDef('test-big-keeper-c'),
      ],
      extraEffects: [
        compileComposition('test-freeze-all-alike', freezeAllComposition),
        testKeeperEffect('test-big-keeper-h', 5),
        testKeeperEffect('test-big-keeper-c', 5),
      ],
      decks: { human: [], claude: [] },
      hands: { human: ['test-freeze-all-alike', 'test-big-keeper-h'], claude: ['test-big-keeper-c'] },
    });

    await game.play('test-big-keeper-h');
    await resolvePlay(game.runtime, 'claude', game.state().players.claude.hand[0].instanceId);

    game.api.grantKeeperFreezeImmunity('human');
    await game.play('test-freeze-all-alike');

    expect(await game.score('human')).toBe(5); // immune -- untouched
    expect(await game.score('claude')).toBe(1); // flattened to 1
  });

  it('a chooser selector drives requestChoice with labeled options (getCardName, not raw ids)', async () => {
    const discardComposition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            atom: 'discard',
            selector: { zone: 'hand', owner: 'opponent', pick: 'chooser', chooser: 'opponent' },
          },
        },
      ],
    };

    const registry = new Map<CardId, CardDef>([
      ['test-chooser-discard', testCardDef('test-chooser-discard')],
      ['test-target-alpha', testCardDef('test-target-alpha', { name: 'Alpha Card' })],
      ['test-target-beta', testCardDef('test-target-beta', { name: 'Beta Card' })],
    ]);
    const effects = registerEffects([
      compileComposition('test-chooser-discard', discardComposition),
      testKeeperEffect('test-target-alpha', 1),
      testKeeperEffect('test-target-beta', 1),
    ]);

    let capturedOptions: ChoiceOption[] = [];
    const choiceResponders = {
      human: (spec: ChoiceSpec<unknown>) => spec.options[0] as ChoiceOption,
      claude: (spec: ChoiceSpec<unknown>) => {
        capturedOptions = spec.options;
        return spec.options[0] as ChoiceOption;
      },
    };

    const runtime = createInnerGame({
      registry,
      effects,
      decks: { human: [], claude: [] },
      seed: 1,
      firstPlayer: 'human',
      choiceResponders,
      hands: { human: ['test-chooser-discard'], claude: ['test-target-alpha', 'test-target-beta'] },
      shuffleDecks: false,
    });

    await resolvePlay(runtime, 'human', runtime.state.players.human.hand[0].instanceId);

    expect(capturedOptions).toHaveLength(2);
    for (const option of capturedOptions) {
      expect(typeof option.label).toBe('string');
      expect((option.label as string).length).toBeGreaterThan(0);
      expect(option.label).toBe(runtime.api.getCardName(option.cardId as string));
      expect(option.label).not.toBe(option.id);
    }
  });

  it("counters compound turn over turn on the owner's turns only, and reset when the card leaves play", async () => {
    const compoundComposition: CardComposition = {
      cardType: 'keeper',
      baseValue: 1,
      effects: [
        { trigger: 'onTurnStart', body: { atom: 'incrementCounter', name: 'bonus' } },
        { trigger: 'onLeavePlay', body: { atom: 'setCounter', name: 'bonus', value: { type: 'literal', value: 0 } } },
      ],
      scoreDelta: { type: 'counter', name: 'bonus' },
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-compound-keeper')],
      extraEffects: [compileComposition('test-compound-keeper', compoundComposition)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-compound-keeper'] },
    });

    const instanceId = game.state().players.human.hand[0].instanceId;
    await resolvePlay(game.runtime, 'human', instanceId);
    expect(await game.score('human')).toBe(1);

    await game.runTurn({ playInstanceId: null }); // human's turn: bonus -> 1
    expect(await game.score('human')).toBe(2);

    await game.runTurn({ playInstanceId: null }); // claude's turn: no change
    expect(await game.score('human')).toBe(2);

    await game.runTurn({ playInstanceId: null }); // human's turn again: bonus -> 2
    expect(await game.score('human')).toBe(3);

    await game.api.destroyKeeper('human', instanceId);
    await game.api.moveToHand(instanceId);
    await resolvePlay(game.runtime, 'human', instanceId);
    expect(await game.score('human')).toBe(1); // reset, not resumed at 2
  });

  it('conditions gate: draws only when strictly behind on keepers, only on the opponent\'s turn', async () => {
    const auditComposition: CardComposition = {
      cardType: 'keeper',
      baseValue: 1,
      effects: [
        {
          trigger: 'onTurnStart',
          side: 'opponent',
          body: {
            type: 'if',
            condition: {
              type: 'compare',
              left: { type: 'count', selector: { zone: 'inPlay', owner: 'opponent', pick: 'all' } },
              op: '>',
              right: { type: 'count', selector: { zone: 'inPlay', owner: 'self', pick: 'all' } },
            },
            then: { atom: 'draw', target: 'self', count: { type: 'literal', value: 1 } },
          },
        },
      ],
    };

    const game = createTestGame({
      extraRegistry: [
        testCardDef('test-audit-alike'),
        testCardDef('test-filler-a'),
        testCardDef('test-filler-b'),
      ],
      extraEffects: [
        compileComposition('test-audit-alike', auditComposition),
        testKeeperEffect('test-filler-a', 1),
        testKeeperEffect('test-filler-b', 1),
      ],
      decks: { human: ['test-filler-a', 'test-filler-b'], claude: [] },
      hands: { human: ['test-audit-alike'], claude: ['test-filler-a', 'test-filler-b'] },
      firstPlayer: 'claude',
    });

    // human's Audit-alike enters play (count(human)=1).
    await resolvePlay(game.runtime, 'human', game.state().players.human.hand[0].instanceId);
    // claude plays two keepers (count(claude)=2).
    await resolvePlay(game.runtime, 'claude', game.state().players.claude.hand[0].instanceId);
    await resolvePlay(game.runtime, 'claude', game.state().players.claude.hand[0].instanceId);

    const handSizeBefore = game.state().players.human.hand.length;
    await game.runTurn({ playInstanceId: null }); // claude's turn: 2 > 1 -> draw fires
    expect(game.state().players.human.hand.length).toBe(handSizeBefore + 1);

    // Equalize keeper counts (destroy one of claude's keepers) so the
    // condition no longer holds.
    const claudeKeeperId = game.state().players.claude.inPlay[0].instanceId;
    await game.api.destroyKeeper('claude', claudeKeeperId);

    await game.runTurn({ playInstanceId: null }); // human's own turn: side:'opponent' never fires for the owner
    const handSizeBeforeSecondClaudeTurn = game.state().players.human.hand.length;
    await game.runTurn({ playInstanceId: null }); // claude's turn again: 1 vs 1 -> condition false, no draw
    expect(game.state().players.human.hand.length).toBe(handSizeBeforeSecondClaudeTurn);
  });

  it('forceWin ends the game immediately; a second forced win never overrides the first', async () => {
    const forceWinComposition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'forceWin', winner: 'self' } }],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-force-win')],
      extraEffects: [compileComposition('test-force-win', forceWinComposition)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-force-win'], claude: ['test-force-win'] },
    });

    await game.play('test-force-win');
    expect(game.state().result).toEqual({ outcome: 'win', winner: 'human' });

    // onPlay's side:'owner' default is matched against the EVENT's
    // activePlayer (state.activePlayer at emit time), not just whichever
    // playerId resolvePlay is called with -- flip it to 'claude' so
    // claude's own copy's onPlay hook actually fires here, truly exercising
    // forceWin's "first result wins" no-op through the composed atom
    // (rather than the hook silently never firing at all).
    game.state().activePlayer = 'claude';
    await resolvePlay(game.runtime, 'claude', game.state().players.claude.hand[0].instanceId);
    expect(game.state().result).toEqual({ outcome: 'win', winner: 'human' }); // unchanged -- first result wins
  });

  it('tutorAndPlay plays a card straight from the deck without visiting hand; combined with freezeInHand it also locks the rest of hand', async () => {
    const rimePortalAlike: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            type: 'seq',
            steps: [
              { atom: 'freezeInHand', selector: { zone: 'hand', owner: 'self', pick: 'all' } },
              { atom: 'tutorAndPlay', selector: { zone: 'drawPile', owner: 'self', pick: 'chooser', chooser: 'self' } },
            ],
          },
        },
      ],
    };

    const game = createTestGame({
      extraRegistry: [
        testCardDef('test-rime-alike'),
        testCardDef('test-tutor-target'),
        testCardDef('test-held-card'),
      ],
      extraEffects: [
        compileComposition('test-rime-alike', rimePortalAlike),
        testKeeperEffect('test-tutor-target', 3),
        testKeeperEffect('test-held-card', 1),
      ],
      decks: { human: ['test-tutor-target'], claude: [] },
      hands: { human: ['test-rime-alike', 'test-held-card'] },
    });

    const heldInstanceId = game.state().players.human.hand.find((i) => i.cardId === 'test-held-card')!.instanceId;

    await game.play('test-rime-alike');

    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-tutor-target']);
    expect(game.state().players.human.drawPile).toHaveLength(0);
    expect(await game.score('human')).toBe(3);

    expect(game.api.isHandCardFrozen(heldInstanceId)).toBe(true);
    await expect(resolvePlay(game.runtime, 'human', heldInstanceId)).rejects.toThrow(/frozen/i);
  });

  it('the auto self-guard on onEnterPlay/onLeavePlay: an unrelated card entering/leaving play never re-fires the guarded hook', async () => {
    const vaultAlike: CardComposition = {
      cardType: 'keeper',
      baseValue: 1,
      effects: [{ trigger: 'onEnterPlay', body: { atom: 'grantImmunity', kind: 'freeze', target: 'self' } }],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-vault-alike'), testCardDef('test-other-keeper')],
      extraEffects: [compileComposition('test-vault-alike', vaultAlike), testKeeperEffect('test-other-keeper', 2)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-vault-alike', 'test-other-keeper'] },
    });

    await game.play('test-vault-alike');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(true);

    // Playing an unrelated second keeper must NOT re-fire the vault's guard
    // and inflate the immunity refcount.
    await game.play('test-other-keeper');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(true);

    const otherInstanceId = game.state().players.human.inPlay.find((i) => i.cardId === 'test-other-keeper')!.instanceId;
    await game.api.destroyKeeper('human', otherInstanceId);
    // A single destroy of the UNRELATED keeper must not bring the vault's
    // immunity count back to 0 -- exactly the regression the self-guard
    // prevents (see r7-claude-the-adiabatic-escrow-vault.ts's own comment).
    expect(game.api.isKeeperFreezeImmune('human')).toBe(true);

    const vaultInstanceId = game.state().players.human.inPlay.find((i) => i.cardId === 'test-vault-alike')!.instanceId;
    await game.api.destroyKeeper('human', vaultInstanceId);
    expect(game.api.isKeeperFreezeImmune('human')).toBe(false);
  });

  it('the auto self-guard on onBeforeDestroy: destroying one bounce-alike does not also bounce an unrelated copy', async () => {
    const refundAlike: CardComposition = {
      cardType: 'keeper',
      baseValue: 1,
      effects: [{ trigger: 'onBeforeDestroy', body: { atom: 'bounceToHand' } }],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-refund-alike')],
      extraEffects: [compileComposition('test-refund-alike', refundAlike)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-refund-alike', 'test-refund-alike'] },
    });

    await game.play('test-refund-alike');
    await resolvePlay(game.runtime, 'human', game.state().players.human.hand[0].instanceId);
    expect(game.state().players.human.inPlay).toHaveLength(2);

    const [firstId, secondId] = game.state().players.human.inPlay.map((i) => i.instanceId);
    await game.api.destroyKeeper('human', firstId);

    // The destroyed instance bounced back to hand (destroy cancelled); the
    // OTHER instance must remain untouched in play.
    expect(game.state().players.human.hand.map((i) => i.instanceId)).toEqual([firstId]);
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([secondId]);
  });

  function frostPactAlikeComposition(): CardComposition {
    return {
      cardType: 'keeper',
      baseValue: 0,
      effects: [
        {
          trigger: 'onEnterPlay',
          body: {
            type: 'seq',
            steps: [
              { atom: 'freezeInHand', selector: { zone: 'hand', owner: 'self', pick: 'chooser', chooser: 'self' }, bindAs: 'own' },
              { atom: 'freezeInHand', selector: { zone: 'hand', owner: 'opponent', pick: 'random' }, bindAs: 'opp' },
              {
                atom: 'setBaseValueOverride',
                selector: { zone: 'inPlay', owner: 'self', pick: 'self' },
                value: {
                  type: 'add',
                  values: [
                    { type: 'boundCardValue', bindAs: 'own' },
                    { type: 'boundCardValue', bindAs: 'opp' },
                  ],
                },
              },
            ],
          },
        },
      ],
    };
  }

  it('boundCardValue/bindAs: a Frost-Pact-alike scores the sum of what it froze (keeper baseValue vs action flat 1)', async () => {
    const game = createTestGame({
      extraRegistry: [
        testCardDef('test-frost-alike'),
        testCardDef('test-owner-fodder'),
        testCardDef('test-opp-fodder'),
      ],
      extraEffects: [
        compileComposition('test-frost-alike', frostPactAlikeComposition()),
        testKeeperEffect('test-owner-fodder', 2),
        testActionEffect('test-opp-fodder'),
      ],
      decks: { human: [], claude: [] },
      hands: { human: ['test-frost-alike', 'test-owner-fodder'], claude: ['test-opp-fodder'] },
    });

    await game.play('test-frost-alike');

    expect(await game.score('human')).toBe(3); // 2 (keeper) + 1 (action flat contribution)

    const ownFrozenId = game.state().players.human.hand.find((i) => i.cardId === 'test-owner-fodder')!.instanceId;
    const oppFrozenId = game.state().players.claude.hand.find((i) => i.cardId === 'test-opp-fodder')!.instanceId;
    expect(game.api.isHandCardFrozen(ownFrozenId)).toBe(true);
    expect(game.api.isHandCardFrozen(oppFrozenId)).toBe(true);
  });

  it('boundCardValue falls back to 0 on the zero-candidate edge case (nothing to freeze on either side)', async () => {
    const game = createTestGame({
      extraRegistry: [testCardDef('test-frost-empty')],
      extraEffects: [compileComposition('test-frost-empty', frostPactAlikeComposition())],
      decks: { human: [], claude: [] },
      hands: { human: ['test-frost-empty'] },
    });

    await game.play('test-frost-empty');
    expect(await game.score('human')).toBe(0);
  });

  it('changeController swap (Hostile-Takeover-Tribunal-alike): ties broken by the chooser, both sides actually swap', async () => {
    const tribunalAlike: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            type: 'seq',
            steps: [
              {
                atom: 'changeController',
                selector: { zone: 'inPlay', owner: 'self', pick: 'minValue', chooser: 'self' },
                to: 'opponent',
              },
              {
                atom: 'changeController',
                selector: { zone: 'inPlay', owner: 'opponent', pick: 'maxValue', chooser: 'self' },
                to: 'self',
              },
            ],
          },
        },
      ],
    };

    const game = createTestGame({
      extraRegistry: [
        testCardDef('test-tribunal-alike'),
        testCardDef('test-min-keeper'),
        testCardDef('test-max-keeper'),
      ],
      extraEffects: [
        compileComposition('test-tribunal-alike', tribunalAlike),
        testKeeperEffect('test-min-keeper', 1),
        testKeeperEffect('test-max-keeper', 3),
      ],
      decks: { human: [], claude: [] },
      hands: {
        human: ['test-tribunal-alike', 'test-min-keeper', 'test-min-keeper'],
        claude: ['test-max-keeper', 'test-max-keeper'],
      },
    });

    await game.play('test-min-keeper');
    await game.play('test-min-keeper');
    const firstMinId = game.state().players.human.inPlay[0].instanceId;

    await resolvePlay(game.runtime, 'claude', game.state().players.claude.hand[0].instanceId);
    await resolvePlay(game.runtime, 'claude', game.state().players.claude.hand[0].instanceId);
    const firstMaxId = game.state().players.claude.inPlay[0].instanceId;

    await game.play('test-tribunal-alike');

    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toContain(firstMinId);
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toContain(firstMaxId);
    expect(await game.score('human')).toBe(4); // remaining min-keeper (1) + seized max-keeper (3)
    expect(await game.score('claude')).toBe(4); // remaining max-keeper (3) + seized min-keeper (1)
  });

  it('grantExtraTurn and skipNextDraw flip the underlying PlayerState flags', async () => {
    // Two SEPARATE games -- onPlay is deliberately not self-guarded (per
    // the plan's §2.2 scope/side table), matching every real onPlay-hooked
    // module: dispatchHooks broadcasts onPlay to every scope:'inHand' card
    // that declares it, so two such cards sitting in the same hand at once
    // would both fire when either is played. That's an existing engine
    // behavior, not something to paper over here -- keep each atom's own
    // card alone in hand instead.
    const extraTurnComposition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'grantExtraTurn', target: 'self' } }],
    };
    const extraTurnGame = createTestGame({
      extraRegistry: [testCardDef('test-extra-turn')],
      extraEffects: [compileComposition('test-extra-turn', extraTurnComposition)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-extra-turn'] },
    });

    expect(extraTurnGame.state().players.human.extraTurns).toBe(0);
    await extraTurnGame.play('test-extra-turn');
    expect(extraTurnGame.state().players.human.extraTurns).toBe(1);

    const skipDrawComposition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'skipNextDraw', target: 'opponent' } }],
    };
    const skipDrawGame = createTestGame({
      extraRegistry: [testCardDef('test-skip-draw')],
      extraEffects: [compileComposition('test-skip-draw', skipDrawComposition)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-skip-draw'] },
    });

    expect(skipDrawGame.state().players.claude.skipNextDraw).toBe(false);
    await skipDrawGame.play('test-skip-draw');
    expect(skipDrawGame.state().players.claude.skipNextDraw).toBe(true);
  });

  // === log atom ===

  it('log atom renders {owner}/{card}/{target}, using the most recently resolved selector as {target}', async () => {
    const composition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            type: 'seq',
            steps: [
              {
                atom: 'destroy',
                selector: { zone: 'inPlay', owner: 'opponent', pick: 'maxValue', chooser: 'opponent' },
              },
              { atom: 'log', message: "{owner}'s {card} destroys {target}!" },
            ],
          },
        },
      ],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-log-alike'), testCardDef('test-log-target', { name: 'Doomed Keeper' })],
      extraEffects: [compileComposition('test-log-alike', composition), testKeeperEffect('test-log-target', 2)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-log-alike'], claude: [] },
    });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-log-target', cardId: 'test-log-target' });

    await game.play('test-log-alike');

    const entry = game.state().log.find((e) => e.type === 'flavor' && e.message.includes('destroys'));
    expect(entry).toBeDefined();
    expect(entry!.message).toContain('human');
    expect(entry!.message).toContain('Doomed Keeper');
    expect(game.state().players.claude.inPlay).toHaveLength(0);
  });

  it('log atom renders {target} as "(nothing)" when no selector-driven atom has resolved yet this body', async () => {
    const composition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'log', message: 'Nothing to see here: {target}.' } }],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-log-empty')],
      extraEffects: [compileComposition('test-log-empty', composition)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-log-empty'] },
    });

    await game.play('test-log-empty');

    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message === 'Nothing to see here: (nothing).')
    ).toBe(true);
  });

  it("log's {target} binding does not leak across two SEPARATE plays of the same card (resets each body execution)", async () => {
    const composition: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            type: 'if',
            condition: { type: 'selectorNonEmpty', selector: { zone: 'inPlay', owner: 'opponent', pick: 'all' } },
            then: {
              type: 'seq',
              steps: [
                { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick: 'maxValue', chooser: 'opponent' } },
                { atom: 'log', message: 'destroyed {target}' },
              ],
            },
            else: { atom: 'log', message: 'nothing to destroy: {target}' },
          },
        },
      ],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-log-reset'), testCardDef('test-log-victim', { name: 'Victim' })],
      extraEffects: [compileComposition('test-log-reset', composition), testKeeperEffect('test-log-victim', 1)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-log-reset', 'test-log-reset'], claude: [] },
    });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-victim', cardId: 'test-log-victim' });

    // First play: destroys claude's only keeper, {target} binds to "Victim".
    await resolvePlay(game.runtime, 'human', game.state().players.human.hand[0].instanceId);
    expect(game.state().log.some((e) => e.message === 'destroyed Victim')).toBe(true);

    // Second play: opponent's board is now empty, so the `else` branch fires
    // -- {target} must NOT still show "Victim" from the previous play.
    await resolvePlay(game.runtime, 'human', game.state().players.human.hand[0].instanceId);
    expect(game.state().log.some((e) => e.message === 'nothing to destroy: (nothing)')).toBe(true);
  });

  // === snapshot semantics ===

  it('FIXES the Tribunal self-cancellation bug: the second changeController cannot pick back what the first just moved', async () => {
    const tribunalAlike: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            type: 'seq',
            steps: [
              {
                atom: 'changeController',
                selector: { zone: 'inPlay', owner: 'self', pick: 'minValue', chooser: 'self' },
                to: 'opponent',
              },
              {
                atom: 'changeController',
                selector: { zone: 'inPlay', owner: 'opponent', pick: 'maxValue', chooser: 'self' },
                to: 'self',
              },
            ],
          },
        },
      ],
    };

    const game = createTestGame({
      extraRegistry: [
        testCardDef('test-tribunal-snapshot'),
        testCardDef('test-mine-big'),
        testCardDef('test-theirs-small'),
      ],
      extraEffects: [
        compileComposition('test-tribunal-snapshot', tribunalAlike),
        testKeeperEffect('test-mine-big', 5),
        testKeeperEffect('test-theirs-small', 2),
      ],
      decks: { human: [], claude: [] },
      hands: { human: ['test-tribunal-snapshot'], claude: [] },
    });

    // Owner has exactly ONE keeper (worth 5) -- it's trivially both the min
    // AND, once moved, the highest-valued card on the opponent's board.
    // Opponent has exactly ONE keeper (worth 2) -- the real target. Under the
    // OLD live-state bug, step 2's "opponent's most valuable keeper" would be
    // recomputed AFTER step 1 already moved the 5-worth card onto the
    // opponent's board, picking that just-transferred 5-worth card right
    // back (a self-cancelling no-op swap). Snapshot semantics must prevent
    // that.
    game.state().players.human.inPlay.push({ instanceId: 'synth-mine-big', cardId: 'test-mine-big' });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-theirs-small', cardId: 'test-theirs-small' });

    await game.play('test-tribunal-snapshot');

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs-small']);
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-mine-big']);
  });

  it('a snapshotted candidate that vanishes mid-body is skipped with a flavor log, never crashes', async () => {
    const doubleDestroy: CardComposition = {
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            type: 'seq',
            steps: [
              { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick: 'all' } },
              // Resolved against the SAME pre-body snapshot as the first
              // destroy (still lists the card) -- but by the time this one
              // tries to mutate, the card is already gone.
              { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick: 'all' } },
            ],
          },
        },
      ],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-double-destroy'), testCardDef('test-fragile', { name: 'Fragile Keeper' })],
      extraEffects: [compileComposition('test-double-destroy', doubleDestroy), testKeeperEffect('test-fragile', 1)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-double-destroy'], claude: [] },
    });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-fragile', cardId: 'test-fragile' });

    // Must not throw despite the second destroy's candidate no longer
    // existing by the time it runs.
    const result = await game.play('test-double-destroy');
    expect(result).toEqual({ passed: false, cancelled: false });

    expect(game.state().players.claude.inPlay).toHaveLength(0);
    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message.includes('Fragile Keeper') && e.message.includes('no longer there'))
    ).toBe(true);
  });

  // === derived numeric strategy hints + explicit overrides ===

  interface AIGameViewLike {
    self: 'human';
    opponent: 'claude';
    state: unknown;
    score: (player: 'human' | 'claude') => number;
  }

  function view(overrides: { selfInPlay?: number[]; opponentInPlay?: number[] } = {}): AIGameViewLike {
    const selfInPlay = (overrides.selfInPlay ?? []).map((_v, i) => ({ instanceId: `s${i}`, cardId: `s${i}` }));
    const opponentInPlay = (overrides.opponentInPlay ?? []).map((_v, i) => ({ instanceId: `o${i}`, cardId: `o${i}` }));
    const selfTotal = (overrides.selfInPlay ?? []).reduce((a, b) => a + b, 0);
    const opponentTotal = (overrides.opponentInPlay ?? []).reduce((a, b) => a + b, 0);
    return {
      self: 'human',
      opponent: 'claude',
      state: {
        players: {
          human: { hand: [], inPlay: selfInPlay, discard: [], drawPile: [] },
          claude: { hand: [], inPlay: opponentInPlay, discard: [], drawPile: [] },
        },
      } as never,
      score: (player: 'human' | 'claude') => (player === 'human' ? selfTotal : opponentTotal),
    };
  }

  describe('derived playValue/stealTargetValue + explicit strategy overrides', () => {

    it('derives a positive playValue above the flat fallback for a destroy-opponent action', () => {
      const composition: CardComposition = {
        cardType: 'action',
        baseValue: 0,
        effects: [
          {
            trigger: 'onPlay',
            body: { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick: 'maxValue', chooser: 'self' } },
          },
        ],
      };
      const effect = compileComposition('test-derive-destroy', composition);
      expect(typeof effect.strategy?.playValue).toBe('function');
      const playValue = effect.strategy!.playValue as (v: AIGameViewLike) => number;
      const resolved = playValue(view({ opponentInPlay: [4] }));
      // Baseline "no hint" fallback (baseValue || 1) would be 1 -- the
      // derived estimate for removing a 4-worth opponent keeper must clear
      // that comfortably.
      expect(resolved).toBeGreaterThan(1);
    });

    it('derives stealTargetValue of exactly 0 for an action composition (no override)', () => {
      const composition: CardComposition = {
        cardType: 'action',
        baseValue: 0,
        effects: [{ trigger: 'onPlay', body: { atom: 'draw', target: 'self' } }],
      };
      const effect = compileComposition('test-derive-action-steal', composition);
      expect(effect.strategy?.stealTargetValue).toBe(0);
    });

    it('derives a keeper stealTargetValue that grows with baseValue', () => {
      const lowComposition: CardComposition = { cardType: 'keeper', baseValue: 1, effects: [] };
      const highComposition: CardComposition = { cardType: 'keeper', baseValue: 6, effects: [] };
      const lowEffect = compileComposition('test-derive-low', lowComposition);
      const highEffect = compileComposition('test-derive-high', highComposition);
      const lowFn = lowEffect.strategy!.stealTargetValue as (v: AIGameViewLike) => number;
      const highFn = highEffect.strategy!.stealTargetValue as (v: AIGameViewLike) => number;
      expect(highFn(view({}))).toBeGreaterThan(lowFn(view({})));
    });

    it('a composed forceWin(self) action derives a dominant playValue (the load-bearing fix)', () => {
      const composition: CardComposition = {
        cardType: 'action',
        baseValue: 0,
        effects: [{ trigger: 'onPlay', body: { atom: 'forceWin', winner: 'self' } }],
      };
      const effect = compileComposition('test-derive-force-win', composition);
      const playValue = effect.strategy!.playValue as (v: AIGameViewLike) => number;
      expect(playValue(view({}))).toBeGreaterThan(100);
    });

    it('an explicit strategy.playValue override wins over whatever the atoms would derive', () => {
      const composition: CardComposition = {
        cardType: 'action',
        baseValue: 0,
        effects: [{ trigger: 'onPlay', body: { atom: 'draw', target: 'self' } }],
        strategy: { playValue: 1_000_000 },
      };
      const effect = compileComposition('test-derive-override', composition);
      // A plain constant, not re-derived per-view.
      expect(effect.strategy?.playValue).toBe(1_000_000);
    });

    it('an explicit strategy.stealTargetValue override wins even for an action (which would otherwise default to 0)', () => {
      const composition: CardComposition = {
        cardType: 'action',
        baseValue: 0,
        effects: [],
        strategy: { stealTargetValue: 7 },
      };
      const effect = compileComposition('test-derive-override-steal', composition);
      expect(effect.strategy?.stealTargetValue).toBe(7);
    });
  });

  it('cancelDestroy aborts destruction with no relocation; the card never reaches discard', async () => {
    const cancelComposition: CardComposition = {
      cardType: 'keeper',
      baseValue: 1,
      effects: [{ trigger: 'onBeforeDestroy', body: { atom: 'cancelDestroy' } }],
    };
    const game = createTestGame({
      extraRegistry: [testCardDef('test-cancel-alike')],
      extraEffects: [compileComposition('test-cancel-alike', cancelComposition)],
      decks: { human: [], claude: [] },
      hands: { human: ['test-cancel-alike'] },
    });

    await game.play('test-cancel-alike');
    const instanceId = game.state().players.human.inPlay[0].instanceId;
    await game.api.destroyKeeper('human', instanceId);

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([instanceId]);
    expect(game.state().players.human.discard).toHaveLength(0);
  });
});
