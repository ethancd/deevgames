// Integration smoke for the app↔real-engine seam (packages/app/src/engine).
//
// The existing app tests were written against the fixture mock. This one drives
// a full seeded run through the REAL engine via the seam, exercising the two
// pieces that only exist at integration: the pickReward choice-object →
// engine-index translation, and the engine→app RewardChoice mapping (incl. the
// `gold` kind the engine emits that the contract didn't originally model).
import { describe, it, expect } from 'vitest';
import { engine } from '../src/engine';
import { legalNextNodes, type RunState as EngineRunState } from '@mms/engine';

describe('app ↔ real engine seam', () => {
  it('plays a seeded run through combat + reward translation without throwing', () => {
    let run = engine.startRun('integration-smoke');
    expect(run.deck.length).toBeGreaterThan(0);

    let pickedAReward = false;
    let guard = 0;

    while (run.outcome === 'ongoing' && guard++ < 1000) {
      const combat = run.combat;
      if (combat && combat.outcome === 'ongoing') {
        const playable = combat.hand.find((card) => card.cost <= combat.energy);
        if (playable) {
          run = engine.playCard(run, playable.id, combat.enemies[0]?.id);
        } else {
          run = engine.endTurn(run);
        }
        continue;
      }

      const choices = engine.pendingRewards?.(run) ?? [];
      if (choices.length > 0) {
        // Picking by the app's choice OBJECT exercises the choice→index adapter.
        run = engine.pickReward(run, choices[0]);
        pickedAReward = true;
        continue;
      }

      const next = legalNextNodes(run as unknown as EngineRunState);
      if (next.length === 0) break;
      run = engine.chooseNode(run, next[0]);
    }

    expect(pickedAReward).toBe(true);
    expect(['ongoing', 'won', 'lost']).toContain(run.outcome);
    // A deterministic seed must resolve well within the guard.
    expect(guard).toBeLessThan(1000);
  });

  it('is deterministic: the same seed yields the same starting deck', () => {
    const a = engine.startRun('determinism-check');
    const b = engine.startRun('determinism-check');
    expect(a.deck.map((c) => c.id)).toEqual(b.deck.map((c) => c.id));
    expect(a.map.map((n) => n.id)).toEqual(b.map.map((n) => n.id));
  });
});
