// THE ENGINE SEAM.
//
// The UI imports its engine exclusively from here. It now resolves to the real
// @mms/engine; the fixture-backed mock is kept for tests and as a fallback.
// Nothing in the UI layer changed at integration because both sides implement
// the pinned `EngineApi` from ./contract — the only work is here, at the seam,
// reconciling the two places the engine's public API legitimately diverged from
// the orchestrator's pinned contract:
//
//   1. pickReward — the contract pins `pickReward(run, choice)`, but the engine
//      consumes `pickReward(run, index)` indexing into run.pendingRewards. We
//      translate the app's choice object back to the engine's index here.
//   2. RewardChoice — the engine embeds the full CardDef/Relic in each choice
//      (and offers a `gold` kind); the app addresses them by id + lookups. We
//      map between the two shapes and cache the embedded objects so lookupCard/
//      lookupRelic resolve.
import * as real from '@mms/engine';
import { mockEngine } from './mockEngine';
import type {
  EngineApi,
  EngineRewardSource,
  RewardChoice as AppRewardChoice,
  RunState as AppRunState,
  Relic as AppRelic,
} from './contract';
import type { CardDef } from '@mms/schema';

const USE_REAL_ENGINE = true;

// The engine's RunState is a structural superset of the app contract's
// RunState (it carries extra internal fields — clearedNodeIds, pendingRewards,
// hidden piles — that the UI ignores). We treat engine state as app state via a
// checked cast at this boundary, and reach back into the engine shape only here.
type EngineRun = real.RunState;
const asEngine = (run: AppRunState): EngineRun => run as unknown as EngineRun;
const asApp = (run: EngineRun): AppRunState => run as unknown as AppRunState;

// --- id -> display caches for the reward UI ---------------------------------
// The engine embeds full CardDef/Relic objects in its choices and deck; the app
// contract addresses them by id. We seed these caches from the engine's
// built-in content and top them up from each run's embedded reward objects.
const cardCache = new Map<string, CardDef>();
const relicCache = new Map<string, AppRelic>();

for (const creature of real.CREATURES) {
  const card = real.adaptCreature(creature);
  cardCache.set(card.id, card);
}
for (const artifact of real.ARTIFACTS) {
  const relic = real.adaptArtifact(artifact);
  relicCache.set(relic.id, relic);
}

export function lookupCard(id: string): CardDef | undefined {
  return cardCache.get(id);
}
export function lookupRelic(id: string): AppRelic | undefined {
  return relicCache.get(id);
}

// engine reward choice -> app reward choice (caching embedded objects)
function toAppChoice(c: real.RewardChoice): AppRewardChoice {
  switch (c.kind) {
    case 'card':
      cardCache.set(c.card.id, c.card);
      return { kind: 'card', cardId: c.card.id };
    case 'relic':
      relicCache.set(c.relic.id, c.relic);
      return { kind: 'relic', relicId: c.relic.id };
    case 'gold':
      return { kind: 'gold', amount: c.amount };
    case 'heal':
      return { kind: 'heal', amount: c.amount };
    case 'skip':
      return { kind: 'skip' };
  }
}

// app reward choice -> index into the engine's pending list (it picks by index)
function indexOfChoice(run: EngineRun, choice: AppRewardChoice): number {
  const pending = run.pendingRewards ?? [];
  return pending.findIndex((c) => {
    if (c.kind !== choice.kind) return false;
    switch (c.kind) {
      case 'card':
        return c.card.id === (choice as { cardId: string }).cardId;
      case 'relic':
        return c.relic.id === (choice as { relicId: string }).relicId;
      case 'gold':
      case 'heal':
        return c.amount === (choice as { amount: number }).amount;
      case 'skip':
        return true;
    }
  });
}

const realApi: EngineApi & EngineRewardSource = {
  startRun: (seed) => asApp(real.startRun(seed)),
  chooseNode: (run, nodeId) => asApp(real.chooseNode(asEngine(run), nodeId)),
  playCard: (run, cardId, targetId) => asApp(real.playCard(asEngine(run), cardId, targetId)),
  endTurn: (run) => asApp(real.endTurn(asEngine(run))),
  pickReward: (run, choice) => {
    const er = asEngine(run);
    const idx = indexOfChoice(er, choice);
    if (idx < 0) return run; // defensive: choice not in pending — no-op
    return asApp(real.pickReward(er, idx));
  },
  pendingRewards: (run) => (asEngine(run).pendingRewards ?? []).map(toAppChoice),
};

export const engine: EngineApi & EngineRewardSource = USE_REAL_ENGINE ? realApi : mockEngine;

export * from './contract';
