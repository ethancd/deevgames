import { movementActionCost } from '../../game/movement';
import type { GameState } from '../../game/types';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../../game/units';
import { calculateAttackPower, canAttack, getAttackCount } from '../../game/combat';
import { transitionWithoutCheckmate as applyAction } from '../simulate';
import { isLegalAction } from '../../game/legality';
import type { AIAction } from '../types';
import type { SearchBudget } from '../runtime';

export interface TacticalResult {
  status: 'proved' | 'disproved' | 'unknown';
  actions: AIAction[]; nodes: number;
  scope: 'current-act target removal; all moves/attacks';
}
export type TacticalSolver = (state: GameState, targetId: string, maxNodes: number, budget: SearchBudget) => TacticalResult;
const scope: TacticalResult['scope'] = 'current-act target removal; all moves/attacks';
interface Exports {
  memory: WebAssembly.Memory;
  abiVersion(): number; configureCatalogue(size: number): void; inputPtr(): number; cataloguePtr(): number; powersPtr(): number;
  outputPtr(): number; solve(target: number, maxNodes: number): number; nodes(): number; resultLength(): number;
}

/** No managed objects cross the ABI: one packed position in, one witness out. */
export async function instantiateTactics(bytes: BufferSource): Promise<TacticalSolver> {
  let activeBudget: SearchBudget | undefined;
  const { instance } = await WebAssembly.instantiate(bytes, { env: {
    shouldStop: () => activeBudget?.exhausted() ? 1 : 0,
    abort: () => { throw new Error('WASM tactical kernel trapped'); },
  } });
  const wasm = instance.exports as unknown as Exports;
  if (wasm.abiVersion() !== 7) throw new Error('Muju WASM ABI/catalogue mismatch');
  const defs = UNIT_DEFINITIONS;
  wasm.configureCatalogue(defs.length);
  return (state, targetId, maxNodes, budget) => {
    const unknown = (): TacticalResult => ({ status: 'unknown', actions: [], nodes: 0, scope });
    const units = state.board.units, player = state.turn.currentPlayer;
    const target = units.findIndex(u => u.id === targetId);
    if (state.upkeepPending || state.phase !== 'playing' || target < 0 || units.length > 100) return unknown();
    if (state.turn.phase !== 'action' || units[target].owner === player) return unknown();
    const catalog = new Int32Array(wasm.memory.buffer, wasm.cataloguePtr(), defs.length * 4);
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      catalog.set([d.attack, d.defense, d.speed, d.tier], i * 4);
    }
    const powers = new Int32Array(wasm.memory.buffer, wasm.powersPtr(), defs.length * defs.length);
    for (let a = 0; a < defs.length; a++) for (let b = 0; b < defs.length; b++) {
      // Refresh canonical stats and powers for lab catalogue/element/handicap knobs.
      powers[a * defs.length + b] = calculateAttackPower(
        { definitionId: defs[a].id, owner: player } as GameState['board']['units'][number],
        { definitionId: defs[b].id, owner: 'black' } as GameState['board']['units'][number]);
    }
    const input = new Int32Array(wasm.memory.buffer, wasm.inputPtr(), 1016); input.fill(0);
    input.set([7, units.length, player === 'white' ? 0 : 1, state.turn.actionsRemaining]);
    for (let i = 0; i < units.length; i++) {
      const u = units[i], offset = 16 + i * 10;
      input.set([u.position.y * 10 + u.position.x, u.owner === 'white' ? 0 : 1,
        defs.findIndex(d => d.id === u.definitionId), u.damageTaken,
        (u.canActThisTurn ? 1 : 0) | (u.lastAttackKilled ? 8 : 0)], offset);
      input[offset + 9] = getAttackCount(u);
      for (const id of u.attackedThisTurn ?? []) { const j = units.findIndex(v => v.id === id); if (j >= 0) input[offset + 5 + (j >> 5)] |= 1 << (j & 31); }
    }
    activeBudget = budget;
    let status: number;
    try { status = wasm.solve(target, maxNodes); } finally { activeBudget = undefined; }
    const nodes = wasm.nodes(); budget.stats.tacticalNodes += nodes; budget.stats.backend = 'wasm';
    if (status !== 1) return { status: status === 0 ? 'disproved' : 'unknown', actions: [], nodes, scope };
    const output = new Int32Array(wasm.memory.buffer, wasm.outputPtr(), wasm.resultLength() * 3);
    const actions: AIAction[] = []; let current = state;
    for (let i = 0; i < output.length; i += 3) {
      const kind = output[i], unitId = units[output[i + 1]].id, p = output[i + 2];
      const position = { x: p % 10, y: Math.floor(p / 10) };
      if (kind !== 1 && kind !== 2) throw new Error('WASM returned a non-Act witness');
      const action: AIAction = kind === 1 ? { type: 'MOVE', unitId, to: position }
        : { type: 'ATTACK', unitId, targetPosition: position };
      if (!isLegalAction(current, action)) throw new Error('WASM returned an illegal tactical witness');
      actions.push(action); current = applyAction(current, action);
    }
    if (current.board.units.some(u => u.id === targetId)) throw new Error('WASM witness did not remove target');
    return { status: 'proved', actions, nodes, scope };
  };
}

/** Safe optimistic bound, shared with the reference solver. */
export function canPossiblyRemove(state: GameState, targetId: string): boolean {
  const target = state.board.units.find(u => u.id === targetId); if (!target) return true;
  let power = 0, count = 0;
  for (const u of state.board.units) {
    if (u.owner !== state.turn.currentPlayer || !canAttack(u) || u.attackedThisTurn?.includes(targetId)) continue;
    const distance = Math.max(0, Math.abs(u.position.x - target.position.x) + Math.abs(u.position.y - target.position.y) - 1);
    if (movementActionCost(distance, getUnitDefinition(u.definitionId).speed) + 1 <= state.turn.actionsRemaining) {
      count++; power += calculateAttackPower(u, target);
    }
  }
  return count > 0 && power >= Math.max(0, getUnitDefinition(target.definitionId).defense - target.damageTaken);
}
