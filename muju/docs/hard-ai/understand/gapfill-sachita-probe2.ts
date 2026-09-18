/** Exhaustive turn-3 kill enumeration + Black reply search (gapfill 2026-09-14).
 * Run: node --import tsx docs/hard-ai/understand/gapfill-sachita-probe2.ts */
import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getUnitDefinition, UNIT_DEFINITIONS } from '../../../src/game/units';
import { projectedIncome } from '../../../src/game/mining';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { getAffordablePurchases } from '../../../src/game/building';
import { getMoveCost } from '../../../src/game/movement';
import { calculateAttackPower, calculateDefense } from '../../../src/game/combat';
import { getCell, getAdjacentPositions, getUnitAt } from '../../../src/game/board';
import type { GameState, PlayerId, Position, Unit } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';

const sq = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
const parse = (s: string) => ({ x: s.charCodeAt(0) - 65, y: parseInt(s.slice(1), 10) - 1 });
const army = (s: GameState, p: PlayerId) => s.board.units.filter(u => u.owner === p);
const value = (s: GameState, p: PlayerId) => army(s, p).reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0);
const roster = (s: GameState, p: PlayerId) =>
  army(s, p).map(u => `${getUnitDefinition(u.definitionId).name}@${sq(u.position)}`).sort().join(' ');
const T1 = UNIT_DEFINITIONS.filter(d => d.tier === 1);

const base = structuredClone(match.initialState) as GameState;
const SJOR = 'black_water_1_1789244664000_dv6x2';

/** Minimum actions for `unit` to kill `target` on `board` (approach + 1), or null. */
function killCost(s: GameState, u: Unit, t: Unit): { ap: number; from: string } | null {
  if (calculateAttackPower(u, t) < calculateDefense(t)) return null;
  let best: { ap: number; from: string } | null = null;
  for (const p of getAdjacentPositions(t.position)) {
    const occ = getUnitAt(s.board, p);
    if (occ && occ.id !== u.id) continue;
    const c = (p.x === u.position.x && p.y === u.position.y) ? 0
      : getMoveCost(u.position, p, getUnitDefinition(u.definitionId).speed, s.board);
    if (c === null) continue;
    if (!best || c + 1 < best.ap) best = { ap: c + 1, from: sq(p) };
  }
  return best;
}

console.log('=== A. EVERY White turn-3 way to kill the Black Sjor@H6 (exhaustive over <=2 buys x all spawn squares, +/- promotion) ===');
console.log('   White bank 10, 4 AP. "spare" = AP left after the kill (>=1 means a retreat action exists).');
type Plan = { label: string; crystals: number; ap: number; spare: number; buys: string[]; promote: string | null; attacker: string; from: string };
const plans: Plan[] = [];
const spawns0 = getAllSpawnPositions('white', base.board);
console.log(`   White legal spawn squares (${spawns0.length}): ${spawns0.map(p => `${sq(p)}[${getCell(base.board, p)!.resourceLayers}]`).sort().join(' ')}`);

function enumerate(s: GameState, buys: string[], promoted: string | null) {
  const target = s.board.units.find(u => u.id === SJOR)!;
  for (const u of army(s, 'white')) {
    const k = killCost(s, u, target);
    if (!k || k.ap > 4) continue;
    const def = getUnitDefinition(u.definitionId);
    plans.push({ label: `${def.name}@${sq(u.position)}`, crystals: 10 - s.players.white.resources, ap: k.ap,
      spare: 4 - k.ap, buys: [...buys], promote: promoted, attacker: u.id, from: k.from });
  }
}
enumerate(base, [], null);
// single promotion
for (const u of army(base, 'white')) {
  const st = applyAction(base, { type: 'PROMOTE_UNIT', unitId: u.id });
  if (st === base) continue;
  enumerate(st, [], `${getUnitDefinition(u.definitionId).name}@${sq(u.position)}`);
  // promotion + one buy
  for (const d of getAffordablePurchases(st.players.white.resources))
    for (const p of getAllSpawnPositions('white', st.board)) {
      const st2 = applyAction(st, { type: 'BUY_UNIT', definitionId: d.id, position: p });
      if (st2 !== st) enumerate(st2, [`${d.name}@${sq(p)}`], `${getUnitDefinition(u.definitionId).name}@${sq(u.position)}`);
    }
}
// one and two buys
for (const d1 of T1) for (const p1 of spawns0) {
  const s1 = applyAction(base, { type: 'BUY_UNIT', definitionId: d1.id, position: p1 });
  if (s1 === base) continue;
  enumerate(s1, [`${d1.name}@${sq(p1)}`], null);
  for (const d2 of getAffordablePurchases(s1.players.white.resources)) for (const p2 of getAllSpawnPositions('white', s1.board)) {
    const s2 = applyAction(s1, { type: 'BUY_UNIT', definitionId: d2.id, position: p2 });
    if (s2 !== s1) enumerate(s2, [`${d1.name}@${sq(p1)}`, `${d2.name}@${sq(p2)}`], null);
  }
}
// dedupe by (attacker identity kind, ap, crystals, buys/promote)
const seen = new Set<string>();
const uniq = plans.filter(p => { const k = `${p.label}|${p.ap}|${p.crystals}|${p.promote}|${p.buys.join(',')}`; return !seen.has(k) && seen.add(k); })
  .sort((a, b) => a.ap - b.ap || a.crystals - b.crystals);
console.log(`   ${plans.length} raw plans, ${uniq.length} distinct. Cheapest-AP first:`);
for (const p of uniq.slice(0, 40))
  console.log(`   ap=${p.ap} spare=${p.spare} crystalsSpent=${p.crystals} attacker=${p.label} strikeFrom=${p.from} promote=${p.promote ?? '-'} buys=[${p.buys.join(' ')}]`);
const byAp = new Map<number, number>(); for (const p of uniq) byAp.set(p.ap, (byAp.get(p.ap) ?? 0) + 1);
console.log(`   distinct plans by AP: ${[...byAp].sort().map(([k, v]) => `${k}AP:${v}`).join(' ')}`);
const minAp = Math.min(...uniq.map(p => p.ap));
console.log(`   MIN AP over all kill plans = ${minAp}; attackers achieving it: ${[...new Set(uniq.filter(p => p.ap === minAp).map(p => p.label))].join(', ')}`);
console.log(`   distinct attacker types over all plans: ${[...new Set(uniq.map(p => p.label.split('@')[0]))].join(', ')}`);

/** Black's best reply: every kill available within 4 AP, purchases included. */
function blackBest(s: GameState, tag: string) {
  const spawns = getAllSpawnPositions('black', s.board);
  const cash = s.players.black.resources;
  console.log(`\n   [Black reply @${tag}] bank=${cash} spawnSquares(${spawns.length})=${spawns.map(sq).sort().join(' ')}`);
  const hits: string[] = [];
  for (const t of army(s, 'white')) {
    for (const u of army(s, 'black')) {
      const k = killCost(s, u, t);
      if (k && k.ap <= 4) hits.push(`existing ${getUnitDefinition(u.definitionId).name}@${sq(u.position)} kills ${getUnitDefinition(t.definitionId).name}@${sq(t.position)} in ${k.ap} AP (from ${k.from})`);
    }
    for (const d of getAffordablePurchases(cash)) for (const p of spawns) {
      const st = applyAction(s, { type: 'BUY_UNIT', definitionId: d.id, position: p });
      if (st === s) continue;
      const nu = getUnitAt(st.board, p)!;
      const tt = st.board.units.find(x => x.id === t.id)!;
      const k = killCost(st, nu, tt);
      if (k && k.ap <= 4) hits.push(`BUY ${d.name}(${d.cost}c)@${sq(p)} kills ${getUnitDefinition(t.definitionId).name}@${sq(t.position)} in ${k.ap} AP (from ${k.from})`);
    }
  }
  const dedup = [...new Set(hits)];
  if (!dedup.length) console.log('     NO Black kill is available anywhere on the board within 4 AP.');
  else dedup.forEach(h => console.log('     ' + h));
  return dedup;
}

function summarize(tag: string, s: GameState) {
  console.log(`   [${tag}] W value=${value(s,'white')} bank=${s.players.white.resources} income=${projectedIncome(s,'white')} spawn=${getAllSpawnPositions('white', s.board).length}` +
    ` || B value=${value(s,'black')} bank=${s.players.black.resources} income=${projectedIncome(s,'black')} spawn=${getAllSpawnPositions('black', s.board).length}`);
  console.log(`      W: ${roster(s,'white')}\n      B: ${roster(s,'black')}`);
}

function play(s: GameState, actions: AIAction[], tag: string): GameState {
  for (const a of actions) {
    if (!isLegalAction(s, a)) { console.log(`     !! ILLEGAL in ${tag}: ${JSON.stringify(a)} (phase=${s.turn.phase} ap=${s.turn.actionsRemaining} bank=${s.players[s.turn.currentPlayer].resources})`); return s; }
    s = applyAction(s, a);
  }
  return s;
}

console.log('\n=== B. FOUR CANDIDATE WHITE TURN 3s, each followed by Black\'s best reply ===');
const SACH = 'unit-white-2-0';
const lines: { name: string; actions: AIAction[] }[] = [
  { name: 'L0 ACTUAL (rev6): buy Muju@G2 + Sjor@H1, Muju A2->A1', actions: (match.commands as any[]).find(c => c.revision === 6).actions },
  { name: 'L1 SACHITA bare: promote H2, walk H5, kill H6', actions: [
      { type: 'PROMOTE_UNIT', unitId: SACH }, { type: 'END_PLACE_PHASE' },
      { type: 'MOVE', unitId: SACH, to: parse('H5') }, { type: 'ATTACK', unitId: SACH, targetPosition: parse('H6') },
      { type: 'END_ACTION_PHASE' } ] },
  { name: 'L2 SACHITA + Muju@G2 (spend the change)', actions: [
      { type: 'PROMOTE_UNIT', unitId: SACH }, { type: 'BUY_UNIT', definitionId: 'plant_1', position: parse('G2') },
      { type: 'MOVE', unitId: SACH, to: parse('H5') }, { type: 'ATTACK', unitId: SACH, targetPosition: parse('H6') },
      { type: 'END_ACTION_PHASE' } ] },
  { name: 'L3 GOL strike-and-retreat: buy Gol@G2 + Muju@A1, G2->H5, kill H6, retreat H3', actions: [
      { type: 'BUY_UNIT', definitionId: 'shadow_1', position: parse('G2') },
      { type: 'BUY_UNIT', definitionId: 'plant_1', position: parse('A1') },
      { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H5') },
      { type: 'ATTACK', unitId: 'unit-white-3-0', targetPosition: parse('H6') },
      { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H3') },
      { type: 'END_ACTION_PHASE' } ] },
  { name: 'L4 GOL + promote H2->Sachita (keep the miner home)', actions: [
      { type: 'BUY_UNIT', definitionId: 'shadow_1', position: parse('G2') },
      { type: 'PROMOTE_UNIT', unitId: SACH },
      { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H5') },
      { type: 'ATTACK', unitId: 'unit-white-3-0', targetPosition: parse('H6') },
      { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H3') },
      { type: 'END_ACTION_PHASE' } ] },
];
for (const line of lines) {
  console.log(`\n-- ${line.name}`);
  const after = play(base, line.actions as AIAction[], line.name);
  if (after === base) continue;
  summarize('start of Black turn 3', after);
  blackBest(after, line.name);
}
