/** Continuations: each candidate White turn 3 + Black's best reply, through to White turn 4. */
import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getUnitDefinition } from '../../../src/game/units';
import { projectedIncome } from '../../../src/game/mining';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { getAffordablePurchases } from '../../../src/game/building';
import { getMoveCost } from '../../../src/game/movement';
import { calculateAttackPower, calculateDefense } from '../../../src/game/combat';
import { getAdjacentPositions, getUnitAt } from '../../../src/game/board';
import { damageUpperBound } from '../../../server/analysis/tactics';
import type { GameState, PlayerId, Position, Unit } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';

const sq = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
const parse = (s: string) => ({ x: s.charCodeAt(0) - 65, y: parseInt(s.slice(1), 10) - 1 });
const army = (s: GameState, p: PlayerId) => s.board.units.filter(u => u.owner === p);
const value = (s: GameState, p: PlayerId) => army(s, p).reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0);
const roster = (s: GameState, p: PlayerId) => army(s, p).map(u => `${getUnitDefinition(u.definitionId).name}@${sq(u.position)}`).sort().join(' ');

function killCost(s: GameState, u: Unit, t: Unit) {
  if (calculateAttackPower(u, t) < calculateDefense(t)) return null;
  let best: { ap: number; from: string } | null = null;
  for (const p of getAdjacentPositions(t.position)) {
    const occ = getUnitAt(s.board, p); if (occ && occ.id !== u.id) continue;
    const c = (p.x === u.position.x && p.y === u.position.y) ? 0 : getMoveCost(u.position, p, getUnitDefinition(u.definitionId).speed, s.board);
    if (c === null) continue; if (!best || c + 1 < best.ap) best = { ap: c + 1, from: sq(p) };
  } return best;
}
function killsAvailable(s: GameState, side: PlayerId) {
  const spawns = getAllSpawnPositions(side, s.board), cash = s.players[side].resources, out: string[] = [];
  for (const t of s.board.units.filter(u => u.owner !== side)) {
    for (const u of army(s, side)) { const k = killCost(s, u, t); if (k && k.ap <= 4) out.push(`${getUnitDefinition(u.definitionId).name}@${sq(u.position)} -> ${getUnitDefinition(t.definitionId).name}@${sq(t.position)} (${k.ap}AP from ${k.from})`); }
    for (const d of getAffordablePurchases(cash)) for (const p of spawns) {
      const st = applyAction(s, { type: 'BUY_UNIT', definitionId: d.id, position: p }); if (st === s) continue;
      const k = killCost(st, getUnitAt(st.board, p)!, st.board.units.find(x => x.id === t.id)!);
      if (k && k.ap <= 4) out.push(`BUY ${d.name}@${sq(p)} -> ${getUnitDefinition(t.definitionId).name}@${sq(t.position)} (${k.ap}AP from ${k.from})`);
    }
  }
  return [...new Set(out)];
}
function line(tag: string, s: GameState) {
  const mover = s.turn.currentPlayer;
  console.log(`  [${tag}] to move: ${mover} turn ${s.turn.turnNumber}`);
  console.log(`    W value=${value(s,'white')} bank=${s.players.white.resources} income=${projectedIncome(s,'white')} spawn=${getAllSpawnPositions('white', s.board).length} units=${army(s,'white').length}`);
  console.log(`    B value=${value(s,'black')} bank=${s.players.black.resources} income=${projectedIncome(s,'black')} spawn=${getAllSpawnPositions('black', s.board).length} units=${army(s,'black').length}`);
  console.log(`    W: ${roster(s,'white')}`);
  console.log(`    B: ${roster(s,'black')}`);
  const k = killsAvailable(s, mover);
  console.log(`    kills available to ${mover} now: ${k.length ? k.slice(0, 8).join(' | ') + (k.length > 8 ? ` | (+${k.length - 8} more)` : '') : 'NONE'}`);
  for (const t of s.board.units.filter(u => u.owner !== mover))
    console.log(`      damageUpperBound vs ${getUnitDefinition(t.definitionId).name}@${sq(t.position)} (DEF ${calculateDefense(t)}) = ${damageUpperBound(s, t, ['existing','promotion','purchase','combined'])}`);
}
function play(s: GameState, actions: AIAction[], tag: string) {
  for (const a of actions) { if (!isLegalAction(s, a)) { console.log(`   !! ILLEGAL ${tag}: ${JSON.stringify(a)} phase=${s.turn.phase} ap=${s.turn.actionsRemaining} bank=${s.players[s.turn.currentPlayer].resources}`); return s; } s = applyAction(s, a); }
  return s;
}
const base = structuredClone(match.initialState) as GameState;
const SACH = 'unit-white-2-0';
const rev = (n: number) => (match.commands as any[]).find(c => c.revision === n).actions as AIAction[];

console.log('### L0 ACTUAL (rev6 + rev7)');
let l0 = play(play(base, rev(6), 'rev6'), rev(7), 'rev7'); line('start White turn 4', l0);

console.log('\n### L2 SACHITA + Muju@G2, Black replies Muju@I10 + Hi@J10 recapture');
let l2 = play(base, [
  { type: 'PROMOTE_UNIT', unitId: SACH }, { type: 'BUY_UNIT', definitionId: 'plant_1', position: parse('G2') },
  { type: 'MOVE', unitId: SACH, to: parse('H5') }, { type: 'ATTACK', unitId: SACH, targetPosition: parse('H6') },
  { type: 'END_ACTION_PHASE' }], 'L2-white');
l2 = play(l2, [
  { type: 'BUY_UNIT', definitionId: 'fire_1', position: parse('I10') },
  { type: 'BUY_UNIT', definitionId: 'plant_1', position: parse('J10') },
  { type: 'MOVE', unitId: 'unit-black-3-0', to: parse('H6') },
  { type: 'ATTACK', unitId: 'unit-black-3-0', targetPosition: parse('H5') },
  { type: 'END_ACTION_PHASE' }], 'L2-black');
line('start White turn 4', l2);
console.log('  -- White turn 4 punisher check: buy Göl@G1 and hunt the Hi@H6');
let l2p = play(l2, [
  { type: 'BUY_UNIT', definitionId: 'shadow_1', position: parse('G1') },
  { type: 'MOVE', unitId: 'unit-white-4-0', to: parse('G6') },
  { type: 'ATTACK', unitId: 'unit-white-4-0', targetPosition: parse('H6') },
  { type: 'END_ACTION_PHASE' }], 'L2-white4');
line('start Black turn 4 (after White\'s Göl recapture)', l2p);

console.log('\n### L3 GÖL strike-and-retreat, Black replies with pure economy (Muju@I10 + Sjor@J10)');
let l3 = play(base, [
  { type: 'BUY_UNIT', definitionId: 'shadow_1', position: parse('G2') },
  { type: 'BUY_UNIT', definitionId: 'plant_1', position: parse('A1') },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H5') },
  { type: 'ATTACK', unitId: 'unit-white-3-0', targetPosition: parse('H6') },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H3') },
  { type: 'END_ACTION_PHASE' }], 'L3-white');
l3 = play(l3, [
  { type: 'BUY_UNIT', definitionId: 'plant_1', position: parse('I10') },
  { type: 'BUY_UNIT', definitionId: 'water_1', position: parse('J10') },
  { type: 'END_ACTION_PHASE' }], 'L3-black');
line('start White turn 4', l3);
