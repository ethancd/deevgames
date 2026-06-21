// The runtime contract, PINNED by the orchestrator for the ARMY combat redesign.
//
// The real @mms/engine (Agent 3) is being rebuilt against this EXACT definition
// in parallel — a HoMM3-style army battle: a hero with no HP commanding creature
// STACKS across two ranks, a spellbook, and a paper-doll of artifacts. The app
// codes its screens against these types and call signatures. At integration the
// orchestrator swaps the mock for the real engine import in ./index.ts; nothing
// in the UI layer changes because the UI only ever imports from ./engine, never
// from the mock (or @mms/engine) directly.
//
// NOTE: this contract intentionally does NOT import @mms/engine — the app must
// build green against the mock today, before the army engine ships.

// Rarity for equipment, pinned as a plain string-literal union (no zod dep).
export type Rarity = 'common' | 'uncommon' | 'rare' | 'relic';

// Map node types — the army roguelite adds dwelling/altar/shrine/merchant.
export type NodeType =
  | 'combat'
  | 'elite'
  | 'boss'
  | 'dwelling'
  | 'altar'
  | 'shrine'
  | 'merchant'
  | 'rest';

// The nine anatomical artifact slots of the hero paper-doll.
export type ArtifactSlot =
  | 'Head'
  | 'Neck'
  | 'Torso'
  | 'RightHand'
  | 'LeftHand'
  | 'Ring'
  | 'Feet'
  | 'Misc'
  | 'Special';

// The four primary hero stats (the hero has NO hp — the army is the life total).
export type PrimaryStat = 'attack' | 'defense' | 'power' | 'knowledge';

// Spell schools mirror HoMM3's magic guilds.
export type SpellSchool = 'Air' | 'Earth' | 'Fire' | 'Water' | 'All';

// What a spell can be aimed at.
export type SpellTargeting =
  | 'enemyStack'
  | 'allyStack'
  | 'allEnemies'
  | 'allAllies'
  | 'self'
  | 'none';

export interface Equipment {
  id: string;
  name: string;
  slot: ArtifactSlot;
  rarity: Rarity;
  bonuses: string;
  imageRef: string;
}

export interface CombatSpell {
  id: string;
  name: string;
  school: SpellSchool;
  level: number;
  manaCost: number;
  description: string;
  targeting: SpellTargeting;
  imageRef: string;
}

export interface Hero {
  id: string;
  name: string;
  heroClass: string;
  specialty: string;
  attack: number;
  defense: number;
  power: number;
  knowledge: number;
  mana: number;
  maxMana: number;
  equipment: Partial<Record<ArtifactSlot, Equipment>>;
  spellbook: CombatSpell[];
  skills: Record<string, number>;
  imageRef: string;
}

// An enemy stack's telegraphed intent for the coming turn — the only way the
// player reads the AI. Honest: the same plan drives the shown label and the
// executed action.
export interface Telegraph {
  kind: 'attack' | 'shoot' | 'defend' | 'cast' | 'wait' | 'unknown';
  value?: number;
  targetStackId?: string;
  label: string;
}

// A creature STACK (type × count). Stacks DO have hp; the army of stacks is the
// player's life total. `creatureId` is the SourceCreature id used for art.
export interface Stack {
  id: string;
  creatureId: string;
  name: string;
  tier: number;
  count: number;
  hpTop: number; // hp remaining on the topmost (currently-fighting) creature
  maxHpPer: number;
  attack: number;
  defense: number;
  damageMin: number;
  damageMax: number;
  speed: number;
  rank: 'front' | 'back';
  abilities: string[];
  side: 'player' | 'enemy';
  hasActed: boolean;
  isDefending: boolean;
  hasRetaliated: boolean;
  telegraph?: Telegraph;
  imageRef: string;
}

export interface Army {
  stacks: Stack[];
  side: 'player' | 'enemy';
}

export interface CombatState {
  round: number;
  whoseTurn: 'player' | 'enemy';
  yourArmy: Army;
  enemyArmy: Army;
  spellCastThisTurn: boolean;
  log: string[];
  outcome: 'ongoing' | 'won' | 'lost';
}

export interface MapNode {
  id: string;
  type: NodeType;
  row: number;
  col: number;
  next: string[];
}

export interface RunState {
  seed: string;
  hero: Hero;
  army: Stack[];
  gold: number;
  map: MapNode[];
  currentNodeId: string | null;
  act: number;
  combat: CombatState | null;
  outcome: 'ongoing' | 'won' | 'lost';
}

/**
 * A reward / node-interaction choice. `pickReward` consumes it. The engine is
 * the source of truth for what choices exist; the UI renders whatever it
 * returns. Covers the army economy (recruit/upgrade/learn/buy), the no-town
 * growth lever (raise undead), plus gold and a skip escape hatch.
 */
export type RewardChoice =
  | { kind: 'recruit'; creatureId: string; count: number; cost: number }
  | { kind: 'upgrade'; stackId: string; toCreatureId: string; cost: number }
  | { kind: 'learn'; spellId: string; cost: number }
  | { kind: 'buy'; artifactId: string; slot: ArtifactSlot; cost: number }
  | { kind: 'raise'; creatureId: string; count: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'skip' };

// A command issued to one of your stacks on your turn (once per stack).
export interface CommandOrder {
  kind: 'attack' | 'defend';
  targetId?: string;
}

/**
 * The pinned op surface. Every op is pure: (state, …args) -> next state.
 * The UI holds the latest RunState and replaces it wholesale on each op.
 */
export interface EngineApi {
  startRun(seed: string): RunState;
  legalNextNodes(run: RunState): string[];
  chooseNode(run: RunState, nodeId: string): RunState;

  // --- combat (side-alternation army turns) ---
  commandStack(run: RunState, stackId: string, order: CommandOrder): RunState;
  castSpell(run: RunState, spellId: string, targetId?: string): RunState;
  endPlayerTurn(run: RunState): RunState;
  legalTargets(run: RunState, stackId: string): string[];

  // --- node interactions / economy ---
  pickReward(run: RunState, choice: RewardChoice): RunState;
  recruit(run: RunState, creatureId: string, count: number): RunState;
  upgrade(run: RunState, stackId: string): RunState;
  learn(run: RunState, spellId: string): RunState;
  buy(run: RunState, artifactId: string): RunState;
  equipArtifact(run: RunState, artifactId: string, slot: ArtifactSlot): RunState;
}

/**
 * Optional introspection the engine MAY expose. Kept optional so the seam can
 * fall back when the real engine omits them.
 *  - pendingRewards: what a freshly-resolved node offers.
 *  - legalSpellTargets: which stacks a given spell may be aimed at.
 */
export interface EngineRewardSource {
  pendingRewards?(run: RunState): RewardChoice[] | null;
  legalSpellTargets?(run: RunState, spellId: string): string[];
}
