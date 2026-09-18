/** Checks on modelling claims the designs make. Read-only. */
import { UNEQUAL_ROUTES_MAP, MAX_RESOURCE_RESERVE } from '../../../../src/game/resourceMap';
import { UNIT_DEFINITIONS } from '../../../../src/game/units';
import { UPKEEP_BY_TIER } from '../../../../src/game/upkeep';
import { createInitialGameState } from '../../../../src/game/board';

const m = UNEQUAL_ROUTES_MAP;
const sym = m.every((v, i) => v === m[99 - i]);
const transpose = m.every((v, i) => v === m[(i % 10) * 10 + Math.floor(i / 10)]);
console.log(JSON.stringify({ total: m.reduce((a, b) => a + b, 0), rot180Symmetric: sym, transposeSymmetric: transpose, maxReserve: MAX_RESOURCE_RESERVE }));

// 180-degree image of the starting units
const s = createInitialGameState();
const key = (u: { position: { x: number; y: number }; definitionId: string; owner: string }) =>
  `${u.definitionId}@${u.position.y * 10 + u.position.x}:${u.owner}`;
const rot = (u: typeof s.board.units[number]) =>
  `${u.definitionId}@${99 - (u.position.y * 10 + u.position.x)}:${u.owner === 'white' ? 'black' : 'white'}`;
const a = s.board.units.map(key).sort().join('|');
const b = s.board.units.map(rot).sort().join('|');
console.log(JSON.stringify({ startPositionsRot180Symmetric: a === b }));

// PST_mine, no-rent (ET 5.4) and rent-charged H=6 (SU addendum)
function noRent(mine: number, reserve: number) {
  let r = reserve, v = 0;
  for (let t = 1; t <= 12; t++) { const take = Math.min(mine, r); r -= take; v += Math.pow(0.9, t) * take; }
  return v;
}
function withRent(mine: number, tier: number, reserve: number) {
  let r = reserve, v = 0;
  for (let t = 1; t <= 6; t++) { const take = Math.min(mine, r); r -= take; v += Math.pow(0.9, t) * take; }
  for (let t = 1; t <= 6; t++) v -= Math.pow(0.9, t) * (UPKEEP_BY_TIER[tier] ?? 0);
  return v;
}
const rows = ['fire_1','water_1','plant_1','plant_2','plant_3','metal_3'].map(id => {
  const d = UNIT_DEFINITIONS.find(u => u.id === id)!;
  return { id, mine: d.mining, tier: d.tier, noRent16: +noRent(d.mining, 16).toFixed(2), withRent16: +withRent(d.mining, d.tier, 16).toFixed(2) };
});
console.log(JSON.stringify(rows));

// max legal turn length for a generated turn (bank-driven upper bound on buys)
const cheapest = Math.min(...UNIT_DEFINITIONS.filter(d => d.tier === 1).map(d => d.cost));
console.log(JSON.stringify({ cheapestT1: cheapest, buysAt57Crystals: Math.floor(57 / cheapest), t1Prices: UNIT_DEFINITIONS.filter(d=>d.tier===1).map(d=>d.cost).sort() }));
