// Integration smoke for the app↔engine seam (packages/app/src/engine).
//
// The UI only ever touches the engine through this seam. Today the seam resolves
// to the fixture-backed ARMY mock (USE_REAL_ENGINE=false); at integration the
// orchestrator flips it to the rebuilt @mms/engine, and this test should keep
// passing unchanged because both sides implement the same pinned EngineApi.
//
// This drives a FULL army battle through the seam — commandStack → castSpell →
// endPlayerTurn — and resolves nodes (incl. the pickReward choice-OBJECT path
// the seam translates), without importing @mms/engine directly.
import { describe, it, expect } from 'vitest';
import { engine } from '../src/engine';
import type { Stack } from '../src/engine';

const alive = (stacks: Stack[]) => stacks.filter((s) => s.count > 0);

describe('app ↔ engine seam (army)', () => {
  it('drives a seeded army battle + reward resolution without throwing', () => {
    let run = engine.startRun('integration-army');
    expect(run.army.length).toBeGreaterThan(0);
    expect(run.hero.spellbook.length).toBeGreaterThan(0);

    let commandedAStack = false;
    let castASpell = false;
    let resolvedANode = false;
    let guard = 0;

    while (run.outcome === 'ongoing' && guard++ < 800) {
      const combat = run.combat;
      if (combat && combat.outcome === 'ongoing') {
        // Cast once per turn if affordable (exercises castSpell through the seam).
        if (!combat.spellCastThisTurn) {
          const spell = run.hero.spellbook.find((s) => run.hero.mana >= s.manaCost);
          const enemy = alive(combat.enemyArmy.stacks)[0];
          if (spell && enemy && spell.targeting === 'enemyStack') {
            run = engine.castSpell(run, spell.id, enemy.id);
            castASpell = true;
            continue;
          }
        }
        const me = combat.yourArmy.stacks.find((s) => s.count > 0 && !s.hasActed);
        if (me) {
          const targets = engine.legalTargets(run, me.id);
          run = targets.length
            ? engine.commandStack(run, me.id, { kind: 'attack', targetId: targets[0] })
            : engine.commandStack(run, me.id, { kind: 'defend' });
          commandedAStack = true;
          continue;
        }
        run = engine.endPlayerTurn(run);
        continue;
      }

      // On a node: take a pending reward by its OBJECT (the seam's choice→index
      // translation path), else press on through an economy node.
      const pending = engine.pendingRewards?.(run) ?? null;
      if (pending && pending.length > 0) {
        run = engine.pickReward(run, pending[0]);
        resolvedANode = true;
        continue;
      }
      if (run.currentNodeId != null) {
        run = engine.pickReward(run, { kind: 'skip' });
        resolvedANode = true;
        continue;
      }

      const next = engine.legalNextNodes(run);
      if (next.length === 0) break;
      run = engine.chooseNode(run, next[0]);
    }

    expect(commandedAStack).toBe(true);
    expect(castASpell).toBe(true);
    expect(resolvedANode).toBe(true);
    expect(['ongoing', 'won', 'lost']).toContain(run.outcome);
    expect(guard).toBeLessThan(800);
  });

  it('is deterministic: same seed yields the same hero + army + map', () => {
    const a = engine.startRun('determinism-check');
    const b = engine.startRun('determinism-check');
    expect(a.army.map((s) => s.creatureId)).toEqual(b.army.map((s) => s.creatureId));
    expect(a.map.map((n) => n.id)).toEqual(b.map.map((n) => n.id));
    expect(a.hero.id).toEqual(b.hero.id);
  });
});
