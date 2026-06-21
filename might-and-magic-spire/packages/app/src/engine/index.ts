// THE ENGINE SEAM.
//
// The UI imports its engine EXCLUSIVELY from here. Today it resolves to the
// fixture-backed ARMY mock (./mockEngine), which implements the pinned army
// `EngineApi` from ./contract. At integration the orchestrator flips
// USE_REAL_ENGINE to true to point at the rebuilt @mms/engine — and nothing in
// the UI layer changes, because both sides implement the same pinned contract.
//
// IMPORTANT: this file deliberately does NOT `import '@mms/engine'` at module
// scope. The currently-published @mms/engine is the OLD Slay-the-Spire build,
// whose surface (playCard/endTurn/Enemy/CombatState.hand...) is incompatible
// with the new army contract. Importing it would break typecheck. When the real
// ARMY engine ships, the orchestrator: (1) sets USE_REAL_ENGINE = true, and
// (2) restores the `realApi` block below (it is written against the EXPECTED
// real-engine surface and kept here, behind the flag, as the integration spec).
//
// ── Integration assumptions the realApi block makes about the real engine ──
// The real @mms/engine is expected to export PURE ops mirroring the contract,
// but with two legitimate divergences the seam reconciles (same pattern as the
// previous integration):
//   1. pickReward — the engine consumes `pickReward(run, index)` indexing into
//      run.pendingRewards, while the app contract pins `pickReward(run, choice)`.
//      We translate the app's choice OBJECT to the engine's INDEX here.
//   2. id→display caches — node screens render creatures/artifacts/spells by id;
//      the engine owns the canonical content. We seed caches from @mms/data so
//      previews resolve regardless of which engine is live.
//   3. legalTargets — if the real engine omits it, the seam falls back to a
//      front-rank/shooter reach computation (mirrors the mock) so the UI's
//      target-glow never goes dark.
import { mockEngine } from './mockEngine';
import type {
  EngineApi,
  EngineRewardSource,
  RewardChoice as AppRewardChoice,
  RunState as AppRunState,
} from './contract';

const USE_REAL_ENGINE = false;

// ──────────────────────────────────────────────────────────────────────────
// REAL-ENGINE ADAPTER (dormant until USE_REAL_ENGINE flips).
//
// Kept as a typed spec rather than live code so the app stays green against the
// OLD @mms/engine. To activate at integration:
//   • add `import * as real from '@mms/engine';` at the top of this file,
//   • restore the body of `buildRealApi` below to call `real.*`,
//   • set USE_REAL_ENGINE = true.
// The expected real surface (pure (state,...args)->state) is:
//   real.startRun(seed), real.legalNextNodes(run), real.chooseNode(run,nodeId),
//   real.commandStack(run,stackId,order), real.castSpell(run,spellId,targetId?),
//   real.endPlayerTurn(run), real.legalTargets(run,stackId),
//   real.recruit/upgrade/learn/buy(run,...), real.equipArtifact(run,id,slot),
//   real.pickReward(run, index|choice), and optional real.pendingRewards(run),
//   real.legalSpellTargets(run,spellId).
// ──────────────────────────────────────────────────────────────────────────
type RealModule = {
  startRun(seed: string): AppRunState;
  legalNextNodes(run: AppRunState): string[];
  chooseNode(run: AppRunState, nodeId: string): AppRunState;
  commandStack(run: AppRunState, stackId: string, order: unknown): AppRunState;
  castSpell(run: AppRunState, spellId: string, targetId?: string): AppRunState;
  endPlayerTurn(run: AppRunState): AppRunState;
  legalTargets?(run: AppRunState, stackId: string): string[];
  recruit(run: AppRunState, creatureId: string, count: number): AppRunState;
  upgrade(run: AppRunState, stackId: string): AppRunState;
  learn(run: AppRunState, spellId: string): AppRunState;
  buy(run: AppRunState, artifactId: string): AppRunState;
  equipArtifact(run: AppRunState, artifactId: string, slot: string): AppRunState;
  pickReward(run: AppRunState, indexOrChoice: number | AppRewardChoice): AppRunState;
  pendingRewards?(run: AppRunState): AppRewardChoice[] | null;
  legalSpellTargets?(run: AppRunState, spellId: string): string[];
};

// Translate an app choice OBJECT to the engine's pending-list INDEX, for engines
// that pick rewards by index. (No-op-safe: returns -1 if not found.)
function indexOfChoice(
  pending: AppRewardChoice[] | null | undefined,
  choice: AppRewardChoice,
): number {
  const list = pending ?? [];
  return list.findIndex((c) => {
    if (c.kind !== choice.kind) return false;
    switch (c.kind) {
      case 'recruit':
        return c.creatureId === (choice as { creatureId: string }).creatureId;
      case 'upgrade':
        return c.stackId === (choice as { stackId: string }).stackId;
      case 'learn':
        return c.spellId === (choice as { spellId: string }).spellId;
      case 'buy':
        return c.artifactId === (choice as { artifactId: string }).artifactId;
      case 'raise':
        return c.creatureId === (choice as { creatureId: string }).creatureId;
      case 'gold':
        return c.amount === (choice as { amount: number }).amount;
      case 'skip':
        return true;
    }
  });
}

// Front-rank/shooter reach fallback if the real engine omits legalTargets.
function reachFallback(run: AppRunState, stackId: string): string[] {
  const c = run.combat;
  if (!c || c.outcome !== 'ongoing' || c.whoseTurn !== 'player') return [];
  const stack = c.yourArmy.stacks.find((s) => s.id === stackId);
  if (!stack || stack.count <= 0 || stack.hasActed) return [];
  const enemyAlive = c.enemyArmy.stacks.filter((s) => s.count > 0);
  const shooter = stack.abilities.some((a) => /Ranged|Shooter/i.test(a));
  if (shooter) return enemyAlive.map((s) => s.id);
  const front = enemyAlive.filter((s) => s.rank === 'front');
  return (front.length > 0 ? front : enemyAlive).map((s) => s.id);
}

// Build the real-engine-backed EngineApi. `real` is injected at integration;
// kept as a factory so the dormant path type-checks without importing the
// incompatible legacy @mms/engine.
export function buildRealApi(real: RealModule): EngineApi & EngineRewardSource {
  return {
    startRun: (seed) => real.startRun(seed),
    legalNextNodes: (run) => real.legalNextNodes(run),
    chooseNode: (run, nodeId) => real.chooseNode(run, nodeId),
    commandStack: (run, stackId, order) => real.commandStack(run, stackId, order),
    castSpell: (run, spellId, targetId) => real.castSpell(run, spellId, targetId),
    endPlayerTurn: (run) => real.endPlayerTurn(run),
    legalTargets: (run, stackId) =>
      real.legalTargets ? real.legalTargets(run, stackId) : reachFallback(run, stackId),
    recruit: (run, creatureId, count) => real.recruit(run, creatureId, count),
    upgrade: (run, stackId) => real.upgrade(run, stackId),
    learn: (run, spellId) => real.learn(run, spellId),
    buy: (run, artifactId) => real.buy(run, artifactId),
    equipArtifact: (run, artifactId, slot) => real.equipArtifact(run, artifactId, slot),
    pickReward: (run, choice) => {
      // The real engine may pick by index; translate the app's choice object.
      const pending = real.pendingRewards ? real.pendingRewards(run) : null;
      const idx = indexOfChoice(pending, choice);
      return real.pickReward(run, idx >= 0 ? idx : choice);
    },
    pendingRewards: (run) => (real.pendingRewards ? real.pendingRewards(run) : null),
    legalSpellTargets: (run, spellId) =>
      real.legalSpellTargets ? real.legalSpellTargets(run, spellId) : [],
  };
}

// The live engine. USE_REAL_ENGINE is false today, so this is the army mock.
// (When true, the orchestrator passes the imported real module to buildRealApi.)
export const engine: EngineApi & EngineRewardSource = USE_REAL_ENGINE
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildRealApi((globalThis as any).__MMS_REAL_ENGINE__ as RealModule)
  : mockEngine;

// Content lookups the node screens use to render offers/previews by id. These
// resolve through @mms/data and are engine-agnostic, so they work under either
// engine. (Re-exported from the mock, which owns the @mms/data adapters.)
export {
  creatureLookup,
  artifactLookup,
  spellLookup,
  ownedArtifacts,
  dwellingCost,
  upgradeCost,
  artifactCost,
  CREATURES,
  ARTIFACTS,
  SPELLS,
} from './mockEngine';

export * from './contract';
