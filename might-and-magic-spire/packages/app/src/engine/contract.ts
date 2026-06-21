// The runtime contract, PINNED by the orchestrator.
//
// The engine (Agent 3 / @mms/engine) is being built against this EXACT
// definition in parallel. The app codes its screens against these types and
// call signatures. At integration we swap the mock for the real engine import
// in ./index.ts; nothing in the UI layer changes because the UI only ever
// imports from ./engine, never from the mock directly.
import type { CardDef } from '@mms/schema';

// @mms/schema exports `Rarity` as a Zod enum *value*; the runtime contract
// pins the inferred string-literal *type*. CardDef.rarity already carries it,
// so we derive it here without taking a zod dependency in the app.
export type Rarity = CardDef['rarity'];

export type NodeType = 'combat' | 'elite' | 'event' | 'shop' | 'rest' | 'boss';

export interface Intent {
  kind: 'attack' | 'block' | 'buff' | 'debuff' | 'unknown';
  value?: number;
  label: string;
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  intent: Intent;
  imageRef: string;
}

export interface Relic {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  imageRef: string;
}

export interface CombatState {
  turn: number;
  energy: number;
  maxEnergy: number;
  playerHp: number;
  playerMaxHp: number;
  playerBlock: number;
  hand: CardDef[];
  drawCount: number;
  discardCount: number;
  enemies: Enemy[];
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
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardDef[];
  relics: Relic[];
  map: MapNode[];
  currentNodeId: string | null;
  act: number;
  combat: CombatState | null;
  outcome: 'ongoing' | 'won' | 'lost';
}

/**
 * A reward choice surfaced after a node resolves. `pickReward` consumes it.
 * The engine is the source of truth for what choices exist; the UI renders
 * whatever it returns. We model the two reward shapes the brief calls out
 * (card pick, relic pick) plus a "skip" escape hatch.
 */
export type RewardChoice =
  | { kind: 'card'; cardId: string }
  | { kind: 'relic'; relicId: string }
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'skip' };

/**
 * The pinned op surface. Every op is pure: (state, …args) -> next state.
 * The UI holds the latest RunState and replaces it wholesale on each op.
 */
export interface EngineApi {
  startRun(seed: string): RunState;
  chooseNode(run: RunState, nodeId: string): RunState;
  playCard(run: RunState, cardId: string, targetId?: string): RunState;
  endTurn(run: RunState): RunState;
  pickReward(run: RunState, choice: RewardChoice): RunState;
}

/**
 * The engine may additionally expose what rewards a freshly-resolved node
 * offers. This is not in the minimal pinned op list, so we keep it optional
 * and provide it from the mock; if the real engine lacks it, the UI falls
 * back to a generic "continue" affordance.
 */
export interface EngineRewardSource {
  pendingRewards?(run: RunState): RewardChoice[];
}
