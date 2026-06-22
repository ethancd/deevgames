// THE ENGINE SEAM.
//
// The UI imports its engine EXCLUSIVELY from here. It now resolves to the
// rebuilt HoMM3-army `@mms/engine` (USE_REAL_ENGINE = true). Both the real
// engine and the fixture mock implement the same pinned army `EngineApi` from
// ./contract, so nothing in the UI layer changed when we flipped the flag — the
// seam absorbs the few legitimate divergences between the app contract and the
// engine's actual (positional / by-id) op signatures.
//
// ── Divergences the seam reconciles ──
//   1. commandStack — app passes a CommandOrder OBJECT; the engine is positional
//      `commandStack(run, stackId, action, targetId?)`. We spread the order.
//   2. legalTargets — the engine names it `legalCommandTargets`.
//   3. recruit/upgrade/learn/buy — the engine validates the selection against
//      `run.pendingRewards` via node-scoped ops `recruitAt/upgradeAt/learnAt/
//      buyAt(run, nodeId, id)`. The seam routes through the current node id.
//   4. equipArtifact — the engine takes an EQUIPMENT id (`equip_*`) or artifact
//      id and a slot; the HeroDoll passes the equipment's `.id`, which the
//      engine resolves. (Buying already auto-equips, so this is the move/re-slot
//      path.)
//   5. pickReward — the engine consumes `pickReward(run, index)` indexing into
//      run.pendingRewards, while the app contract pins `pickReward(run, choice)`.
//      We translate the app's choice OBJECT to the engine's INDEX here.
//   6. id→display caches — node screens render creatures/artifacts/spells by id;
//      the engine owns the canonical content, surfaced here via its by-id
//      lookups + content arrays (resolved through @mms/data).
import * as real from '@mms/engine';
import { mockEngine } from './mockEngine';
import type {
  ArtifactSlot,
  CommandOrder,
  DamageForecast,
  EngineApi,
  EngineRewardSource,
  Equipment as AppEquipment,
  RewardChoice as AppRewardChoice,
  RunState as AppRunState,
} from './contract';

const USE_REAL_ENGINE = true;

// ──────────────────────────────────────────────────────────────────────────
// The ACTUAL real-engine surface the seam binds to. The engine's RunState is a
// structural SUPERSET of the app contract's RunState (extra internal fields),
// so we cast at the boundary with `as unknown as`.
// ──────────────────────────────────────────────────────────────────────────
type RealRun = Parameters<typeof real.legalNextNodes>[0];

// Translate an app choice OBJECT to the engine's pending-list INDEX. The engine
// picks rewards by index into run.pendingRewards. (Returns -1 if not found.)
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

// Build the real-engine-backed EngineApi. Casts marshal the structural superset
// RunState across the seam boundary in both directions.
function buildRealApi(): EngineApi & EngineRewardSource {
  const toApp = (r: RealRun) => r as unknown as AppRunState;
  const toReal = (r: AppRunState) => r as unknown as RealRun;

  return {
    startRun: (seed, heroId) => toApp(real.startRun(seed, heroId)),
    legalNextNodes: (run) => real.legalNextNodes(toReal(run)),
    chooseNode: (run, nodeId) => toApp(real.chooseNode(toReal(run), nodeId)),

    // combat — the engine is positional; spread the CommandOrder object.
    commandStack: (run, stackId, order: CommandOrder) =>
      toApp(real.commandStack(toReal(run), stackId, order.kind, order.targetId)),
    castSpell: (run, spellId, targetId) =>
      toApp(real.castSpell(toReal(run), spellId, targetId)),
    endPlayerTurn: (run) => toApp(real.endPlayerTurn(toReal(run))),
    legalTargets: (run, stackId) => real.legalCommandTargets(toReal(run), stackId),
    forecastAttack: (run, attackerStackId, targetStackId) =>
      real.forecastAttack(toReal(run), attackerStackId, targetStackId) as DamageForecast | null,

    // node interactions — node-scoped ops validate against pendingRewards.
    recruit: (run, creatureId) =>
      toApp(real.recruitAt(toReal(run), currentNodeId(run), creatureId)),
    upgrade: (run, stackId) =>
      toApp(real.upgradeAt(toReal(run), currentNodeId(run), stackId)),
    learn: (run, spellId) =>
      toApp(real.learnAt(toReal(run), currentNodeId(run), spellId)),
    buy: (run, artifactId) =>
      toApp(real.buyAt(toReal(run), currentNodeId(run), artifactId)),
    equipArtifact: (run, equipmentId, slot) =>
      toApp(real.equipArtifact(toReal(run), equipmentId, slot as ArtifactSlot)),

    // rewards — translate the app's choice OBJECT to the engine's INDEX.
    pickReward: (run, choice) => {
      const pending = real.pendingRewards(toReal(run));
      const idx = indexOfChoice(pending as AppRewardChoice[] | null, choice);
      if (idx < 0) throw new Error(`pickReward: no matching offer for ${choice.kind}`);
      return toApp(real.pickReward(toReal(run), idx));
    },
    pendingRewards: (run) =>
      real.pendingRewards(toReal(run)) as AppRewardChoice[] | null,
    legalSpellTargets: (run, spellId) => real.legalSpellTargets(toReal(run), spellId),
  };
}

function currentNodeId(run: AppRunState): string {
  if (run.currentNodeId == null) throw new Error('no current node');
  return run.currentNodeId;
}

// The live engine.
export const engine: EngineApi & EngineRewardSource = USE_REAL_ENGINE
  ? buildRealApi()
  : mockEngine;

// ──────────────────────────────────────────────────────────────────────────
// Content lookups + economy helpers the node screens use to render offers and
// previews by id. Resolved against the REAL engine / @mms/data so they work
// regardless of which engine backs `engine` above.
// ──────────────────────────────────────────────────────────────────────────

// Source-record arrays (creatures/spells/artifacts) the Codex + screens read.
export const CREATURES = real.CREATURES;
export const SPELLS = real.SPELLS;
export const ARTIFACTS = real.ARTIFACTS;

// id → Source record. The engine's by-id lookups span the whole corpus.
export const creatureLookup = real.creatureById;
export const spellLookup = real.spellById;
export const artifactLookup = real.artifactById;

// --- hero / faction selection (TitleScreen) --------------------------------
// Playable factions + the heroes in each, projected onto the app's PlayableHero
// shape. Resolved through the engine's content exports (backed by @mms/data) so
// the picker is available regardless of which engine backs `engine` above.
import type { PlayableHero } from './contract';

/** Faction display order (Necropolis, Castle, Stronghold, …). */
export const FACTIONS: string[] = real.FACTIONS;

/** The default starting hero id (Galthran) — the picker's initial selection. */
export const DEFAULT_HERO_ID: string = real.DEFAULT_HERO.id;

type SrcHeroLike = {
  id: string;
  name: string;
  faction: string;
  heroClass: string;
  specialty: string;
  imageRef: string;
};

function toPlayableHero(h: SrcHeroLike): PlayableHero {
  return {
    id: h.id,
    name: h.name,
    faction: h.faction,
    heroClass: h.heroClass,
    specialty: h.specialty,
    imageRef: h.imageRef,
  };
}

/** Every playable hero (all factions), as PlayableHero summaries. */
export const PLAYABLE_HEROES: PlayableHero[] = (
  real.PLAYABLE_HEROES as SrcHeroLike[]
).map(toPlayableHero);

/** Heroes of one faction (display order matches the corpus). */
export function heroesOfFaction(faction: string): PlayableHero[] {
  return (real.heroesOfFaction(faction) as SrcHeroLike[]).map(toPlayableHero);
}

// --- economy helpers -------------------------------------------------------
// Costs are authored by the engine and surfaced on each offer's `cost` in
// pendingRewards; the screens now read that directly. These helpers remain for
// any preview math and resolve costs from the live node offers when present,
// falling back to the engine's pricing constants.

export function dwellingCost(tier: number): number {
  return tier * real.RECRUIT_COST_PER_TIER;
}

export function upgradeCost(run: AppRunState, stackId: string): number {
  const pending = engine.pendingRewards?.(run) ?? null;
  const offer = pending?.find(
    (r): r is Extract<AppRewardChoice, { kind: 'upgrade' }> =>
      r.kind === 'upgrade' && r.stackId === stackId,
  );
  if (offer) return offer.cost;
  const stack = run.army.find((s) => s.id === stackId);
  return stack ? stack.tier * real.UPGRADE_COST_PER_TIER : 0;
}

export function artifactCost(artifactId: string): number {
  const a = real.artifactById(artifactId) as { class?: string } | undefined;
  return real.ARTIFACT_COST[a?.class ?? 'Treasure'] ?? 100;
}

/**
 * The hero's currently-equipped artifacts, as app-contract Equipment. The
 * HeroDoll satchel/equip flow and any "already owned" gate read this. The
 * engine stores richer Equipment (description + parsed effects); we project it
 * onto the app shape (`bonuses` <- description), keeping the engine equipment
 * `.id` (e.g. `equip_*`) so the doll's equip dispatch round-trips through
 * `real.equipArtifact`.
 */
export function ownedArtifacts(run: AppRunState): AppEquipment[] {
  type AnyEquip = {
    id: string;
    name: string;
    slot: ArtifactSlot;
    rarity: AppEquipment['rarity'];
    description?: string;
    bonuses?: string;
    imageRef: string;
  };
  const toApp = (e: AnyEquip): AppEquipment => ({
    id: e.id,
    name: e.name,
    slot: e.slot,
    rarity: e.rarity,
    // Engine Equipment carries `description`; the app/mock contract uses
    // `bonuses`. Accept either so this works under both engines.
    bonuses: e.bonuses ?? e.description ?? '',
    imageRef: e.imageRef,
  });
  const equipped = Object.values(run.hero.equipment).filter(
    (e): e is NonNullable<typeof e> => !!e,
  ) as unknown as AnyEquip[];
  // The mock overflows bought-but-unequippable artifacts into a side bag; the
  // real engine auto-equips on buy (no bag). Surface either so the HeroDoll's
  // satchel/equip flow works under both engines.
  const bag = ((run as unknown as { _bag?: AnyEquip[] })._bag ?? []);
  return [...equipped, ...bag].map(toApp);
}

export * from './contract';
