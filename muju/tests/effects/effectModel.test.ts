import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/ai/simulate';
import { attackEffects, blowEffect, ELEMENT_LOOK, magnitudeFor, MAGNITUDE_SCALE, particleCount, shakeFor, victoryEffect } from '../../src/effects/effectModel';
import { buildScenarioState, playScenario, scenarioById } from '../../src/onboarding/scenarios';
import type { Element } from '../../src/game/types';

const ELEMENTS: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

describe('board effect selection', () => {
  it('derives magnitude from the elemental modifier', () => {
    expect(magnitudeFor('fire', 'plant')).toBe('vulnerable');
    expect(magnitudeFor('plant', 'fire')).toBe('resisted');
    expect(magnitudeFor('fire', 'fire')).toBe('normal');
    expect(magnitudeFor('water', 'fire')).toBe('vulnerable');
    expect(magnitudeFor('metal', 'shadow')).toBe('vulnerable');
  });

  it('gives every element its own look and scales count and shake by magnitude', () => {
    expect(new Set(ELEMENTS.map(e => ELEMENT_LOOK[e].particle)).size).toBe(6);
    for (const element of ELEMENTS) {
      expect(particleCount(element, 'resisted', 'hit')).toBeLessThan(particleCount(element, 'normal', 'hit'));
      expect(particleCount(element, 'normal', 'hit')).toBeLessThan(particleCount(element, 'vulnerable', 'hit'));
      expect(particleCount(element, 'normal', 'kill')).toBeGreaterThan(particleCount(element, 'normal', 'hit'));
    }
    expect(MAGNITUDE_SCALE).toEqual({ resisted: .6, normal: 1, vulnerable: 1.6 });
    expect(shakeFor('resisted', 'hit')).toBe(0);
    expect(shakeFor('vulnerable', 'kill')).toBeGreaterThan(shakeFor('normal', 'kill'));
  });

  it('reports a kill between two rendered boards, and nothing for an undo', () => {
    const hono = scenarioById('hono')!;
    const { frames } = playScenario(hono);
    const before = frames.at(-2)!.board, after = frames.at(-1)!.board;
    expect(attackEffects(before, after)).toEqual([{ kind: 'kill', x: 4, y: 4, attackerElement: 'fire', magnitude: 'vulnerable', defenderOwner: 'black' }]);
    expect(attackEffects(after, before)).toEqual([]);
    expect(attackEffects(before, before)).toEqual([]);
  });

  it('reports a surviving hit as a hit at the resisted magnitude', () => {
    const state = buildScenarioState(scenarioById('hono')!);
    const prey = state.board.units.find(u => u.owner === 'black')!;
    const attacker = { ...state.board.units.find(u => u.id.endsWith('hono'))!, definitionId: 'plant_2', position: { x: 4, y: 3 } };
    expect(blowEffect(attacker, prey, 'hit')).toMatchObject({ kind: 'hit', magnitude: 'normal', attackerElement: 'plant' });
    expect(blowEffect({ definitionId: 'plant_1' }, { ...prey, definitionId: 'fire_1' }, 'hit').magnitude).toBe('resisted');
  });

  it('celebrates a home checkmate on the invaded home only when it happens', () => {
    const irumbu = scenarioById('irumbu')!;
    const invaded = playScenario(irumbu).frames.at(-1)!;
    const won = applyAction(invaded, { type: 'END_ACTION_PHASE' });
    expect(victoryEffect(invaded, won)).toEqual({ kind: 'checkmate', x: 9, y: 9, winner: 'white' });
    expect(victoryEffect(won, won)).toBeNull();
  });
});
