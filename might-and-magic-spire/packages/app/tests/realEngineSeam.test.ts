// Integration smoke for the app↔engine seam (packages/app/src/engine).
//
// The UI only ever touches the engine through this seam, which now resolves to
// the rebuilt REAL @mms/engine (USE_REAL_ENGINE=true). Both the real engine and
// the mock implement the same pinned EngineApi, so this drive exercises the
// real engine end to end through the seam.
//
// This drives a FULL army battle through the seam — commandStack → castSpell →
// endPlayerTurn — and resolves nodes (incl. the pickReward choice-OBJECT path
// the seam translates), without importing @mms/engine directly.
import { describe, it, expect } from 'vitest';
import { engine } from '../src/engine';
import type { CombatState, Stack } from '../src/engine';

const alive = (stacks: Stack[]) => stacks.filter((s) => s.count > 0);

// The real engine tracks "commanded this turn" in combat.actedStackIds (an
// engine-internal extension of the pinned CombatState); the mock uses the
// per-stack `hasActed` flag. Read both so the drive works under either engine.
function actedIds(combat: CombatState): Set<string> {
  const fromList = (combat as unknown as { actedStackIds?: string[] }).actedStackIds ?? [];
  const fromFlags = combat.yourArmy.stacks.filter((s) => s.hasActed).map((s) => s.id);
  return new Set([...fromList, ...fromFlags]);
}

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
        const acted = actedIds(combat);
        const me = combat.yourArmy.stacks.find((s) => s.count > 0 && !acted.has(s.id));
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

      // On a node with pending offers (post-combat spoils OR an economy node):
      // take an affordable one by its OBJECT — exercises the seam's choice→index
      // translation and the validated recruit/learn/buy/upgrade path. We prefer
      // a free choice (gold/raise), else an affordable purchase, else skip — the
      // engine strictly rejects an unaffordable selection. A rest/cleared node
      // carries no offers and we just move on.
      const pending = engine.pendingRewards?.(run) ?? null;
      if (pending && pending.length > 0) {
        const cost = (c: (typeof pending)[number]) =>
          'cost' in c ? (c as { cost: number }).cost : 0;
        const free = pending.find((c) => c.kind === 'gold' || c.kind === 'raise');
        const affordable = pending.find(
          (c) => c.kind !== 'skip' && cost(c) <= run.gold,
        );
        const choice = free ?? affordable ?? { kind: 'skip' as const };
        run = engine.pickReward(run, choice);
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
