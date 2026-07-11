import { describe, expect, it } from 'vitest';
import { checkReflex, interruptTriggered } from './reflexes';
import { COLLAPSE_FUEL_THRESHOLD, FLARE_ACTIVATION_THRESHOLD } from './constants';
import { freshLog, makeBody, makeCtx, makeWorld } from './testUtils';

describe('checkReflex', () => {
  it('collapse: forces rest-in-place when fuel <= threshold', () => {
    const log = freshLog();
    const body = makeBody({ fuel: COLLAPSE_FUEL_THRESHOLD });
    const ctx = makeCtx({ body, log, tick: 5 });
    const intent = checkReflex(ctx);
    expect(intent).not.toBeNull();
    expect(intent?.goal).toBe('reflex:collapse');
    expect(intent?.skill).toBe('rest');
    expect(log.byTopic('reflex.collapse').length).toBe(1);
    expect(log.byTopic('reflex.collapse')[0].tick).toBe(5);
  });

  it('does not fire collapse just above the threshold', () => {
    const body = makeBody({ fuel: COLLAPSE_FUEL_THRESHOLD + 0.05 });
    const ctx = makeCtx({ body });
    expect(checkReflex(ctx)).toBeNull();
  });

  it('flinch: adjacent attacking wolf triggers a one-tile step away, emits reflex.flinch', () => {
    const world = makeWorld({
      ember: { pos: { x: 5, y: 5 } },
      wolf: { pos: { x: 5, y: 4 }, state: 'ATTACK', stateTicks: 3 },
    });
    const log = freshLog();
    const body = makeBody({ activation: 0.2 }); // below flare threshold
    const ctx = makeCtx({ world, body, log, tick: 10 });

    const intent = checkReflex(ctx);
    expect(intent).not.toBeNull();
    expect(intent?.goal).toBe('reflex:flinch');
    expect(intent?.skill).toBe('move_to');
    const dest = intent?.params.dest as { x: number; y: number };
    // Stepping away from a wolf to the north should move south (or stay put
    // only if nothing improves distance, which isn't the case here).
    expect(dest.y).toBeGreaterThanOrEqual(5);
    expect(log.byTopic('reflex.flinch').length).toBe(1);
  });

  it('flare: attacked while activation is high emits reflex.flare and a wait(flare) intent, preempting flinch', () => {
    const world = makeWorld({
      ember: { pos: { x: 5, y: 5 } },
      wolf: { pos: { x: 5, y: 4 }, state: 'ATTACK', stateTicks: 3 },
    });
    const log = freshLog();
    log.append({ tick: 10, topic: 'world.wolf.attack', payload: { damage: 0.12 } });
    const body = makeBody({ activation: FLARE_ACTIVATION_THRESHOLD + 0.1 });
    const ctx = makeCtx({ world, body, log, tick: 10 });

    const intent = checkReflex(ctx);
    expect(intent).not.toBeNull();
    expect(intent?.goal).toBe('reflex:flare');
    expect(intent?.skill).toBe('wait');
    expect(intent?.params.flare).toBe(true);
    expect(log.byTopic('reflex.flare').length).toBe(1);
    expect(log.byTopic('reflex.flinch').length).toBe(0);
  });

  it('no reflex fires under ordinary safe conditions', () => {
    const ctx = makeCtx(); // default healthy body, PATROL wolf far away
    expect(checkReflex(ctx)).toBeNull();
  });
});

describe('interruptTriggered', () => {
  it('fires a valid "<var>_below_<num>" condition against the true body value', () => {
    const body = makeBody({ fuel: 0.1 });
    const ctx = makeCtx({ body });
    const result = interruptTriggered(['fuel_below_0.3'], ctx, 0);
    expect(result).toBe('fuel_below_0.3');
  });

  it('fires a valid "<var>_above_<num>" condition using the threat signal', () => {
    const ctx = makeCtx();
    const result = interruptTriggered(['threat_above_0.5'], ctx, 0.9);
    expect(result).toBe('threat_above_0.5');
  });

  it('does not fire a condition that is not met', () => {
    const body = makeBody({ fuel: 0.9 });
    const ctx = makeCtx({ body });
    expect(interruptTriggered(['fuel_below_0.3'], ctx, 0)).toBeNull();
  });

  it('returns the first triggered condition in array order', () => {
    const body = makeBody({ fuel: 0.1, activation: 0.9 });
    const ctx = makeCtx({ body });
    const result = interruptTriggered(
      ['activation_above_0.8', 'fuel_below_0.3'],
      ctx,
      0,
    );
    expect(result).toBe('activation_above_0.8');
  });

  it('ignores malformed conditions and returns null when nothing valid matches', () => {
    const log = freshLog();
    const body = makeBody({ fuel: 0.9 });
    const ctx = makeCtx({ body, log });
    const result = interruptTriggered(['garbage', 'fuel_sideways_0.3', ''], ctx, 0);
    expect(result).toBeNull();
    expect(log.byTopic('skill.interrupt.invalid').length).toBe(1);
  });

  it('emits skill.interrupt.invalid exactly once even with multiple malformed strings', () => {
    const log = freshLog();
    const ctx = makeCtx({ log, tick: 3 });
    interruptTriggered(['nonsense', 'also_bad', 'fuel_above_'], ctx, 0);
    const events = log.byTopic('skill.interrupt.invalid');
    expect(events.length).toBe(1);
    expect(events[0].tick).toBe(3);
  });

  it('a malformed condition among valid ones still lets the valid one fire, plus logs once', () => {
    const log = freshLog();
    const body = makeBody({ fuel: 0.1 });
    const ctx = makeCtx({ body, log });
    const result = interruptTriggered(['not_a_real_condition', 'fuel_below_0.3'], ctx, 0);
    expect(result).toBe('fuel_below_0.3');
    expect(log.byTopic('skill.interrupt.invalid').length).toBe(1);
  });

  it('unknown var name (not a BodyVar or "threat") is treated as malformed', () => {
    const ctx = makeCtx();
    const result = interruptTriggered(['mood_above_0.5'], ctx, 0);
    expect(result).toBeNull();
  });
});
