/** Replay a saved game without searching; expose legal buys vs heuristic filtering.
 * From muju/: node --import tsx lab/ai/diagnose-purchases.ts <replay.json> <seat>
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInitialGameState } from '../../src/game/board';
import { getAffordablePurchases } from '../../src/game/building';
import { getAllSpawnPositions } from '../../src/game/spawning';
import { isLegalAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { generatePlaceActions } from '../../src/ai/moves';
import { placementPlans } from '../../src/ai/planner/placement';
import { summonDisruptable } from '../../src/ai/planner/summons';
import type { AIAction } from '../../src/ai/types';

const [path, seat] = process.argv.slice(2);
if (!path || (seat !== 'white' && seat !== 'black')) throw new Error('Expected replay path and white|black');
const raw = readFileSync(path, 'utf8'), replay = JSON.parse(raw);
let state = createInitialGameState(undefined, 4, replay.meta.options.blackCrystalHandicap, 'phasing');
state.board.units.forEach((u, i) => { u.id = `initial-${i}`; });
state.victoryRule = replay.meta.options.victoryRule;
state.inactivityRule = replay.meta.options.inactivityRule;
const decisions = [];
for (const step of replay.steps.slice(1)) {
  if (!isLegalAction(state, step.action)) throw new Error(`Illegal replay action ${step.ply}`);
  if (state.turn.currentPlayer === seat && state.turn.phase === 'place' && !state.upkeepPending) {
    const legal = getAffordablePurchases(state.players[seat].resources).flatMap(def =>
      getAllSpawnPositions(seat, state.board).map(position => ({ type: 'BUY_UNIT' as const, definitionId: def.id, position })))
      .filter(a => isLegalAction(state, a));
    const generated = generatePlaceActions(state, seat), plans = placementPlans(state, seat);
    decisions.push({ ply: step.ply, turn: state.turn.turnNumber, bank: state.players[seat].resources,
      gained: state.players[seat].resourcesGained,
      legalBuys: legal.length, safeBuys: legal.filter(a => !summonDisruptable(state, seat, a.position)).length,
      generatedBuys: generated.length, placementPlans: plans.length,
      buyPlans: plans.filter(p => p.actions.some(a => a.type === 'BUY_UNIT')).length,
      chosen: step.action as AIAction });
  }
  state = applyAction(state, step.action);
}
console.log(JSON.stringify({ replay: path, replaySha256: createHash('sha256').update(raw).digest('hex'),
  seat, completedTurns: replay.meta.completedTurns, player: replay.meta.players[seat], decisions }, null, 2));
