/** Read-only probe for the H2->Sachita question (gapfill 2026-09-14).
 * Run: node --import tsx docs/hard-ai/understand/gapfill-sachita-probe.ts
 * Writes nothing. */
import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getUnitDefinition, UNIT_DEFINITIONS } from '../../../src/game/units';
import { projectedIncome, getTotalBoardResources } from '../../../src/game/mining';
import { upkeepDue } from '../../../src/game/upkeep';
import { getAllSpawnPositions, getValidAnchors, getSpawnRectangle } from '../../../src/game/spawning';
import { getAffordablePurchases } from '../../../src/game/building';
import { getMoveCost } from '../../../src/game/movement';
import { calculateAttackPower, calculateDefense } from '../../../src/game/combat';
import { getCell, getAdjacentPositions, getUnitAt } from '../../../src/game/board';
import type { GameState, PlayerId, Position } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';

const sq = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
const parse = (s: string) => ({ x: s.charCodeAt(0) - 65, y: parseInt(s.slice(1), 10) - 1 });
const army = (s: GameState, p: PlayerId) => s.board.units.filter(u => u.owner === p);
const value = (s: GameState, p: PlayerId) => army(s, p).reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0);
const roster = (s: GameState, p: PlayerId) =>
  army(s, p).map(u => `${getUnitDefinition(u.definitionId).name}@${sq(u.position)}`).sort().join(' ');

function show(label: string, s: GameState) {
  console.log(`${label}\n  turn=${s.turn.turnNumber}${s.turn.currentPlayer} phase=${s.turn.phase} ap=${s.turn.actionsRemaining}` +
    ` | bank W=${s.players.white.resources} B=${s.players.black.resources}` +
    ` | income W=${projectedIncome(s, 'white')} B=${projectedIncome(s, 'black')}` +
    ` | upkeepDue W=${upkeepDue(s, 'white')} B=${upkeepDue(s, 'black')}` +
    ` | armyValue W=${value(s, 'white')} B=${value(s, 'black')} | boardCrystals=${getTotalBoardResources(s.board)}` +
    `\n  W: ${roster(s, 'white')}\n  B: ${roster(s, 'black')}`);
}

function run(s: GameState, actions: AIAction[], label: string, verbose = true): GameState {
  for (const a of actions) {
    const legal = isLegalAction(s, a);
    const apBefore = s.turn.actionsRemaining, bankBefore = s.players[s.turn.currentPlayer].resources;
    if (!legal) { console.log(`  !! ILLEGAL ${JSON.stringify(a)} in ${label}`); return s; }
    s = applyAction(s, a);
    if (verbose) console.log(`  ok ${a.type}${(a as any).definitionId ? ' ' + (a as any).definitionId : ''}` +
      `${(a as any).to ? ' ->' + sq((a as any).to) : ''}${(a as any).targetPosition ? ' @' + sq((a as any).targetPosition) : ''}` +
      `${(a as any).unitId ? ' [' + (a as any).unitId + ']' : ''}` +
      `  ap ${apBefore}->${s.turn.actionsRemaining}  bank ${bankBefore}->${s.players[s.turn.currentPlayer].resources}` +
      `  phase=${s.turn.phase}`);
  }
  return s;
}

const base = structuredClone(match.initialState) as GameState;

console.log('=== 0. resource grid at start of White turn 3 (rows 1..10, cols A..J) ===');
for (let y = 0; y < 10; y++) {
  const row: string[] = [];
  for (let x = 0; x < 10; x++) row.push(String(getCell(base.board, { x, y })!.resourceLayers).padStart(2));
  console.log(` ${String(y + 1).padStart(2)} | ${row.join(' ')}`);
}
console.log('    ' + ['A','B','C','D','E','F','G','H','I','J'].map(c => ' ' + c).join(' '));
show('\n=== 1. START (initialState = White turn 3, place phase) ===', base);
for (const u of base.board.units)
  console.log(`   ${u.owner} ${getUnitDefinition(u.definitionId).name}@${sq(u.position)} id=${u.id} cell=${getCell(base.board, u.position)!.resourceLayers}`);

console.log('\n=== 2. ACTUAL GAME: White rev6 then Black rev7 ===');
let actual = base;
for (const c of (match.commands as any[]).filter(c => c.revision === 6 || c.revision === 7)) {
  console.log(` -- rev ${c.revision} (${c.player})`);
  actual = run(actual, c.actions as AIAction[], `rev${c.revision}`);
  show(`  after rev ${c.revision}`, actual);
}

console.log('\n=== 3. WHAT-IF A: bare Sachita line (no purchases) ===');
let a = base;
a = run(a, [
  { type: 'PROMOTE_UNIT', unitId: 'unit-white-2-0' },
  { type: 'END_PLACE_PHASE' },
  { type: 'MOVE', unitId: 'unit-white-2-0', to: parse('H5') },
  { type: 'ATTACK', unitId: 'unit-white-2-0', targetPosition: parse('H6') },
], 'A');
show('  after White actions (before END_ACTION_PHASE)', a);
const aEnd = run(a, [{ type: 'END_ACTION_PHASE' }], 'A-end');
show('  after END_ACTION_PHASE (now Black turn 3)', aEnd);

console.log('\n=== 3b. WHAT-IF B: Sachita line + spend the remaining 6 (Muju@G2) ===');
let b = base;
b = run(b, [
  { type: 'PROMOTE_UNIT', unitId: 'unit-white-2-0' },
  { type: 'BUY_UNIT', definitionId: 'plant_1', position: parse('G2') },
  { type: 'END_PLACE_PHASE' },
  { type: 'MOVE', unitId: 'unit-white-2-0', to: parse('H5') },
  { type: 'ATTACK', unitId: 'unit-white-2-0', targetPosition: parse('H6') },
  { type: 'END_ACTION_PHASE' },
], 'B');
show('  after White turn 3 (variant B), now Black turn 3', b);

console.log('\n=== 3c. WHAT-IF C: promote + kill, but stop at H4 instead? (AP check) ===');
{
  let c = base;
  c = run(c, [
    { type: 'PROMOTE_UNIT', unitId: 'unit-white-2-0' },
    { type: 'END_PLACE_PHASE' },
    { type: 'MOVE', unitId: 'unit-white-2-0', to: parse('H4') },
  ], 'C', false);
  console.log(`  H2->H4 costs ${4 - c.turn.actionsRemaining} AP; attack from H4 on H5? adjacency to H6 = ${getMoveCost(parse('H4'), parse('H6'), 1, c.board)}`);
  console.log(`  legal attack H6 from H4: ${isLegalAction(c, { type: 'ATTACK', unitId: 'unit-white-2-0', targetPosition: parse('H6') })}`);
}

function blackReplyReport(s: GameState, tag: string) {
  console.log(`\n=== 4. BLACK REPLY ANALYSIS (${tag}) ===`);
  console.log(`  Black bank=${s.players.black.resources} ap=${s.turn.actionsRemaining} phase=${s.turn.phase} turn=${s.turn.turnNumber}${s.turn.currentPlayer}`);
  const anchors = getValidAnchors('black', s.board);
  for (const u of army(s, 'black')) {
    const rect = getSpawnRectangle({ x: 9, y: 9 }, u.position);
    const blockedBy = rect.map(p => getUnitAt(s.board, p)).filter(x => x && x.owner !== 'black');
    console.log(`  anchor candidate ${getUnitDefinition(u.definitionId).name}@${sq(u.position)}: rect ${rect.length} squares, valid=${anchors.some(x => x.id === u.id)}` +
      (blockedBy.length ? ` blockedBy=${blockedBy.map(x => sq(x!.position)).join(',')}` : ''));
  }
  const spawns = getAllSpawnPositions('black', s.board);
  console.log(`  legal spawn squares (${spawns.length}): ${spawns.map(sq).sort().join(' ')}`);
  const buys = getAffordablePurchases(s.players.black.resources);
  console.log(`  affordable purchases: ${buys.map(d => `${d.name}(${d.id},${d.cost}c,ATK${d.attack}/DEF${d.defense}/SPD${d.speed}/MINE${d.mining})`).join(' ')}`);

  const targets = army(s, 'white');
  for (const t of targets) {
    const tdef = getUnitDefinition(t.definitionId);
    console.log(`\n  --- target ${tdef.name}@${sq(t.position)} (DEF ${calculateDefense(t)}, cost ${tdef.cost}) ---`);
    // existing units
    for (const u of army(s, 'black')) {
      const udef = getUnitDefinition(u.definitionId);
      const power = calculateAttackPower(u, t);
      let bestCost: number | null = null, bestSq = '';
      for (const p of getAdjacentPositions(t.position)) {
        if (getUnitAt(s.board, p)) continue;
        const c = getMoveCost(u.position, p, udef.speed, s.board);
        if (c !== null && (bestCost === null || c < bestCost)) { bestCost = c; bestSq = sq(p); }
      }
      console.log(`    existing ${udef.name}@${sq(u.position)}: power ${power} vs def ${calculateDefense(t)} => ${power >= calculateDefense(t) ? 'KILL' : 'no kill'}` +
        `; approach ${bestCost === null ? 'unreachable' : `${bestCost} AP to ${bestSq}`}; total ${bestCost === null ? '-' : bestCost + 1} AP`);
    }
    // fresh purchases at every legal spawn square
    const rows: string[] = [];
    for (const d of buys) {
      let best: { total: number; from: string; at: string } | null = null;
      const fake = { id: 'x', definitionId: d.id, owner: 'black' as PlayerId, position: { x: 0, y: 0 }, hasMoved: false,
        hasAttacked: false, lastAttackKilled: false, canActThisTurn: true, damageTaken: 0, promotedThisPlacement: false, placedThisTurn: true };
      const power = calculateAttackPower(fake as any, t);
      if (power < calculateDefense(t)) { rows.push(`    buy ${d.name}: power ${power} < def ${calculateDefense(t)} => cannot one-shot`); continue; }
      for (const spawn of spawns) {
        // simulate the purchase so the new unit itself blocks/doesn't block
        const bought = applyAction(s, { type: 'BUY_UNIT', definitionId: d.id, position: spawn });
        if (bought === s) continue;
        const nu = getUnitAt(bought.board, spawn)!;
        for (const p of getAdjacentPositions(t.position)) {
          if (getUnitAt(bought.board, p) && !(p.x === spawn.x && p.y === spawn.y)) continue;
          const c = (p.x === spawn.x && p.y === spawn.y) ? 0 : getMoveCost(nu.position, p, d.speed, bought.board);
          if (c === null) continue;
          const total = c + 1;
          if (!best || total < best.total) best = { total, from: sq(spawn), at: sq(p) };
        }
      }
      rows.push(`    buy ${d.name} (${d.cost}c): power ${power} >= def ${calculateDefense(t)} => ` +
        (best ? `KILL in ${best.total} AP (spawn ${best.from}, strike from ${best.at})${best.total <= 4 ? '  <-- AFFORDABLE THIS TURN' : '  (too slow)'}` : 'no route'));
    }
    rows.forEach(r => console.log(r));
  }
}

blackReplyReport(aEnd, 'after what-if A');
blackReplyReport(b, 'after what-if B');
blackReplyReport(actual, 'after the ACTUAL White rev6 (control)');
