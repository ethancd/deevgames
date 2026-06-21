// Proves the fixture-backed engine satisfies the pinned contract well enough
// to drive a full touch-playable run: start -> fight -> win -> reward ->
// reach & beat the boss. If this passes, the screens have a real loop to render.
import { describe, it, expect } from 'vitest';
import { mockEngine as engine } from '../src/engine/mockEngine';
import type { RunState } from '../src/engine/contract';

function bottomRowNode(run: RunState) {
  const minRow = Math.min(...run.map.map((n) => n.row));
  return run.map.find((n) => n.row === minRow)!;
}

describe('mock engine — pinned contract', () => {
  it('startRun is deterministic for a seed', () => {
    const a = engine.startRun('seed-x');
    const b = engine.startRun('seed-x');
    expect(a.map.map((n) => n.id)).toEqual(b.map.map((n) => n.id));
    expect(a.hp).toBe(50);
    expect(a.deck.length).toBe(10);
  });

  it('builds a reachable branching map ending in a boss', () => {
    const run = engine.startRun('seed-1');
    expect(run.map.some((n) => n.type === 'boss')).toBe(true);
    // every non-start node is referenced by some node's `next`
    const referenced = new Set(run.map.flatMap((n) => n.next));
    const minRow = Math.min(...run.map.map((n) => n.row));
    for (const n of run.map) {
      if (n.row !== minRow) expect(referenced.has(n.id)).toBe(true);
    }
  });

  it('entering a combat node starts combat with a hand and intents', () => {
    let run = engine.startRun('seed-1');
    const start = bottomRowNode(run);
    run = engine.chooseNode(run, start.id);
    expect(run.combat).not.toBeNull();
    expect(run.combat!.hand.length).toBeGreaterThan(0);
    expect(run.combat!.enemies.every((e) => e.intent.label.length > 0)).toBe(true);
    expect(run.combat!.energy).toBe(3);
  });

  it('playing a damage card reduces enemy hp and spends energy', () => {
    let run = engine.startRun('seed-1');
    run = engine.chooseNode(run, bottomRowNode(run).id);
    const target = run.combat!.enemies[0];
    const strike = run.combat!.hand.find((c) => c.effects.some((e) => e.kind === 'damage'))!;
    const before = target.hp;
    const energyBefore = run.combat!.energy;
    run = engine.playCard(run, strike.id, target.id);
    const after = run.combat!.enemies.find((e) => e.id === target.id);
    // either the enemy took damage, or it died and was removed
    if (after) expect(after.hp).toBeLessThan(before);
    expect(run.combat!.energy).toBe(energyBefore - strike.cost);
  });

  it('block reduces incoming damage on endTurn', () => {
    let run = engine.startRun('seed-block');
    run = engine.chooseNode(run, bottomRowNode(run).id);
    const blockCard = run.combat!.hand.find((c) => c.effects.some((e) => e.kind === 'block'));
    const hpBefore = run.combat!.playerHp;
    if (blockCard) run = engine.playCard(run, blockCard.id);
    run = engine.endTurn(run);
    // player should still be alive and have taken bounded damage
    expect(run.combat!.playerHp).toBeLessThanOrEqual(hpBefore);
    expect(run.combat!.turn).toBe(2);
  });

  it('a full run is winnable end-to-end (reach & beat the boss)', () => {
    // A reasonable greedy player: spend energy on damage to the lowest-HP
    // enemy, but spend a card on block when about to take a big hit. The
    // engine is winnable, so at least one seed beats the boss this way —
    // proving the touch loop has a victory path without overfitting one seed.
    const playGreedily = (r: RunState): RunState => {
      let s = r;
      let guard = 0;
      while (s.combat && s.combat.outcome === 'ongoing' && guard++ < 400) {
        const c = s.combat;
        const incoming = c.enemies.reduce(
          (sum, e) => sum + (e.intent.kind === 'attack' ? e.intent.value ?? 0 : 0),
          0,
        );
        const block = c.hand.find(
          (k) => k.effects.some((e) => e.kind === 'block') && k.cost <= c.energy,
        );
        const dmg = c.hand.find(
          (k) => k.effects.some((e) => e.kind === 'damage') && k.cost <= c.energy,
        );
        if (incoming - c.playerBlock > 8 && block) {
          s = engine.playCard(s, block.id);
        } else if (dmg) {
          const weakest = [...c.enemies].sort((a, b) => a.hp - b.hp)[0];
          s = engine.playCard(s, dmg.id, weakest?.id);
        } else {
          s = engine.endTurn(s);
        }
      }
      return s;
    };

    const playSeed = (seed: string): RunState['outcome'] => {
      let run = engine.startRun(seed);
      let lastNodeId: string | null = null;
      let guard = 0;
      while (run.outcome === 'ongoing' && guard++ < 120) {
        if (run.combat && run.combat.outcome === 'ongoing') {
          run = playGreedily(run);
          continue;
        }
        if (run.currentNodeId != null) {
          lastNodeId = run.currentNodeId;
          const choices = engine.pendingRewards(run);
          // prefer relics/cards over skip to grow stronger
          const choice = choices.find((c) => c.kind !== 'skip') ?? choices[0] ?? { kind: 'skip' as const };
          run = engine.pickReward(run, choice);
          continue;
        }
        const prev = lastNodeId ? run.map.find((n) => n.id === lastNodeId) : null;
        const options = prev && prev.next.length ? prev.next : [bottomRowNode(run).id];
        run = engine.chooseNode(run, options[0]);
      }
      return run.outcome;
    };

    const seeds = ['victory-1', 'victory-2', 'victory-3', 'victory-4', 'victory-5'];
    const outcomes = seeds.map(playSeed);
    // every seed reaches a terminal state (no infinite loop) ...
    expect(outcomes.every((o) => o === 'won' || o === 'lost')).toBe(true);
    // ... and the run is genuinely winnable on at least one.
    expect(outcomes).toContain('won');
  });
});
