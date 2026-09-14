/** Server-analysis verdicts on the H2->Sachita line (gapfill 2026-09-14). */
import match from '../../../tests/fixtures/codex-claude-2026-09-12.json';
import { evidence, singleThreats, searchTurn, replyTo, describeEvidence, damageUpperBound } from '../../../server/analysis/tactics';
import { WorkBudget } from '../../../server/analysis/core';
import { getUnitDefinition } from '../../../src/game/units';
import type { GameState, Position } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';

const parse = (s: string) => ({ x: s.charCodeAt(0) - 65, y: parseInt(s.slice(1), 10) - 1 });
const base = structuredClone(match.initialState) as GameState;
const SJOR = 'black_water_1_1789244664000_dv6x2';
const SACH = 'unit-white-2-0';

console.log('=== damageUpperBound: can WHITE remove the Sjor@H6 on turn 3? ===');
const sjor = base.board.units.find(u => u.id === SJOR)!;
for (const cats of [['existing'], ['promotion'], ['purchase'], ['combined']] as any[])
  console.log(`  categories=${cats.join('+')} -> ${damageUpperBound(base, sjor, cats)} (Sjor DEF 2)`);

console.log('\n=== searchTurn(killTarget = Sjor@H6, combined) : the engine finds its own cheapest kill ===');
{
  const b = new WorkBudget(400000, 60000);
  const r = searchTurn(base, b, { targetId: SJOR, categories: ['combined'], objective: 'killTarget' });
  console.log('  proof:', r.proof, 'nodes', r.search.nodes, 'completeness', r.search.completeness);
  if (r.best) console.log('  witness:', JSON.stringify(describeEvidence(base, r.best, SJOR, false), null, 1));
}

console.log('\n=== singleThreats(target = Sjor@H6) : every one-attacker kill, ranked by crystals then AP ===');
{
  const b = new WorkBudget(400000, 60000);
  const r = singleThreats(base, SJOR, ['existing', 'promotion', 'purchase'], b, Infinity, true);
  console.log(`  ${r.lines.length} lethal lines, complete=${r.complete}`);
  for (const l of r.lines.slice(0, 10)) {
    const d = describeEvidence(base, l, SJOR, false);
    console.log(`   ${d.category}  ${d.line}  spent=${d.crystalsSpent}c ap=${d.actionsSpent} apLeft=${d.actionsRemaining}`);
  }
}

console.log('\n=== replyTo(): Black\'s answer to each White kill line ===');
function judge(name: string, actions: AIAction[]) {
  const line = evidence(base, actions, SJOR);
  const b = new WorkBudget(400000, 60000);
  const r: any = replyTo(line, b, true, 5000);
  console.log(`  ${name}`);
  console.log(`    White line: ap=${line.ap} crystals=${line.crystals} lethal=${line.lethal} attackerEnds=${line.after.board.units.find(u=>u.id===line.attackerId)?.position ? JSON.stringify(line.after.board.units.find(u=>u.id===line.attackerId)!.position) : 'n/a'}`);
  console.log(`    Black reply proof: ${r.proof}`);
  if (r.capture) console.log(`    Black's best capture: ${r.capture.line} | crystalsSpent=${r.capture.crystalsSpent} ap=${r.capture.actionsSpent} retreatSquares=${r.capture.retreat?.count ?? '-'}`);
  if (r.reason) console.log(`    reason: ${r.reason}`);
  console.log(`    search: ${JSON.stringify(r.search)}`);
}
judge('SACHITA promote + walk H5 + kill H6', [
  { type: 'PROMOTE_UNIT', unitId: SACH }, { type: 'END_PLACE_PHASE' },
  { type: 'MOVE', unitId: SACH, to: parse('H5') }, { type: 'ATTACK', unitId: SACH, targetPosition: parse('H6') }]);
judge('GÖL@G2 buy + walk H5 + kill H6 (no retreat)', [
  { type: 'BUY_UNIT', definitionId: 'shadow_1', position: parse('G2') }, { type: 'END_PLACE_PHASE' },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H5') }, { type: 'ATTACK', unitId: 'unit-white-3-0', targetPosition: parse('H6') }]);
judge('GÖL@G2 buy + walk H5 + kill H6 + RETREAT H3', [
  { type: 'BUY_UNIT', definitionId: 'shadow_1', position: parse('G2') }, { type: 'END_PLACE_PHASE' },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H5') }, { type: 'ATTACK', unitId: 'unit-white-3-0', targetPosition: parse('H6') },
  { type: 'MOVE', unitId: 'unit-white-3-0', to: parse('H3') }]);

console.log('\n=== searchTurn witness, full steps ===');
{
  const b = new WorkBudget(400000, 60000);
  const r = searchTurn(base, b, { targetId: SJOR, categories: ['combined'], objective: 'killTarget' });
  if (r.best) console.log(JSON.stringify(describeEvidence(base, r.best, SJOR, true).witness, null, 1));
}
console.log('\n=== best Göl line, full (retreat squares) ===');
{
  const b = new WorkBudget(400000, 60000);
  const r = singleThreats(base, SJOR, ['purchase'], b, Infinity, true);
  const d: any = describeEvidence(base, r.lines[0], SJOR, true);
  console.log(' witness:', JSON.stringify(d.witness));
  console.log(' retreat:', JSON.stringify(d.retreat));
}
console.log('\n=== objective blockPurchases: can White reduce Black to zero spawn squares this turn? ===');
{
  const b = new WorkBudget(400000, 30000);
  const r = searchTurn(base, b, { categories: ['combined'], objective: 'blockPurchases', quota: 20000 });
  console.log('  proof', r.proof, 'bestScore', r.bestScore, 'nodes', r.search.nodes, 'completeness', r.search.completeness);
  if (r.best) console.log('  witness:', JSON.stringify(describeEvidence(base, r.best, undefined, false).line));
}
